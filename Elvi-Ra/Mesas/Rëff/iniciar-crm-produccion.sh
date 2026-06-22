#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Iniciando S-NFI CRM en modo produccion..."
echo ""
echo "URL: http://localhost:3001"
echo ""
npm start
