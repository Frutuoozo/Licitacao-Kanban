# 🚀 GUIA DE INSTALAÇÃO E DEPLOY

## ⚡ JEITO MAIS RÁPIDO (Script Automático)

```bash
# 1. Extrair o arquivo
tar -xzf licitacao-kanban-fresh.tar.gz

# 2. Entrar na pasta
cd licitacao-kanban-fresh

# 3. Executar script
./deploy.sh
```

Pronto! O script faz TUDO automaticamente! ✨

---

## 📋 OU: Passo a Passo Manual

### 1️⃣ Preparar Projeto

```bash
# Extrair
tar -xzf licitacao-kanban-fresh.tar.gz
cd licitacao-kanban-fresh

# Instalar
npm install
```

### 2️⃣ Deploy

```bash
# Método 1: Automático (pode dar erro E2BIG)
npm run deploy

# Método 2: Manual (SEMPRE FUNCIONA)
npm run build
cd build
git init
git add -A
git commit -m "Deploy"
git push -f https://github.com/Frutuoozo/licitacao-kanban.git HEAD:gh-pages
cd ..
```

### 3️⃣ Ativar GitHub Pages

Acesse: https://github.com/Frutuoozo/licitacao-kanban/settings/pages

- **Source**: Deploy from a branch
- **Branch**: `gh-pages` → `/root` → **Save**

---

## 🌐 Seu Site

https://Frutuoozo.github.io/licitacao-kanban

⏱️ Aguarde 2-3 minutos após configurar

---

## 🔄 Para Atualizar Depois

```bash
git add .
git commit -m "Atualização"
git push

# Deploy novamente
./deploy.sh
```

---

## 🆘 Problemas?

### Git não configurado:
```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu@email.com"
```

### Erro E2BIG:
Use o **deploy manual** (Método 2 acima)

### Node.js antigo:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

**Pronto para usar! 🎉**
