# Build context: carpeta app/
# docker build -t elvi-ra .
# docker run -p 5173:5173 -v elvi-ra-data:/app/backend/data \
#   -e ANTHROPIC_API_KEY=sk-... elvi-ra

# ── Stage 1: instala deps nativas en Linux ────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

COPY --from=builder /build/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY frontend/ ./frontend/

RUN mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]

ENV NODE_ENV=production
ENV PORT=5173
# Coolify env vars requeridas:
#   ANTHROPIC_API_KEY   — sk-ant-...
#   ANTHROPIC_MODEL     — claude-opus-4-7 (default si no se define)

EXPOSE 5173

WORKDIR /app/backend
CMD ["node", "server.js"]
