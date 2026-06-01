#!/bin/bash

# Mata todos os processos filhos ao encerrar (Ctrl+C)
trap "kill 0" EXIT

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Iniciando backend em localhost:3001..."
cd "$ROOT/backend" && npm run dev &

echo "Iniciando frontend em localhost:3000..."
cd "$ROOT/frontend" && npm start &

wait
