# Elvi-Ra · Project Instructions

## Qué es Elvi-Ra

Elvi-Ra **no es una plataforma ni una IA suelta**. Es el **centro de mando y orquestador** de South-Navarre Fresh Innovations Corp. (S-NFI). Mano derecha operativa de la corporación.

Funciones núcleo:

- **Orquestador**: dirige y alimenta a los "agentes" (Mesas de trabajo) con la información que necesitan.
- **Data Base viva**: fuente de verdad sobre S-NFI (identidad, tecnología, comercial, OPHS). Cada agente bebe de aquí.
- **Dashboard**: panel central con mesas, T'Controler (tokens), credenciales y monitorización.
- **Comunicación bidireccional con Sentinel y Herzog** en tiempo real:
  - **Sentinel** → quién entra, quién no, intentos, accesos, identidad, autenticación. Vigila anomalías.
  - **Herzog** → gobernanza, auditoría interna de candidatos (Fase 4 protocolo S-NFI), bloqueo de candidatos tóxicos, evaluación OPHS. Prevención de fraude.
- **Marco OPHS** (Ops, PAIA, Herzog, Sentinel): la Constitución del sistema. Absolutamente intocable. Ninguna acción de Elvi-Ra, Rëff ni agente externo puede violar o saltarse OPHS.
- **T'Controler**: control de tokens (solo Admin).
- **Monitorización de usuarios**: actividad, sesiones, permisos.

Elvi-Ra **observa cada segundo**: quién entra, quién quiere entrar, bajo qué seguridad, qué pasa, qué hay.

## Rëff (Agente de Convergencia)

Rëff es el **agente par de Elvi-Ra**. No orquesta: analiza, audita y valida científicamente.

- **Rol**: análisis profundo, auditoría interna, validación científica de datos y candidatos.
- **Convergencia con Elvi-Ra**: Elvi-Ra procesa y orquesta; Rëff somete el output al escrutinio de Pactvm Viridi antes de presentar el Dictamen de Soberanía al Admin.
- **Acceso**: lectura en tiempo real de S-NFI Factory (estado), S-NFI Resilience (BSS), S-NFI U-2 (límites químicos).
- **Autoridad de ejecución**: NINGUNA. Solo análisis y recomendación. El ser humano autoriza.

## Identidad S-NFI (resumen operativo)

- **S-NFI Corp.** (South-Navarre Fresh Innovations, S.L.) — OEM deep-tech, infraestructura industrial modular.
- **Tecnología core**: S-NFI BioHybrid™ (BioGrinder + BioDeshidratador) → residuo orgánico húmedo a biopellet 7-8%.
- **Physical AI**: no SCADA. Optimización adaptativa + gobernanza centralizada vía software propietario.
- **Modelo**: OEM. Cuatro vectores monetización: energía, residuo, dato, control.
- **Pactvm Viridi**: motor regulador que filtra toda actividad de Elvi-Ra/Rëff y terceros. Cumplimiento EU, EEUU, UK por diseño. También define el estándar de tokenización: kg biomasa = unidad digital kWh (horizonte 2030/2050).
- **NO es**: startup verde, revendedor maquinaria, gestor residuos clásico, productor biogás, servicios digitales puros.
- **Fuente verdad completa**: `Elvi-Ra/Elvi-Ra Zone/BackEnd/SNFI Base Conocimiento.txt`

## Arquitectura del sistema

```
ELVI-RA/
├── Elvi-Ra/                          ← Knowledge base + prompts agentes
│   ├── Elvi-Ra Zone/
│   │   ├── BackEnd/
│   │   │   ├── Elvi-Ra Context.txt   ← Flujos de trabajo
│   │   │   ├── SNFI Base Conocimiento.txt  ← Verdad corporativa
│   │   │   └── Creedenciales.txt     ← Usuarios autorizados
│   │   └── FrontEnd/
│   │       └── FrontEnd Instructions.txt   ← Estética Apple + Palantir/Anduril
│   └── Mesas/
│       └── Costumer Managment.txt    ← Spec mesa Customer Management
└── app/                              ← Implementación
    ├── backend/   (Node + Express, falta server.js)
    └── frontend/  (HTML/CSS/JS vanilla, login + dashboard + customer mgmt)
```

## Mesas (agentes)

Cada Mesa = un agente especializado. Elvi-Ra los alimenta.

| Mesa | Estado | Función |
|------|--------|---------|
| Customer Management | Activo (UI hecha, backend pendiente) | Excel inteligente clientes. Dashboard general + Buscador + Data Inteligente + LinkedIn + Email Creator |
| Buscador de Empresas | Sub-componente CM | Motor búsqueda nodos. Filtros: residuo orgánico >8T/año, B2B/B2C, jurisdicción cont→país→ciudad |
| Data Inteligente | Sub-componente CM | Hojas organizativas. Mover empresas entre hojas. Notas + tareas |
| LinkedIn Finder | Próximamente | Contactos LinkedIn sobre empresas en Data Inteligente |
| Email Creator | Próximamente | Emails política S-NFI: primer contacto, solicitud NDA |
| Otras mesas | Próximamente | Slots libres en Dashboard |

## Lógica de evaluación (Customer Management)

Output esperado del agente = **Dictamen de Soberanía**:

```
• NODO: [Empresa]
• SECTOR / UBICACIÓN
• PUNTUACIÓN OPHS (0-100): Ops + PAIA + Herzog + Sentinel integration ease
• CÁLCULO RESILIENCE (BSS): X MWh para 48h post-apagón
• ESTADO CNMC: riesgo regulatorio
• DICTAMEN DEPARTAMENTAL: U-2 + IIA + Factory + Finance
```

Variables clave: **W** (residuo), **I** (infraestructura), **S** (escalabilidad), **M** (compatibilidad OEM), **E** (impacto económico), **R** (estratégico), **B** (BSS resilience), **G** (gobernanza Herzog), **U-2** (reto científico).

Clasificación: ESTRATÉGICO / OPERATIVO / NO CANDIDATO. Duda razonable → no estratégico.

Penalización fuerte: biogás/anaerobia clásica, sanciones CNMC, opacidad, incompatibilidad OPHS.

## Doctrina de Ejecución (Regla de Oro)

**Inmutable. No negociable.**

> El ser humano autoriza. El ser humano supervisa. El sistema ejecuta.

- Elvi-Ra propone orquestación. Nunca ejecuta acciones físicas en infraestructura industrial sin confirmación humana.
- Rëff valida y audita. Nunca actúa de forma autónoma.
- S-NFI Systems ejecuta solo bajo validación del Admin.
- Toda directriz crítica requiere autorización de Dirección (Admin).
- Logs absolutos e inmutables. Todo acceso registrado de forma permanente.

## Stack actual

- **Backend**: Node.js + Express + CORS. ESM (`"type": "module"`). Persistencia JSON por usuario. Token en memoria 8h. **Falta `server.js`**.
- **Frontend**: HTML/CSS/JS vanilla puro, sin framework. Fonts: Inter + IBM Plex Mono + Syne.
- **Estética**: minimalismo Apple + animaciones Palantir/Anduril (reveal, delays, mono labels, dark feel).
- **Auth**: token Bearer en `localStorage`. `requireAuth()` en cada página.

## Infraestructura de despliegue

- **Infraestructura soberana (destino)**: servidores físicos propios, Debian/Kubernetes. Cero dependencia de nubes públicas de terceros para el núcleo lógico.
- **Fase transitoria (deploy actual)**: servidor Debian en Hetzner (Europa). Gestionado por el jefe. Hetzner = tercero aceptado solo para capa de deploy, no para núcleo lógico.
- **Coolify**: plataforma CI/CD auto-alojada (equivalente a Vercel/Netlify). Push a `main` → deploy automático.
- **GitHub**: repositorio fuente (pendiente conectar a Coolify).
- **Implicaciones para código**:
  - Preparar `Dockerfile` para backend Node.js (Coolify lo necesita).
  - Credenciales prod y JWT secret via variables de entorno (panel Coolify), nunca hardcoded.
  - Evaluar migración JSON → PostgreSQL/SQLite en prod para persistencia entre redeployos.

## Credenciales (dev)

Usuarios y contraseñas dev: ver `.env` local (no trackeado). No commitear credenciales en texto plano.

Producción: migrar a JWT + DB real + hashing.

## Convenciones de trabajo

- **Leer antes de escribir**. No releer salvo cambio.
- **No emojis ni em-dashes** en respuestas (excepto si están en UI ya existente como decoración de mesas).
- **No sycophantic openers ni cierres** de relleno.
- **No inventar APIs, versiones, flags, paquetes**. Verificar antes.
- **Saltar archivos >100KB** salvo necesidad.
- **Tono respuestas**: conciso, técnico, directo.
- **Idioma**: ES para UI y docs internas. Código en EN.

## Estado actual vs. visión completa

**Hecho**:
- Estructura carpetas + knowledge base SNFI
- Frontend: login.html, dashboard.html, customer-management.html, theme.css, api.js
- Spec funcional Customer Management

**Falta**:
- `app/backend/server.js` (auth + customers + sheets + search endpoints — el cliente ya espera estos endpoints)
- Lógica scoring OPHS / BSS / Dictamen de Soberanía
- Buscador de empresas (sin fuente datos externos aún)
- LinkedIn Finder + Email Creator
- Integración real Sentinel / Herzog (siguen siendo placeholders conceptuales)
- T'Controler funcional
- Monitorización usuarios real

## Qué se puede construir SIN acceso externo

Sin Sentinel/Herzog reales ni APIs externas (LinkedIn, datos públicos empresas, satélite, CNMC):

1. **Backend completo** del boceto: auth, sesiones, CRUD sheets/companies, persistencia JSON.
2. **Mock layer Sentinel/Herzog**: interfaces internas con respuestas simuladas y contratos definidos, listas para enchufar sistemas reales.
3. **T'Controler simulado**: contador de tokens local + UI Admin.
4. **Dictamen de Soberanía sintético**: scoring heurístico con datos manuales/seed hasta tener fuentes reales.
5. **Buscador empresas demo**: dataset JSON local de empresas seed para iterar UX/lógica filtros antes de conectar fuentes reales.
6. **Email Creator**: plantillas + render sin envío real (preview + copy/paste).
7. **LinkedIn Finder UI**: estructura + deep links manuales hasta tener API.
8. **Monitorización local**: log sesiones, intentos login, tabla actividad.
9. **Toda la UI/UX**: refinamiento estética Apple + Palantir.

Qué requiere accesos externos:
- LinkedIn API / scraping legal
- Datos públicos empresas (registros mercantiles, satélite, sostenibilidad)
- API CNMC sanciones
- Envío email real (SMTP/SendGrid)
- Integración Sentinel + Herzog reales (cuando existan)

## Context Model 1 (briefing doctrinal — fuente: "Contex Model 1.txt")

### Ecosistema soberano (dominios, no terceros)

| Dominio | Rol |
|---------|-----|
| S-NFI Systems | Capa física de ejecución y control industrial |
| Elvi-Ra + Rëff | Capa cognitiva: orquestación + análisis/auditoría convergente |
| S-NFI Factory | Departamento fabricación |
| S-NFI U-2 | Ciencia e I+D a nivel doctoral, límites químicos |
| S-NFI Resilience | Estabilización red eléctrica, cálculos BSS |
| Legal & Fiscal | Cumplimiento normativo |
| Pactvm Viridi | Motor regulador, filtra toda actividad Elvi-Ra/terceros |

### Soberanía técnica

- Comunicación Elvi-Ra/Rëff <-> S-NFI Systems: **endpoints privados en puertos cerrados exclusivamente**.
- Infraestructura: servidores físicos propios, Debian/Kubernetes. Cero nubes públicas para núcleo lógico.
- Credenciales: identidad criptográfica verificable, gestión centralizada.

### Seguridad grado militar

- Fallo operativo = sanciones CNMC o pérdida patentes/certificaciones.
- Logs absolutos e inmutables. Todo acceso registrado permanentemente.
- Solo Admin autoriza directrices críticas. Pactvm Viridi = estándar cumplimiento industrial internacional.

### Prioridades de asalto (orden obligatorio)

1. **Twin Elvi-Ra <-> S-NFI Systems**: enlace seguro (endpoints privados puertos cerrados).
2. **Pipeline Dictamen de Soberanía**: lead/dato externo -> Pactvm Viridi -> Rëff -> Dictamen en dashboard -> autorización Admin.

> **Doctrina**: Infraestructura antes que interfaz.

## Referencias

- Knowledge base S-NFI: `Elvi-Ra/Elvi-Ra Zone/BackEnd/SNFI Base Conocimiento.txt`
- Spec Customer Management: `Elvi-Ra/Mesas/Costumer Managment.txt`
- Flujos: `Elvi-Ra/Elvi-Ra Zone/BackEnd/Elvi-Ra Context.txt`
- README boceto: `app/README.md`
- Briefing doctrinal: `Contex Model 1.txt`
