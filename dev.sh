#!/bin/bash
# Ambiente local: MySQL + backend (localhost:3001) + frontend (localhost:3000).
# Ctrl+C encerra backend e frontend; o MySQL continua ligado (sudo systemctl stop mysql para desligar).
# De outro terminal, desligar.sh encerra esta sessão (pelo PID em .dev.pid) e o MySQL.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$ROOT/.dev.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "O ambiente já está ligado (PID $(cat "$PIDFILE")). Use desligar.sh antes de ligar de novo."
  exit 1
fi

# Banco de dados: liga o serviço se estiver parado (pede a senha do sudo).
if command -v systemctl >/dev/null && ! systemctl is-active --quiet mysql; then
  echo "Ligando o MySQL..."
  sudo systemctl start mysql || { echo "Não foi possível ligar o MySQL."; exit 1; }
fi

# mysqladmin ping responde mesmo sem credenciais; só confirma que o servidor aceita conexões.
for _ in $(seq 1 30); do
  mysqladmin ping >/dev/null 2>&1 && break
  sleep 1
done
mysqladmin ping >/dev/null 2>&1 || { echo "O MySQL não respondeu em 30 s."; exit 1; }
echo "MySQL pronto."

# Dependências: instala só na primeira vez (ou se node_modules tiver sido apagado).
for dir in backend frontend; do
  if [ ! -d "$ROOT/$dir/node_modules" ]; then
    echo "Instalando dependências do $dir..."
    (cd "$ROOT/$dir" && npm install) || exit 1
  fi
done

# Mata backend e frontend ao encerrar (Ctrl+C ou desligar.sh)
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"; kill 0' EXIT
trap 'exit' INT TERM

echo "Iniciando backend em localhost:3001..."
(cd "$ROOT/backend" && npm run dev) &

echo "Iniciando frontend em localhost:3000..."
(cd "$ROOT/frontend" && npm start) &

wait
