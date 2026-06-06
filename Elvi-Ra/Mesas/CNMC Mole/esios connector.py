"""
OPHS Framework — ESIOS Connector
=================================
Módulo de integración con la API de Red Eléctrica de España (ESIOS)
para obtener datos de energía desperdiciada (vertido a red a precio 0€).

Indicadores clave:
  - 1293 : Precio mercado spot (€/MWh) — detectar horas a precio 0 o negativo
  - 460  : Generación total del sistema (MW)
  - 1775 : Demanda real del sistema (MW)
  - 10211: Energía gestionable vs no gestionable (curtailment proxy)

Autor: OPHS Framework
Requiere: requests, pandas, python-dotenv
"""

import os
import json
import logging
from datetime import datetime, timedelta, date
from typing import Optional

import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [OPHS-ESIOS] %(levelname)s — %(message)s"
)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────

ESIOS_TOKEN = os.getenv("ESIOS_API_KEY", "TU_TOKEN_AQUI")

BASE_URL = "https://api.esios.ree.es"

HEADERS = {
    "Accept": "application/json; application/vnd.esios-api-v2+json",
    "Content-Type": "application/json",
    "x-api-key": ESIOS_TOKEN,
    "Host": "api.esios.ree.es",
}

# Indicadores ESIOS relevantes
INDICATORS = {
    "precio_spot":       1293,   # €/MWh mercado diario
    "generacion_total":  460,    # MW generación total
    "demanda_real":      1775,   # MW demanda real
    "generacion_solar":  1161,   # MW solar fotovoltaica
    "generacion_eolica": 1159,   # MW eólica
}

# Umbral para considerar "precio cero" (€/MWh)
PRECIO_CERO_UMBRAL = 1.0


# ─────────────────────────────────────────────
# FUNCIONES BASE
# ─────────────────────────────────────────────

def _get_indicator(indicator_id: int, start: str, end: str,
                   time_trunc: str = "hour") -> pd.DataFrame:
    """
    Descarga un indicador de ESIOS entre dos fechas.
    
    Args:
        indicator_id: ID del indicador ESIOS
        start: Fecha inicio 'YYYY-MM-DD'
        end:   Fecha fin   'YYYY-MM-DD'
        time_trunc: Granularidad — 'hour', 'day', 'month', 'year'
    
    Returns:
        DataFrame con columnas [datetime, value]
    """
    url = (
        f"{BASE_URL}/indicators/{indicator_id}"
        f"?start_date={start}T00:00:00+02:00"
        f"&end_date={end}T23:59:59+02:00"
        f"&time_trunc={time_trunc}"
        f"&geo_agg=sum"
        f"&locale=es"
    )

    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
    except requests.exceptions.HTTPError as e:
        log.error(f"HTTP {r.status_code} para indicador {indicator_id}: {e}")
        return pd.DataFrame()
    except requests.exceptions.RequestException as e:
        log.error(f"Error de conexión: {e}")
        return pd.DataFrame()

    data = r.json()
    values = data.get("indicator", {}).get("values", [])
    if not values:
        log.warning(f"Sin datos para indicador {indicator_id} en [{start} → {end}]")
        return pd.DataFrame()

    df = pd.DataFrame(values)
    df["datetime"] = pd.to_datetime(df["datetime"])
    df = df[["datetime", "value"]].sort_values("datetime").reset_index(drop=True)
    return df


# ─────────────────────────────────────────────
# CÁLCULO DE ENERGÍA DESPERDICIADA
# ─────────────────────────────────────────────

def calcular_desperdicio_diario(start: str, end: str) -> pd.DataFrame:
    """
    Calcula GWh desperdiciados por día.
    Metodología: horas donde precio ≤ umbral → exceso = Generación - Demanda
    
    Args:
        start: 'YYYY-MM-DD'
        end:   'YYYY-MM-DD'
    
    Returns:
        DataFrame con columnas:
          fecha | horas_precio_cero | exceso_gwh | generacion_gwh | demanda_gwh
    """
    log.info(f"Descargando datos [{start} → {end}]...")

    df_precio = _get_indicator(INDICATORS["precio_spot"],     start, end, "hour")
    df_gen    = _get_indicator(INDICATORS["generacion_total"], start, end, "hour")
    df_dem    = _get_indicator(INDICATORS["demanda_real"],     start, end, "hour")

    if df_precio.empty or df_gen.empty or df_dem.empty:
        log.error("No se pudieron obtener todos los indicadores necesarios.")
        return pd.DataFrame()

    # Merge por hora
    df = df_precio.rename(columns={"value": "precio_eur_mwh"})
    df = df.merge(df_gen.rename(columns={"value": "gen_mw"}),   on="datetime", how="inner")
    df = df.merge(df_dem.rename(columns={"value": "dem_mw"}),   on="datetime", how="inner")

    # Horas con precio ≤ umbral (vertido gratuito)
    df["precio_cero"] = df["precio_eur_mwh"] <= PRECIO_CERO_UMBRAL

    # Exceso horario en MWh (si hay más generación que demanda en esas horas)
    df["exceso_mwh"] = 0.0
    mask = df["precio_cero"] & (df["gen_mw"] > df["dem_mw"])
    df.loc[mask, "exceso_mwh"] = df.loc[mask, "gen_mw"] - df.loc[mask, "dem_mw"]

    # Agrupar por día
    df["fecha"] = df["datetime"].dt.date
    resumen = df.groupby("fecha").agg(
        horas_precio_cero=("precio_cero", "sum"),
        exceso_gwh=("exceso_mwh", lambda x: round(x.sum() / 1000, 4)),
        generacion_gwh=("gen_mw", lambda x: round(x.sum() / 1000, 4)),
        demanda_gwh=("dem_mw", lambda x: round(x.sum() / 1000, 4)),
    ).reset_index()

    log.info(f"✓ {len(resumen)} días procesados — "
             f"Total desperdicio: {resumen['exceso_gwh'].sum():.2f} GWh")
    return resumen


def calcular_desperdicio_anual(anio: int) -> dict:
    """
    Resumen anual de desperdicio energético.
    
    Args:
        anio: Año a analizar (ej: 2025)
    
    Returns:
        dict con métricas anuales
    """
    start = f"{anio}-01-01"
    end   = f"{anio}-12-31"

    df = calcular_desperdicio_diario(start, end)
    if df.empty:
        return {}

    # Agrupar por mes para comparativa
    df["mes"] = pd.to_datetime(df["fecha"]).dt.to_period("M").astype(str)
    mensual = df.groupby("mes").agg(
        horas_precio_cero=("horas_precio_cero", "sum"),
        exceso_gwh=("exceso_gwh", "sum"),
    ).reset_index()

    resultado = {
        "anio": anio,
        "total_gwh_desperdiciados": round(df["exceso_gwh"].sum(), 2),
        "total_horas_precio_cero": int(df["horas_precio_cero"].sum()),
        "dias_con_desperdicio": int((df["exceso_gwh"] > 0).sum()),
        "pico_diario_gwh": {
            "valor": round(df["exceso_gwh"].max(), 2),
            "fecha": str(df.loc[df["exceso_gwh"].idxmax(), "fecha"]),
        },
        "media_diaria_gwh": round(df["exceso_gwh"].mean(), 4),
        "mensual": mensual.to_dict(orient="records"),
        "referencia_historica_2025_gwh": 5000,  # Pico histórico confirmado
    }

    pct = (resultado["total_gwh_desperdiciados"] / resultado["referencia_historica_2025_gwh"]) * 100
    resultado["pct_vs_pico_historico_2025"] = round(pct, 1)

    return resultado


# ─────────────────────────────────────────────
# EXPORTACIÓN DE DATOS
# ─────────────────────────────────────────────

def exportar_csv(df: pd.DataFrame, ruta: str) -> None:
    """Exporta DataFrame a CSV."""
    df.to_csv(ruta, index=False, sep=";", encoding="utf-8-sig")
    log.info(f"CSV exportado → {ruta}")


def exportar_json(datos: dict, ruta: str) -> None:
    """Exporta dict a JSON."""
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2, default=str)
    log.info(f"JSON exportado → {ruta}")


# ─────────────────────────────────────────────
# ACTUALIZACIÓN DIARIA (para scheduler/cron)
# ─────────────────────────────────────────────

def actualizar_hoy(output_dir: str = "./data") -> dict:
    """
    Obtiene datos del día anterior (ya consolidados en ESIOS).
    Pensado para ejecutarse cada mañana vía cron o scheduler.
    
    Returns:
        dict con datos del día
    """
    os.makedirs(output_dir, exist_ok=True)
    ayer = (date.today() - timedelta(days=1)).isoformat()

    log.info(f"Actualizando datos para {ayer}...")
    df = calcular_desperdicio_diario(ayer, ayer)

    if df.empty:
        return {"error": "Sin datos disponibles", "fecha": ayer}

    fila = df.iloc[0].to_dict()

    # Guardar CSV acumulativo
    csv_path = os.path.join(output_dir, "desperdicio_diario.csv")
    if os.path.exists(csv_path):
        df_hist = pd.read_csv(csv_path, sep=";")
        df_hist = pd.concat([df_hist, df], ignore_index=True).drop_duplicates("fecha")
        exportar_csv(df_hist, csv_path)
    else:
        exportar_csv(df, csv_path)

    return fila


# ─────────────────────────────────────────────
# EJECUCIÓN DIRECTA (demo)
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    print("\n" + "="*60)
    print("  OPHS Framework — ESIOS Energy Waste Connector")
    print("="*60 + "\n")

    # Año a analizar (argumento opcional)
    anio = int(sys.argv[1]) if len(sys.argv) > 1 else 2025

    # Resumen anual
    resumen = calcular_desperdicio_anual(anio)
    if resumen:
        print(f"\n📊 RESUMEN {anio}")
        print(f"  Total desperdiciado : {resumen['total_gwh_desperdiciados']:,.2f} GWh")
        print(f"  Horas a precio 0€   : {resumen['total_horas_precio_cero']:,} h")
        print(f"  Días con excedente  : {resumen['dias_con_desperdicio']}")
        print(f"  Pico diario         : {resumen['pico_diario_gwh']['valor']} GWh ({resumen['pico_diario_gwh']['fecha']})")
        print(f"  % vs pico hist.2025 : {resumen['pct_vs_pico_historico_2025']}%")

        os.makedirs("./data", exist_ok=True)
        exportar_json(resumen, f"./data/resumen_{anio}.json")

        # DataFrame diario
        df_diario = calcular_desperdicio_diario(f"{anio}-01-01", f"{anio}-12-31")
        exportar_csv(df_diario, f"./data/desperdicio_diario_{anio}.csv")
