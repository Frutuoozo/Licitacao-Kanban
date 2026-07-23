#!/bin/bash

echo "=========================================="
echo "🚀 DEPLOY - Sistema Kanban de Licitações"
echo "=========================================="
echo ""

# Garantir que o script rode sempre a partir da pasta frontend/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Verificar se está na pasta correta
if [ ! -f "package.json" ]; then
    echo "❌ package.json não encontrado em $SCRIPT_DIR"
    exit 1
fi

if [ -z "${REACT_APP_API_URL:-}" ] && [ -f ".env.production" ]; then
    set -a
    . ./.env.production
    set +a
fi

if [ -z "${REACT_APP_API_URL:-}" ]; then
    echo "❌ REACT_APP_API_URL não está definida."
    echo "   Configure a URL HTTPS pública do backend antes do deploy."
    echo "   Exemplo: export REACT_APP_API_URL=https://api.seu-site.com"
    exit 1
fi

echo "✅ Pasta correta: $SCRIPT_DIR"
echo ""

# Configurar Git se necessário
if ! git config user.name &> /dev/null; then
    read -p "Digite seu nome: " nome
    git config --global user.name "$nome"
fi

if ! git config user.email &> /dev/null; then
    read -p "Digite seu email: " email
    git config --global user.email "$email"
fi

echo "📦 [1/5] Instalando dependências..."
npm install
echo ""

echo "🔨 [2/5] Compilando projeto..."
npm run build
echo ""

echo "🔧 [3/5] Configurando Git (raiz do repositório)..."
cd ..
if [ ! -d ".git" ]; then
    git init
fi

if [ "$(git remote get-url origin 2>/dev/null)" != "https://github.com/Frutuoozo/Licitacao-Kanban.git" ]; then
    git remote set-url origin https://github.com/Frutuoozo/Licitacao-Kanban.git
fi

git add .
git commit -m "Deploy: $(date '+%d/%m/%Y %H:%M')" || true
git branch -M main
echo ""

echo "📤 [4/5] Enviando para GitHub..."
git push -u origin main
echo ""

echo "🚀 [5/5] Fazendo deploy da build..."

# Deploy manual (evita erro E2BIG)
cd frontend/build
git init
git add -A
git commit -m "Deploy build"
git push -f https://github.com/Frutuoozo/Licitacao-Kanban.git HEAD:gh-pages
cd ../..
rm -rf frontend/build/.git

echo ""
echo "=========================================="
echo "✅ DEPLOY CONCLUÍDO!"
echo "=========================================="
echo ""
echo "🌐 Seu site: https://Frutuoozo.github.io/licitacao-kanban"
echo ""
echo "🔧 Configure o GitHub Pages:"
echo "   1. https://github.com/Frutuoozo/licitacao-kanban/settings/pages"
echo "   2. Branch: gh-pages → /root → Save"
echo ""
echo "⏱️  Aguarde 2-3 minutos"
echo ""
echo "=========================================="
