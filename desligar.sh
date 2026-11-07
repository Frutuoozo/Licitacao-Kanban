#!/bin/bash
# Desliga o ambiente local ligado pelo dev.sh: backend, frontend e MySQL.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$ROOT/.dev.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  PID="$(cat "$PIDFILE")"
  echo "Encerrando backend e frontend..."
  kill -TERM "$PID"
  for _ in $(seq 1 10); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 1
  done
  kill -0 "$PID" 2>/dev/null && kill -KILL -- "-$(ps -o pgid= "$PID" | tr -d ' ')" 2>/dev/null
  rm -f "$PIDFILE"
  echo "Backend e frontend encerrados."
else
  rm -f "$PIDFILE"
  echo "Backend e frontend não estavam ligados."
fi

if command -v systemctl >/dev/null && systemctl is-active --quiet mysql; then
  echo "Desligando o MySQL..."
  sudo systemctl stop mysql && echo "MySQL desligado."
else
  echo "MySQL já estava desligado."
fi
