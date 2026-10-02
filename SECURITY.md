# Segurança

## Configuração obrigatória em produção

- Defina `NODE_ENV=production`.
- Defina `JWT_SECRET` com pelo menos 32 caracteres aleatórios (`openssl rand -base64 48`).
- Defina `FRONTEND_URL` somente com as origens exatas autorizadas, separadas por vírgula.
- Use HTTPS no frontend, backend e banco de dados.
- Nunca versione arquivos `.env` nem diretórios `node_modules`.

## Credenciais

- A senha do banco que já apareceu no histórico do Git deve ser rotacionada no provedor.
- Novos usuários recebem uma senha temporária exibida uma única vez ao administrador.
- Redefinições administrativas também são temporárias e exigem troca no próximo acesso.

## Verificação antes de publicar

```bash
cd backend && npm ci && npm audit
cd ../frontend && npm ci && npm run build
```

O frontend ainda usa Create React App, cuja cadeia de build possui avisos de dependências antigas. Planeje a migração para uma ferramenta mantida, como Vite, sem usar `npm audit fix --force` às cegas.
