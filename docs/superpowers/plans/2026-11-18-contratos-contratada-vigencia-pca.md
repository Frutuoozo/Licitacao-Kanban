# Contratos: contratada, início da vigência e PCA — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar e mostrar CNPJ, e-mail e telefone da contratada, início da vigência e projeto/conta contábil do PCA em cada contrato.

**Architecture:** Seis colunas opcionais novas em `contracts` (migration 023 num módulo próprio, testável). `validateContractPayload` valida e normaliza; a rota de contratos grava, devolve e registra alterações no histórico. O front ganha um módulo puro de CNPJ/telefone (testado) e usa os campos no formulário, no painel e na exportação.

**Tech Stack:** Node/Express + mysql2 (testes `node --test`), React (CRA, testes Jest via `react-scripts test`).

**Spec:** `docs/superpowers/specs/2026-11-18-contratos-contratada-vigencia-pca-design.md`

## Global Constraints

- Testes só no banco `TEST_DB_NAME` (`*_test`); nunca no banco da aplicação nem em produção.
- Mutação de testes só numa **cópia** do backend (reescrever os arquivos derruba o `node --watch` da sessão do usuário).
- Todos os campos novos são opcionais; vazio aparece como "—".
- Colunas: `contractor_cnpj CHAR(14) NULL`, `contractor_email VARCHAR(254) NULL`, `contractor_phone VARCHAR(20) NULL`, `start_date DATE NULL`, `pca_project VARCHAR(255) NULL`, `pca_account VARCHAR(120) NULL`.
- Nomes na API: `contractorCnpj`, `contractorEmail`, `contractorPhone`, `startDate`, `pcaProject`, `pcaAccount`.
- Textos em português; "Nome do processo" do contrato passa a "Nome da empresa".
- Build do front com `CI=true npm run build` (avisos viram erro, como na Vercel).
- Commit só quando o usuário pedir (os passos "Commit" viram "deixar pronto para commit").

## Review Focus

- CNPJ colado com máscara ("12.345.678/0001-95") ou com espaços → aceito e guardado só com dígitos. (Task 1)
- Editar contrato antigo sem nenhum campo novo → salva sem erro e não cria registro de edição vazio. (Task 2)
- Apagar um campo já preenchido (ex.: tirar o e-mail) → grava NULL e registra a alteração "x → —". (Task 2)
- Lançar aditivo não altera o início da vigência. (Task 2)
- Início da vigência igual ao vencimento → aceito; um dia depois → recusado. (Task 1)

---

### Task 1: Validação dos campos novos

**Files:**
- Modify: `backend/validation.js` (MAX_LENGTHS, `validateContractPayload`, novo `isValidCnpj`)
- Test: `backend/test/contract-fields-validation.test.js` (novo, sem banco)

**Interfaces:**
- Produces: `isValidCnpj(digits: string) => boolean` (14 dígitos, dígitos verificadores certos, não repetidos); `validateContractPayload(payload)` devolve em `data` também `contractorCnpj` (14 dígitos ou null), `contractorEmail`, `contractorPhone`, `startDate`, `pcaProject`, `pcaAccount` (string aparada ou null). MAX_LENGTHS ganha `contractorPhone: 20`, `pcaProject: 255`, `pcaAccount: 120`.

- [ ] **Step 1: Testes que falham** — base válida = payload do `createContract` de `contract-races.test.js`.
  - `'11.222.333/0001-81'` e `' 11222333000181 '` → `data.contractorCnpj === '11222333000181'`
  - `'11222333000182'` → `'CNPJ inválido'`; `'00000000000000'` → `'CNPJ inválido'`; `'123'` → `'CNPJ inválido'`
  - `''`/ausente em todos os novos → `data` com os seis campos `null`
  - e-mail `'a@b'` → `'E-mail da contratada inválido'`; `'contato@empresa.com.br'` aceito
  - telefone `'(86) 99999-0000'` e `'+55 86 3222-1111'` aceitos; `'abc'` ou 21 caracteres → `'Telefone da contratada inválido'`
  - `startDate: '2030-01-01'` com `dueDate: '2030-01-01'` aceito; `'2030-01-02'` → `'O início da vigência não pode ser depois do vencimento'`; `'2030-13-01'` → `'Data de início da vigência inválida'`
  - `pcaProject` com 256 caracteres → `'Projeto do PCA muito longo'`; `pcaAccount` com 121 → `'Conta contábil muito longa'`
  - `processName: ''` → `'Nome da empresa obrigatório'`
- [ ] **Step 2:** `cd backend && node --test test/contract-fields-validation.test.js` → FAIL.
- [ ] **Step 3:** Implementar. CNPJ: tirar tudo que não é dígito antes de validar. Dígitos verificadores: pesos `5,4,3,2,9,8,7,6,5,4,3,2` (1º) e `6,5,4,3,2,9,8,7,6,5,4,3,2` (2º); resto < 2 → 0, senão 11 − resto. Telefone: `/^[0-9()+\-\s]{1,20}$/` e ao menos 8 dígitos. E-mail com `isValidEmail`.
- [ ] **Step 4:** mesmo comando → PASS; `npm test` sem regressão.

### Task 2: Migration 023 + gravação, leitura e histórico

**Files:**
- Create: `backend/contractDetailsMigration.js`
- Modify: `backend/server.js` (chamar após a 022), `backend/schema.sql` (tabela contracts), `backend/routes/contracts.js` (`serializeContract`, `contractSelect`, INSERT, UPDATE, `EDIT_LABELS`)
- Test: `backend/test/contract-details.test.js` (novo, banco de teste; montar como `contract-races.test.js`, prefixo próprio)

**Interfaces:**
- Consumes: `validateContractPayload` da Task 1.
- Produces: `migrateContractDetails(db) => Promise<boolean>` (true quando adicionou as colunas; idempotente). Contrato serializado com `contractorCnpj`, `contractorEmail`, `contractorPhone`, `pcaProject`, `pcaAccount` (`''` quando NULL) e `startDate` (`'YYYY-MM-DD'` ou `null`). `EDIT_LABELS`: `processName: 'Nome da empresa'`, `contractorCnpj: 'CNPJ'`, `contractorEmail: 'E-mail'`, `contractorPhone: 'Telefone'`, `startDate: 'Início da vigência'`, `pcaProject: 'Projeto do PCA'`, `pcaAccount: 'Conta contábil'`.

- [ ] **Step 1: Testes que falham** (`before`: `await migrateContractDetails(db)` no banco de teste)
  - `migrateContractDetails` chamado duas vezes → segunda devolve `false`
  - POST com os seis campos → 201 e o corpo devolve os seis (CNPJ só dígitos, `startDate: '2026-01-10'`)
  - POST sem nenhum → strings `''` e `startDate: null`
  - PUT só mudando o e-mail para `''` → último evento `edited` tem `changes = [{ field: 'contractorEmail', label: 'E-mail', from: 'a@b.com', to: '' }]`
  - PUT sem mudar nada (contrato sem campos novos) → nenhum evento `edited` novo
  - POST `/:id/amendments` → `startDate` continua igual
- [ ] **Step 2:** `node --test test/contract-details.test.js` → FAIL.
- [ ] **Step 3:** Implementar; `migrateContractDetails` no padrão de `demandsMigration.js` (checa `contractor_cnpj` no INFORMATION_SCHEMA, um `ALTER TABLE ... ADD COLUMN` com as seis). No PUT, comparar `startDate` já formatado (`formatDate`). `schema.sql` com as mesmas colunas.
- [ ] **Step 4:** PASS; `npm test` inteiro sem regressão (inclui `test-schema-sync` e `column-limits`).
- [ ] **Step 5:** Mutação numa cópia do backend contra os dois testes novos; matar mutantes sobreviventes relevantes.

### Task 3: Front — utilitários, formulário, painel e exportação

**Files:**
- Create: `frontend/src/contractFields.js`, `frontend/src/contractFields.test.js`
- Modify: `frontend/src/pages/ContratosPage.jsx` (EMPTY_FORM, abrir edição ~L1342, payload do salvar, formulário, `ContractDetails`, `exportContracts`), `frontend/src/pages/ContratosPage.css` se preciso

**Interfaces:**
- Consumes: campos da API da Task 2; mensagens de erro da Task 1 (exibidas como já são as outras).
- Produces: `onlyDigits(s) => string`, `formatCnpj(s) => string` (máscara progressiva até `00.000.000/0000-00`; `''` → `''`), `isValidCnpj(s) => boolean` (aceita com máscara; mesma regra do backend).

- [ ] **Step 1: Testes que falham** (`contractFields.test.js`): `formatCnpj('11222333000181') === '11.222.333/0001-81'`; `formatCnpj('11222') === '11.222'`; `formatCnpj('11.222.333/0001-81999') === '11.222.333/0001-81'`; `isValidCnpj('11.222.333/0001-81') === true`; `isValidCnpj('11222333000182') === false`; `isValidCnpj('11111111111111') === false`.
- [ ] **Step 2:** `cd frontend && CI=true npx react-scripts test --watchAll=false src/contractFields.test.js` → FAIL.
- [ ] **Step 3:** Implementar `contractFields.js`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Formulário** — seções e campos como no spec. CNPJ com `formatCnpj` ao digitar e `inputMode="numeric"`; e-mail `type="email"`; telefone `type="tel"` `maxLength={20}`; início com o mesmo `DatePicker` do vencimento. Antes de enviar: CNPJ preenchido e inválido → aviso "CNPJ inválido"; início > vencimento → aviso com o texto do backend. Payload envia os seis campos (CNPJ como digitado; o backend limpa).
- [ ] **Step 6: Painel** — seções Contratada (Empresa, CNPJ formatado, E-mail como `mailto:`, Telefone), Contrato (Objeto, Vigência, Nº do processo, Modalidade, Lei aplicável, Situação), PCA (Projeto, Conta contábil), Fiscalização. Vigência: `"dd/mm/aaaa a dd/mm/aaaa"`, ou `"até dd/mm/aaaa"` sem início. Tirar as seções "Objeto" e "Informações do processo" atuais (o conteúdo vai para Contrato).
- [ ] **Step 7: Exportação** — colunas após "Empresa": "CNPJ", "E-mail", "Telefone"; após "Vencimento": "Início da vigência" antes dela; no fim: "Projeto PCA", "Conta contábil".
- [ ] **Step 8:** `CI=true npm run build` → "Compiled successfully"; `CI=true npx react-scripts test --watchAll=false` sem regressão.
- [ ] **Step 9:** Ver no app (`DB_NAME=licitacao_kanban_demo ./dev.sh`): cadastrar com e sem os campos, editar, abrir o painel, exportar CSV; modo claro e escuro; largura de celular.

### Task 4: Banco de demonstração

**Files:**
- Modify: `backend/scripts/seed-demo.js` (~L317–323)

- [ ] **Step 1:** Gerar CNPJ válido por contrato (função local com o algoritmo da Task 1), e-mail `contato@<empresa-sem-espaços>.com.br`, telefone `(86) 3xxx-xxxx`, `start_date` = vencimento − 12 meses, projeto/conta de listas fixas; ~20% dos contratos sem PCA.
- [ ] **Step 2:** Rodar o seed só no banco `licitacao_kanban_demo` e conferir no app que os campos aparecem.

### Task 5: Fechamento

- [ ] Rodar `npm test` (backend) e o build + testes do front.
- [ ] Revisão do branch inteiro.
- [ ] Avisar o usuário: o que mudou, que o deploy precisa de backup no Aiven antes e backend + front juntos; commit/deploy só quando ele pedir.
