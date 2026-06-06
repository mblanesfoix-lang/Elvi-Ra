#!/usr/bin/env python3
"""
OPHS Framework — Actualización diaria automática
=================================================
Ejecutar cada día a las 08:00 (los datos de ayer ya están consolidados en ESIOS).

Configuración cron (Linux):
  crontab -e
  0 8 * * * /usr/bin/python3 /ruta/ophs_esios/cron_daily.py >> /var/log/ophs_esios.log 2>&1

O con systemd timer / cualquier scheduler.
"""

import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

# Añadir el directorio del módulo al path
sys.path.insert(0, str(Path(__file__).parent))

from esios_connector import actualizar_hoy, calcular_desperdicio_anual, exportar_json

DATA_DIR = os.getenv("OPHS_DATA_DIR", "./data")


def main():
    print(f"\n[{date.today()}] OPHS-ESIOS — Actualización diaria iniciada")

    # 1. Datos de ayer
    resultado_ayer = actualizar_hoy(output_dir=DATA_DIR)
    print(f"  Ayer ({resultado_ayer.get('fecha')}): "
          f"{resultado_ayer.get('exceso_gwh', 0):.3f} GWh desperdiciados | "
          f"{resultado_ayer.get('horas_precio_cero', 0)} horas a precio 0€")

    # 2. Si es 1 de enero → generar resumen del año anterior completo
    hoy = date.today()
    if hoy.month == 1 and hoy.day == 1:
        anio_anterior = hoy.year - 1
        print(f"\n  Generando resumen anual {anio_anterior}...")
        resumen = calcular_desperdicio_anual(anio_anterior)
        exportar_json(resumen, f"{DATA_DIR}/resumen_{anio_anterior}.json")
        print(f"  ✓ Total {anio_anterior}: {resumen.get('total_gwh_desperdiciados')} GWh")

    print(f"  ✓ Actualización completada\n")


if __name__ == "__main__":
    main()
