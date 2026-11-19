# Contratos: dados da contratada, início da vigência e PCA

Aprovado pelo usuário em 18/11/2026 (conversa no Claude Code).

## Por quê

O painel do contrato mostra pouco sobre a empresa e o enquadramento do contrato. O setor quer ver, no mesmo
lugar, o CNPJ e o contato da contratada, o período completo da vigência e os dados do PCA (Plano de
Contratações Anual): projeto e conta contábil.

## Escopo

- **Contratada**: CNPJ, e-mail, telefone. O nome da empresa já existe — é o campo `processName`, cujo rótulo
  passou a ser "Nome da empresa" (já feito no front; falta o backend).
- **Contrato**: objeto (já existe), **início da vigência** (novo; a vigência mostrada é "início a vencimento"),
  **projeto do PCA** e **conta contábil** (novos).
- Sem mudanças no card nem na tabela da lista.

Fora do escopo: histórico no painel (removido a pedido; o registro continua sendo gravado e alimenta a
contagem de aditivos e as abas de documentos), importação por CSV.

## Abordagens consideradas

1. **Colunas novas na tabela `contracts`** (escolhida). Um contrato tem uma contratada e um PCA; não há
   reaproveitamento entre contratos que justifique tabelas próprias.
2. Tabela de empresas (`contractors`) ligada ao contrato. Evitaria redigitar o CNPJ de uma empresa com vários
   contratos, mas exige cadastro/seleção de empresa e migração dos nomes atuais; o usuário pediu só os campos.
3. Vigência a partir da data do "Termo de contrato" no histórico (opção B, recusada): é a data do cadastro no
   sistema, não do início da vigência, e ficaria errada nos contratos antigos.

## Decisões

- **Banco** — migration 023 em `contracts`, todas NULL:
  `contractor_cnpj CHAR(14)` (só dígitos), `contractor_email VARCHAR(254)`, `contractor_phone VARCHAR(20)`,
  `start_date DATE`, `pca_project VARCHAR(255)`, `pca_account VARCHAR(120)`. `schema.sql` acompanha.
- **CNPJ, início da vigência, projeto do PCA e conta contábil obrigatórios** (pedido do usuário em 18/11, depois da
  implementação; a proposta inicial era tudo opcional): cadastro e edição recusam sem eles, então editar um contrato antigo
  exige informá-los; só a importação de planilhas antigas (`scripts/import-contracts-csv.js`, `legacyImport`) dispensa.
  **E-mail e telefone continuam opcionais.** Nos contratos antigos, o que falta aparece como "—".
- **Validação no backend** (`validateContractPayload`):
  - CNPJ: aceita com ou sem máscara, guarda 14 dígitos; confere os dígitos verificadores; recusa
    sequências repetidas (00000000000000 etc.).
  - E-mail: mesma regra de e-mail já usada (`isValidEmail`).
  - Telefone: texto livre até 20 caracteres, só dígitos, espaço, parênteses, `+` e `-`.
  - Início da vigência: data válida e não posterior ao vencimento.
  - Projeto e conta contábil: texto até o tamanho da coluna.
- **API**: `serializeContract` devolve `contractorCnpj`, `contractorEmail`, `contractorPhone`, `startDate`,
  `pcaProject`, `pcaAccount` ("" quando vazio; `startDate` null). POST e PUT gravam; o PUT registra a alteração
  desses campos no histórico (`EDIT_LABELS`). Aditivo não mexe no início da vigência.
- **Textos do backend**: "Nome do processo" → "Nome da empresa" na mensagem de obrigatório e em `EDIT_LABELS`.
- **Formulário** (front): seções Contratada (Nome da empresa\*, CNPJ, E-mail, Telefone) · Contrato (objeto,
  nº do processo, modalidade, lei, início da vigência, vencimento, valor) · PCA (Projeto, Conta contábil) ·
  Fiscalização. CNPJ com máscara enquanto digita; o front repete as validações para avisar antes de enviar.
- **Painel**: Valor/Vencimento · Aditivos · Documentos · Contratada · Contrato (objeto, vigência
  "dd/mm/aaaa a dd/mm/aaaa" ou "até dd/mm/aaaa" sem início, nº, modalidade, lei, situação) · PCA · Fiscalização.
- **Exportação CSV/PDF**: colunas novas CNPJ, E-mail, Telefone, Início da vigência, Projeto PCA, Conta contábil.
- **Demonstração**: `scripts/seed-demo.js` preenche os campos novos.
- **Testes**: só no banco `*_test`; mutação em cópia do backend.
- **Deploy**: backup do banco no Aiven antes; backend e front juntos.

## Deixado para quem implementa

Ordem das colunas na exportação, textos de ajuda dos campos, layout responsivo das seções novas seguindo as
existentes.
