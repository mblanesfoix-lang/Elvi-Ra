# ELVI-RA · Guia de despliegue (Linux / Coolify)

## Requisitos previos

- Servidor Debian/Ubuntu con Docker + Docker Compose v2
- Coolify instalado (opcional — ver opcion B)
- Node.js >= 20 (solo si se lanza sin Docker)
- `git` en el servidor

---

## Puertos (firewall / terminal)

| Puerto | Servicio | Exposicion |
|---|---|---|
| `5173` | Elvi-Ra (frontend + backend API + Rëff integrado) | Publico — abrir en firewall (`ufw allow 5173`) |
| `5174` | Twin Elvi-Ra <-> S-NFI Systems | Interno, solo si `ENABLE_TWIN_PORT=true`. NO expuesto en `docker-compose.yml` (`expose`, no `ports`). No abrir en firewall. |
| `11434` | Ollama (LLM local, opcional) | Interno red Docker (`elvira-net`). No expuesto al host. No abrir en firewall. |

Solo `5173` necesita regla de firewall/router para acceso externo. `5174` y `11434` son inter-contenedor exclusivamente.

Si se monta proxy inverso (Caddy/Nginx/Coolify) delante: abrir tambien `80`/`443` en el host, el proxy reenvia a `5173` interno.

---

## Estructura de servicios

```
elvira (puerto 5173)
  ├── Frontend HTML/CSS/JS  →  /pages/login.html, dashboard, snfi-u2
  ├── Backend API Express    →  /api/*
  └── Reff integrado        →  /reff/* (montado en runtime desde dist/)
        ├── /reff/app/       →  React SPA (CRM, Globe, Wismer)
        └── /reff/api/*      →  Auth, CRM, Geo, Wismer endpoints

ollama (solo accesible en red interna Docker)
  └── Motor LLM local — alternativa a Anthropic API
```

---

## Opcion A — Docker Compose (recomendado)

### 1. Clonar repositorio

```bash
git clone <URL_REPO> elvi-ra
cd elvi-ra
```

### 2. Compilar Reff (obligatorio antes del primer build)

Reff es una app React+TypeScript que se compila y luego Elvi-Ra la sirve integrada.

```bash
cd "Elvi-Ra/Mesas/Rëff"
npm ci
npm run build
cd ../../..
```

### 3. Crear archivo de variables de entorno

```bash
cp app/backend/.env.example app/backend/.env
nano app/backend/.env
```

Rellenar obligatoriamente:

| Variable | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | sk-ant-... (de console.anthropic.com) |
| `JWT_SECRET` | output de: `openssl rand -hex 32` |
| `ESIOS_API_KEY` | token ESIOS/REE (opcional, para datos energia) |

### 4. Levantar el stack

```bash
docker compose up -d --build
```

La aplicacion queda disponible en `http://<IP-SERVIDOR>:5173`.

### 5. Actualizar (despliegue continuo)

```bash
git pull
cd "Elvi-Ra/Mesas/Rëff" && npm ci && npm run build && cd ../../..
docker compose up -d --build elvira
```

---

## Opcion B — Coolify (CI/CD automatico)

1. En el panel Coolify: **New Resource → Docker Compose**
2. Fuente: repositorio GitHub de este proyecto
3. Archivo compose: `docker-compose.yml` (raiz del repo)
4. En **Environment Variables** del panel, definir:
   - `ANTHROPIC_API_KEY`
   - `JWT_SECRET` (generar con `openssl rand -hex 32`)
   - `ESIOS_API_KEY` (opcional)
   - `NODE_ENV=production`
5. En **Volumes**: asegurar que `elvira-data` apunta a un directorio persistente del host
6. Deploy

**Importante:** Compilar Reff antes del primer push, o añadir el paso de build en el hook pre-deploy de Coolify.

---

## Opcion C — Sin Docker (Node directo)

```bash
# 1. Compilar Reff
cd "Elvi-Ra/Mesas/Rëff"
npm ci && npm run build
cd ../../..

# 2. Instalar dependencias Elvi-Ra backend
cd app/backend
npm ci

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con los valores reales

# 4. Arrancar
npm start
# O con auto-restart:
# node --watch --env-file=.env server.js
```

La aplicacion queda en el puerto definido en `.env` (default: 5173).

---

## Credenciales

Seed inicial via variables de entorno (`SEED_MARC_PASSWORD`, `SEED_NOUR_PASSWORD`, `SEED_RAY_PASSWORD`, `SEED_AMIR_PASSWORD`) — ver `app/backend/.env.example`. Definir solo en el primer deploy; tras eso los hashes viven en `data/users.json` y se pueden borrar del panel Coolify.

Para cambiar contrasenas: POST `/api/auth/change-password` con token Bearer.

---

## Verificacion

```bash
# Health check Reff integrado
curl http://localhost:5173/api/reff-health

# Datos energia en tiempo real (requiere ESIOS_API_KEY)
curl -H "Authorization: Bearer <TOKEN>" http://localhost:5173/api/snfi-u2/live
```

---

## Notas de seguridad

- `JWT_SECRET` vacio = tokens predecibles. **Obligatorio en prod.**
- `.env` nunca debe commitearse al repo (esta en `.gitignore`).
- En prod: configurar CORS_ORIGIN con la URL exacta del dominio.
- Base de datos SQLite en volumen persistente — verificar que el volumen sobrevive redeployos en Coolify.
