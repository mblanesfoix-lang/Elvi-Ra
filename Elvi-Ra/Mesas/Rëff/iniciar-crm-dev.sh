#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Iniciando S-NFI CRM en modo desarrollo..."
echo ""
echo "Servidor: http://localhost:3001"
echo "Cliente:  http://localhost:5173"
echo ""
npm run dev
