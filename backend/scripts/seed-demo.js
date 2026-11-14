// Banco de DEMONSTRAÇÃO para testar o sistema à mão, com muitos dados em todas as telas.
//
//   node scripts/seed-demo.js          → (re)cria <DB_NAME>_demo no MySQL LOCAL e preenche
//   DB_NAME=licitacao_kanban_demo ./dev.sh   (na raiz) → abre o sistema usando o banco de demonstração
//
// Segurança: só roda com DB_HOST local; grava apenas em <DB_NAME>_demo, que é APAGADO e recriado a cada
// execução. O banco da aplicação só é lido para copiar a estrutura das tabelas (CREATE TABLE ... LIKE).
// Todos os usuários têm a senha DEMO_PASSWORD.
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const DEMO_PASSWORD = 'Demo#2026';
const SOURCE_DB = String(process.env.DB_NAME || '').replace(/_demo$/, '');
const DEMO_DB = `${SOURCE_DB}_demo`;
const host = process.env.DB_HOST || 'localhost';

if (!SOURCE_DB || !['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Recusado: o banco de demonstração só é criado no MySQL local (DB_HOST atual: ${host}).`);
  process.exit(1);
}
if (!/^[A-Za-z0-9_]+$/.test(DEMO_DB)) {
  console.error(`Nome de banco inválido: ${DEMO_DB}`);
  process.exit(1);
}

// ── Gerador previsível (mesmos dados a cada execução) ──
let seed = 20261113;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (list) => list[int(0, list.length - 1)];
const chance = (p) => rand() < p;
const pad = (n, size = 2) => String(n).padStart(size, '0');

const DAY = 86400000;
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const addDays = (date, days) => new Date(date.getTime() + days * DAY);
const isoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const sqlDateTime = (date) => `${isoDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
const atHour = (date) => { const d = new Date(date); d.setHours(int(8, 17), int(0, 59), int(0, 59)); return d; };

// ── Nomes ──
const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas',
  'Mariana', 'Nathan', 'Olívia', 'Paulo', 'Quésia', 'Rafael', 'Sabrina', 'Thiago', 'Úrsula', 'Vinícius', 'Wesley', 'Yasmin',
  'Zélia', 'Antônio', 'Beatriz', 'Cláudio', 'Débora', 'Érica', 'Fábio', 'Gisele', 'Hugo', 'Ingrid', 'Jéssica', 'Kleber',
  'Larissa', 'Márcio', 'Natália', 'Otávio'];
const LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa',
  'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento',
  'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas', 'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira'];
const fullName = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]} ${LAST[(i * 13 + 5) % LAST.length]}`;
const slug = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '.');

const SECTORS = ['Administrativo e Financeiro', 'Assessoria de Comunicação', 'Assessoria Jurídica', 'Auditoria Interna',
  'Cobrança', 'Compras', 'Contabilidade', 'Controle Interno', 'Desenvolvimento Profissional', 'Eventos', 'Fiscalização',
  'Gabinete da Presidência', 'Gestão de Contratos', 'Gestão de Pessoas', 'Infraestrutura', 'Licitação', 'Manutenção',
  'Ouvidoria', 'Patrimônio', 'Planejamento', 'Protocolo', 'Recepção', 'Registro Profissional', 'Relações Institucionais',
  'Secretaria Executiva', 'Tecnologia da Informação', 'Tesouraria', 'Transporte', 'Almoxarifado', 'Arquivo Geral',
  'Câmara de Ética', 'Câmara Técnica'];

const MODALITIES = ['Pregão Eletrônico', 'Pregão Presencial', 'Concorrência Eletrônica', 'Concorrência Presencial', 'Concurso',
  'Leilão', 'Leilão Eletrônico', 'Diálogo Competitivo', 'Dispensa Eletrônica', 'Dispensa de Licitação', 'Dispensa por Valor',
  'Dispensa Emergencial', 'Inexigibilidade', 'Inexigibilidade - Fornecedor Exclusivo', 'Inexigibilidade - Serviço Técnico',
  'Inexigibilidade - Artista Consagrado', 'Credenciamento', 'Adesão a Ata de Registro de Preços', 'Registro de Preços',
  'Tomada de Preços', 'Convite', 'Chamamento Público', 'Pré-qualificação', 'Manifestação de Interesse', 'Contratação Direta',
  'Termo de Colaboração', 'Termo de Fomento', 'Acordo de Cooperação', 'Concurso de Projetos', 'Credenciamento de Leiloeiros',
  'Registro de Preços Compartilhado', 'Carona'];

const COLORS = ['#1e88e5', '#43a047', '#e53935', '#fb8c00', '#8e24aa', '#00897b', '#3949ab', '#6d4c41', '#d81b60', '#546e7a',
  '#0891b2', '#66bb6a', '#f4511e', '#7cb342', '#5e35b1', '#c0ca33', '#039be5', '#ffb300', '#00acc1', '#30363d'];

const PHASES = ['Fase de Planejamento:', 'Fase de Pesquisa de Preços:', 'Fase Jurídica:', 'Fase Externa:', 'Fase de Contratação:'];
const DOCS = ['Documento de Formação de Demanda (DFD)', 'Portaria da Comissão de Planejamento', 'Portaria de Gestor de Contrato',
  'Termo de Cientificação', 'Estudo Técnico Preliminar (ETP)', 'Mapa de Riscos', 'Termo de Referência (TR)',
  'E-mails solicitando orçamentos', 'Orçamentos dos fornecedores', 'Relatório de Pesquisa de Preços no PNCP',
  'Mapa Comparativo de Preços (MCP)', 'Justificativa do MCP', 'Declaração de Disponibilidade Orçamentária',
  'Parecer Jurídico', 'Minuta do Edital', 'Minuta do Contrato', 'Aviso de Licitação publicado', 'Ata da Sessão Pública',
  'Adjudicação', 'Homologação', 'Extrato do Contrato publicado', 'Nota de Empenho', 'Certidões de Regularidade Fiscal',
  'Proposta Comercial Vencedora', 'Ordem de Serviço'];

const TEMPLATE_NAMES = ['Aquisição de Bens', 'Aquisição de Equipamentos de TI', 'Material de Expediente', 'Material de Limpeza',
  'Mobiliário', 'Serviços Contínuos', 'Serviços de Limpeza', 'Serviços de Vigilância', 'Manutenção Predial',
  'Manutenção de Ar-condicionado', 'Locação de Imóvel', 'Locação de Veículos', 'Passagens Aéreas', 'Hospedagem e Eventos',
  'Publicação Oficial', 'Capacitação e Treinamento', 'Assinatura de Periódicos', 'Licença de Software', 'Serviços de TI',
  'Telefonia e Internet', 'Seguro Predial', 'Obras e Reformas', 'Consultoria', 'Auditoria Externa', 'Gráfica e Impressos',
  'Brindes Institucionais', 'Coffee Break', 'Combustível', 'Correios', 'Energia Solar', 'Plano de Saúde', 'Uniformes'];

const OBJECTS = ['Fornecimento de material de expediente', 'Prestação de serviços de limpeza e conservação',
  'Locação de veículos com motorista', 'Manutenção preventiva e corretiva de ar-condicionado', 'Serviços de vigilância armada',
  'Fornecimento de passagens aéreas', 'Licenciamento de software de gestão', 'Serviços de telefonia móvel',
  'Link de internet dedicado', 'Fornecimento de água mineral', 'Serviços gráficos', 'Organização de eventos institucionais',
  'Seguro predial da sede', 'Locação de imóvel para a delegacia regional', 'Manutenção de elevadores',
  'Serviços de coleta de resíduos', 'Fornecimento de combustível', 'Consultoria em gestão de riscos', 'Auditoria independente',
  'Capacitação de servidores', 'Fornecimento de coffee break', 'Serviços de correio e malote', 'Outsourcing de impressão',
  'Desenvolvimento de sistemas', 'Hospedagem em nuvem', 'Fornecimento de mobiliário', 'Reforma do auditório',
  'Instalação de usina solar', 'Plano de saúde dos colaboradores', 'Fornecimento de uniformes'];
const COMPANIES = ['Alfa Serviços Ltda', 'Beta Comércio e Representações', 'Gama Tecnologia S.A.', 'Delta Engenharia',
  'Ômega Soluções', 'Piauí Limpeza e Conservação', 'Teresina Locadora', 'Nordeste Telecom', 'Parnaíba Gráfica',
  'Delta Viagens e Turismo', 'Sol do Norte Energia', 'Rio Poti Segurança', 'Cajuína Eventos', 'Serra Azul Climatização',
  'Mafrense Construções', 'Pedra do Sal Consultoria', 'Oeiras Distribuidora', 'Picos Papelaria', 'Floriano Transportes',
  'Campo Maior Alimentos'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
];

// PDF mínimo válido (abre em qualquer leitor) com uma linha de texto.
function tinyPdf(text) {
  const safe = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${safe}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

async function main() {
  const conn = await mysql.createConnection({
    host,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 3306,
    multipleStatements: false,
  });

  console.log(`Recriando ${DEMO_DB} com a estrutura de ${SOURCE_DB}...`);
  await conn.query(`DROP DATABASE IF EXISTS \`${DEMO_DB}\``);
  await conn.query(`CREATE DATABASE \`${DEMO_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  const [tables] = await conn.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [SOURCE_DB]);
  // processes antes de process_items (a chave estrangeira não vem com o LIKE, então recriamos abaixo).
  for (const { name } of tables) await conn.query(`CREATE TABLE \`${DEMO_DB}\`.\`${name}\` LIKE \`${SOURCE_DB}\`.\`${name}\``);
  await conn.query(`ALTER TABLE \`${DEMO_DB}\`.process_items ADD CONSTRAINT process_items_ibfk_1 FOREIGN KEY (process_id) REFERENCES \`${DEMO_DB}\`.processes (id) ON DELETE CASCADE`);
  await conn.changeUser({ database: DEMO_DB });
  const insert = (table, columns, rows) => (rows.length
    ? conn.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`, [rows])
    : null);

  // ── Usuários (31): admin + 30 com papéis variados ──
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [{ id: randomUUID(), username: 'admin', role: 'admin', first_access: 0 }];
  for (let i = 0; i < 30; i += 1) {
    const name = fullName(i + 3);
    users.push({
      id: randomUUID(),
      username: `${slug(name.split(' ')[0])}.${slug(name.split(' ')[1])}${i}`,
      role: i < 4 ? 'admin' : i < 16 ? 'editor' : 'viewer',
      first_access: i % 9 === 8 ? 1 : 0, // alguns ainda no primeiro acesso (entram com a mesma senha e definem outra)
    });
  }
  const themes = ['light', 'dark', 'auto'];
  const starts = [null, 'dashboard', 'processos:board', 'processos:calendar', 'contratos', 'colaboradores'];
  await insert('users', ['id', 'username', 'password_hash', 'role', 'first_access', 'created_at', 'password_changed_at', 'locked_until', 'failed_attempts', 'start_page', 'preferences'],
    users.map((u, i) => [u.id, u.username, hash, u.role, u.first_access,
      sqlDateTime(addDays(now, -int(30, 400))), sqlDateTime(addDays(now, -int(0, 120))),
      i === 29 ? sqlDateTime(addDays(now, 1 / 96)) : null, i === 28 ? 3 : 0, // um bloqueado por 15 min, outro com 3 erros
      i === 0 ? 'dashboard' : pick(starts),
      JSON.stringify(i === 0 ? { theme: 'auto', dateFormat: 'short' } : { theme: pick(themes), fontSize: pick(['normal', 'large']), hideDoneDocs: chance(0.3) })]));

  // ── Histórico de acessos: 60 para o admin e 30 para cada outro usuário ──
  const loginRows = [];
  users.forEach((u, i) => {
    const count = i === 0 ? 60 : 30;
    for (let k = 0; k < count; k += 1) {
      const event = pick(['success', 'success', 'success', 'success', 'wrong_password', 'locked', 'password_changed', 'sessions_revoked', 'first_access']);
      loginRows.push([u.id, event, `177.${int(10, 250)}.${int(0, 255)}.${int(1, 254)}`, pick(USER_AGENTS), sqlDateTime(atHour(addDays(today, -int(0, 170))))]);
    }
  });
  await insert('login_events', ['user_id', 'event', 'ip', 'user_agent', 'created_at'], loginRows);

  // ── Setores (32), modalidades (32) ──
  await insert('sectors', ['name'], SECTORS.map((name) => [name]));
  await insert('contract_modalities', ['name'], MODALITIES.map((name) => [name]));

  // ── Colaboradores (40): alguns inativos ──
  const collaborators = Array.from({ length: 40 }, (_, i) => {
    const nome = fullName(i);
    const digits = String(10000000000 + i * 271828183 % 89999999999).padStart(11, '0').slice(-11);
    return {
      nome,
      cpf: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`,
      email: `${slug(nome).replace(/\./g, '.')}@exemplo.org.br`,
      codigo: `COD${pad(i + 1, 3)}`,
      ativo: i % 8 === 7 ? 0 : 1,
    };
  });
  await insert('collaborators', ['nome', 'cpf', 'email', 'codigo', 'ativo'], collaborators.map((c) => [c.nome, c.cpf, c.email, c.codigo, c.ativo]));
  const activeNames = collaborators.filter((c) => c.ativo).map((c) => c.nome);

  // ── Modelos (32): fases + documentos, alguns com cor ──
  const templates = TEMPLATE_NAMES.map((name, i) => {
    const items = [];
    const phases = PHASES.slice(0, int(2, PHASES.length));
    for (const phase of phases) {
      items.push({ type: 'phase', name: phase, bgColor: pick(['#1e88e5', '#43a047', '#8e24aa', '#fb8c00']) });
      const start = int(0, DOCS.length - 6);
      for (const doc of DOCS.slice(start, start + int(2, 5))) items.push(chance(0.2) ? { type: 'doc', name: doc, bgColor: '#0891b2' } : doc);
    }
    return { name, items, color: COLORS[i % COLORS.length], description: chance(0.7) ? `Modelo padrão para ${name.toLowerCase()}.` : null };
  });
  await insert('templates', ['name', 'items', 'sort_order', 'type_color', 'description'],
    templates.map((t, i) => [t.name, JSON.stringify(t.items), i, t.color, t.description]));

  // ── Processos: 35 demandas (pendentes), 40 em andamento, 45 concluídos (arquivados no último ano) ──
  const processRows = [];
  const itemRows = [];
  const TITLES = ['Aquisição de', 'Contratação de', 'Renovação de', 'Registro de preços para', 'Locação de', 'Manutenção de'];
  const make = (status, index) => {
    const tpl = pick(templates);
    const id = randomUUID();
    const created = atHour(addDays(today, -int(status === 'pending' ? 0 : 20, status === 'archived' ? 380 : 150)));
    let started = null;
    let archived = null;
    let due;
    if (status === 'pending') {
      due = addDays(today, int(-10, 200)); // alguns já vencidos
    } else if (status === 'active') {
      started = addDays(created, int(0, 10));
      due = addDays(today, pick([int(-40, -1), int(0, 7), int(8, 30), int(31, 180)])); // vencidos, esta semana, mês, depois
    } else {
      started = addDays(created, int(0, 10));
      archived = atHour(addDays(today, -int(0, 360)));
      if (archived < started) archived = addDays(started, int(5, 60));
      due = addDays(archived, int(-15, 30));
    }
    const year = (started || created).getFullYear();
    const number = status === 'pending' && chance(0.4) ? null : `${pad(index + 1, 4)}/${year}`;
    const setor = status === 'pending' && chance(0.5) ? null : pick(activeNames);
    const notes = chance(0.35) ? pick(['Prioridade definida pela Presidência.', '- Verificar saldo orçamentário\n- Confirmar quantitativos',
      'Aguardando retorno do setor demandante.', 'Processo vinculado à ata do ano anterior.', 'Conferir certidões antes da homologação.']) : null;
    const priority = status === 'pending' ? pick(['urgent', 'high', 'moderate', 'routine', 'routine']) : pick(['high', 'moderate', 'routine', 'routine']);
    processRows.push([id, `${pick(TITLES)} ${pick(OBJECTS).toLowerCase().replace(/^fornecimento de |^prestação de |^serviços de /, '')}`,
      number, setor, tpl.name, tpl.color, status, sqlDateTime(created), sqlDateTime(archived || started || created),
      isoDate(due), archived ? sqlDateTime(archived) : null, started ? sqlDateTime(started) : null, notes, priority]);
    // Itens do processo a partir do modelo; o progresso varia com a situação.
    const doneRatio = status === 'archived' ? 1 : status === 'active' ? rand() : 0;
    tpl.items.forEach((item, order) => {
      const obj = typeof item === 'string' ? { type: 'doc', name: item, bgColor: null } : item;
      const done = obj.type === 'doc' && order / tpl.items.length < doneRatio ? 1 : 0;
      itemRows.push([randomUUID(), id, obj.type, obj.name, done, obj.bgColor || null, order]);
    });
  };
  let index = 0;
  for (let i = 0; i < 35; i += 1) make('pending', index++);
  for (let i = 0; i < 40; i += 1) make('active', index++);
  for (let i = 0; i < 45; i += 1) make('archived', index++);
  await insert('processes', ['id', 'title', 'processNumber', 'setor', 'type', 'typeColor', 'status', 'created_at', 'updated_at', 'due_date', 'archived_at', 'started_at', 'notes', 'priority'], processRows);
  await insert('process_items', ['id', 'process_id', 'type', 'name', 'is_done', 'bg_color', 'order_index'], itemRows);

  // ── Contratos (45) com histórico: criação, edições, aditivos (até o limite de 4), encerrados e reabertos ──
  const admin = users[0];
  const eventRows = [];
  const contracts = [];
  for (let i = 0; i < 45; i += 1) {
    const id = randomUUID();
    const created = atHour(addDays(today, -int(30, 900)));
    const firstDue = addDays(created, 365);
    let due = firstDue;
    let value = int(5, 900) * 1000 + pick([0, 0, 500, 750]);
    const variable = i % 11 === 10 ? 1 : 0;
    const amendments = i % 9 === 0 ? 4 : int(0, 3); // alguns já no limite de aditivos
    const evDate = (d) => isoDate(d > today ? today : d);
    eventRows.push([id, 'created', evDate(created), null, null, isoDate(firstDue), null, value.toFixed(2), 'Termo de contrato', null, null, null, null, variable, sqlDateTime(created)]);
    let cursor = created;
    if (chance(0.3)) {
      cursor = addDays(cursor, int(5, 60));
      const before = value;
      value += int(1, 20) * 500;
      eventRows.push([id, 'edited', evDate(cursor), null, null, null, null, null, null,
        JSON.stringify([{ field: 'contractValue', label: 'Valor do contrato', from: before, to: value }]), admin.id, admin.username, null, null, sqlDateTime(atHour(cursor))]);
    }
    for (let a = 1; a <= amendments; a += 1) {
      cursor = addDays(due, -int(10, 40));
      if (cursor > today) break;
      const newDue = addDays(due, 365);
      const newValue = chance(0.6) ? value + int(1, 50) * 1000 : value;
      eventRows.push([id, 'amendment', evDate(cursor), a, isoDate(due), isoDate(newDue), value.toFixed(2), newValue.toFixed(2),
        chance(0.5) ? `${a}º termo aditivo: prorrogação por 12 meses.` : null, null, admin.id, admin.username, variable, variable, sqlDateTime(atHour(cursor))]);
      due = newDue;
      value = newValue;
    }
    // Vencimento final espalhado: alguns vencidos, alguns vencendo em breve.
    if (i % 5 === 0) due = addDays(today, -int(1, 120));
    else if (i % 5 === 1) due = addDays(today, int(0, 30));
    else if (i % 5 === 2) due = addDays(today, int(31, 90));
    let closedAt = null;
    let closedReason = null;
    if (i % 7 === 3) {
      closedAt = addDays(today, -int(1, 60));
      closedReason = pick(['Rescisão amigável.', 'Objeto concluído antes do prazo.', 'Fornecedor descumpriu cláusulas contratuais.']);
      eventRows.push([id, 'closed', isoDate(closedAt), null, null, null, null, null, closedReason, null, admin.id, admin.username, null, null, sqlDateTime(atHour(closedAt))]);
    } else if (i % 7 === 5) {
      const closed = addDays(today, -int(20, 60));
      const reopened = addDays(closed, int(1, 10));
      eventRows.push([id, 'closed', isoDate(closed), null, null, null, null, null, 'Encerrado por engano.', null, admin.id, admin.username, null, null, sqlDateTime(atHour(closed))]);
      eventRows.push([id, 'reopened', isoDate(reopened), null, null, null, null, null, 'Reaberto após conferência.', null, admin.id, admin.username, null, null, sqlDateTime(atHour(reopened))]);
    }
    const effective = pick(activeNames);
    contracts.push([id, `${pick(COMPANIES)}`, `${pick(OBJECTS)} para o Conselho, conforme termo de referência.`,
      `90796071100002${pad(int(10, 99))}.${pad(int(1, 999), 6)}/${created.getFullYear()}-${pad(int(10, 99))}`,
      value.toFixed(2), isoDate(due), effective, chance(0.8) ? pick(activeNames.filter((n) => n !== effective)) : null,
      pick(MODALITIES.slice(0, 18)), chance(0.75) ? 'new' : 'old', sqlDateTime(created),
      closedAt ? isoDate(closedAt) : null, closedReason, variable]);
  }
  await insert('contracts', ['id', 'process_name', 'object_description', 'process_number', 'contract_value', 'due_date', 'fiscal_effective', 'fiscal_substitute', 'modality', 'law_type', 'created_at', 'closed_at', 'closed_reason', 'value_variable'], contracts);
  await insert('contract_events', ['contract_id', 'type', 'event_date', 'amendment_number', 'previous_due_date', 'new_due_date', 'previous_value', 'new_value', 'notes', 'changes', 'user_id', 'user_name', 'previous_value_variable', 'new_value_variable', 'created_at'], eventRows);

  // ── Anexos (≥30): termo de contrato em 20 contratos e termo de aditivo nos primeiros aditivos ──
  const docRows = [];
  contracts.slice(0, 20).forEach(([id, company]) => {
    const pdf = tinyPdf(`Termo de contrato - ${company}`);
    docRows.push([id, null, 'term', `Termo de contrato - ${company}.pdf`, 'application/pdf', pdf.length, pdf, admin.username]);
  });
  const [amendmentEvents] = await conn.query("SELECT id, contract_id, amendment_number FROM contract_events WHERE type = 'amendment' ORDER BY id LIMIT 20");
  for (const ev of amendmentEvents) {
    const pdf = tinyPdf(`Termo do ${ev.amendment_number}o aditivo`);
    docRows.push([ev.contract_id, ev.id, 'amendment', `Termo do ${ev.amendment_number}º aditivo.pdf`, 'application/pdf', pdf.length, pdf, admin.username]);
  }
  await insert('contract_documents', ['contract_id', 'event_id', 'kind', 'file_name', 'mime_type', 'size_bytes', 'data', 'user_name'], docRows);

  // ── Configurações iguais às do banco local ──
  await conn.query(`INSERT INTO app_settings (setting_key, setting_value) SELECT setting_key, setting_value FROM \`${SOURCE_DB}\`.app_settings`);

  const counts = {};
  for (const { name } of tables) counts[name] = (await conn.query(`SELECT COUNT(*) AS n FROM \`${name}\``))[0][0].n;
  console.table(counts);
  console.log(`\nPronto. Usuários: admin (e os outros 30) com a senha ${DEMO_PASSWORD}.`);
  console.log(`Para usar: na raiz do projeto, DB_NAME=${DEMO_DB} ./dev.sh`);
  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
