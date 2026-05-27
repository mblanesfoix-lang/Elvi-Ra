#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/app/backend"

echo "Arrancando Elvi-Ra..."
echo "Servidor: http://localhost:5173"
echo ""
node server.js
