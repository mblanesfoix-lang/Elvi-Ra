# Build context: raíz del repo (necesita app/ y Elvi-Ra/Mesas/Rëff/)
# docker build -f app/Dockerfile -t elvi-ra .
# docker run -p 5173:5173 -v elvi-ra-data:/app/backend/data \
#   -e ANTHROPIC_API_KEY=sk-... elvi-ra

# ── Stage 1: backend principal — instala deps nativas en Linux ────────────────
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY app/backend/package.json app/backend/package-lock.json* ./
RUN npm ci

# ── Stage 2: Rëff — build cliente (Vite) + servidor (tsc) ──────────────────────
FROM node:20-slim AS reff-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY "Elvi-Ra/Mesas/Rëff/package.json" "Elvi-Ra/Mesas/Rëff/package-lock.json*" ./
RUN npm ci
COPY "Elvi-Ra/Mesas/Rëff/" ./
RUN npm run build

# ── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

COPY --from=builder /build/node_modules ./backend/node_modules
COPY app/backend/ ./backend/
COPY app/frontend/ ./frontend/

COPY --from=reff-builder /build/dist /Elvi-Ra/Mesas/Rëff/dist
COPY --from=reff-builder /build/node_modules /Elvi-Ra/Mesas/Rëff/node_modules

RUN mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]

ENV NODE_ENV=production
ENV PORT=5173
# Coolify env vars requeridas:
#   ANTHROPIC_API_KEY   — sk-ant-...
#   ANTHROPIC_MODEL     — claude-haiku-4-5-20251001 (default si no se define)

EXPOSE 5173

WORKDIR /app/backend
CMD ["node", "server.js"]
