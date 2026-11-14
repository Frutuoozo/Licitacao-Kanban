import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db, { withTransaction } from '../db.js';
import { getIO } from '../socket.js';
import crypto from 'crypto';
import { requireAdmin } from '../middleware/admin.js';
import { isHexColor, isNonEmptyString, MAX_LENGTHS, normalizeText } from '../validation.js';
import { ClientError, sendError } from '../errors.js';
import { createRouter } from '../asyncRouter.js';

const router = createRouter();
const templateWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas alterações em modelos. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

function parseItems(row) {
  const raw = row.items;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// Item do modelo como é gravado em process_items: texto vira documento sem cor.
const toItemRow = (item) => (typeof item === 'string'
  ? { type: 'doc', name: item, bgColor: null }
  : { type: item?.type || 'doc', name: item?.name || '', bgColor: item?.bgColor || null });

// Lista de itens comparável: 'Termo' e { type: 'doc', name: 'Termo' } são o mesmo item. Aceita o formato
// antigo da coluna ({ items: [...] }). O MySQL reordena as chaves do JSON, então não dá para comparar o texto.
const itemsKey = (items) => {
  const list = Array.isArray(items) ? items : Array.isArray(items?.items) ? items.items : [];
  return JSON.stringify(list.map((item) => { const row = toItemRow(item); return [row.type, row.name, row.bgColor]; }));
};

// Sincroniza os processos ativos com os templates: cor do tipo e lista de itens, preservando
// o 'is_done' por nome do item. Tudo em lote (número fixo de consultas, independente de quantos processos).
// `templates` é um Map nome limpo -> { items, color }: com um objeto comum, templates['constructor']
// devolvia uma função do JavaScript e o processo desse tipo perdia os itens.
// `itemsChanged`: nomes dos modelos cujos itens mudaram. Só os processos desses modelos têm os itens
// regravados; os outros mantêm os próprios (inclusive ajustes feitos só naquele processo). Sem ele, todos.
export async function syncActiveProcesses(connection, templates, itemsChanged = null) {
  const [activeProcesses] = await connection.query(
    "SELECT id, type, typeColor FROM processes WHERE status IN ('active', 'pending')"
  );
  const targets = activeProcesses.filter((process) => process.type && templates.has(process.type));
  if (targets.length === 0) return;

  // 1. Cor: um UPDATE por cor nova, cobrindo todos os processos que precisam dela.
  const idsByColor = new Map();
  for (const process of targets) {
    const { color } = templates.get(process.type);
    if (process.typeColor === color) continue;
    if (!idsByColor.has(color)) idsByColor.set(color, []);
    idsByColor.get(color).push(process.id);
  }
  for (const [color, ids] of idsByColor) {
    await connection.query('UPDATE processes SET typeColor = ? WHERE id IN (?)', [color, ids]);
  }

  // 2. Itens: lê os concluídos de todos os processos de uma vez, apaga e reinsere em lote.
  // FOR UPDATE trava os itens até o fim da transação: quem marca um item ao mesmo tempo espera, ou é
  // esperado, e a marcação não se perde entre a leitura e a regravação.
  const itemTargets = itemsChanged ? targets.filter((process) => itemsChanged.has(process.type)) : targets;
  if (itemTargets.length === 0) return;
  const itemTargetIds = itemTargets.map((process) => process.id);
  const [lockedItems] = await connection.query(
    'SELECT process_id, name, is_done FROM process_items WHERE process_id IN (?) FOR UPDATE',
    [itemTargetIds]
  );
  const doneItems = lockedItems.filter((item) => item.is_done);
  const doneByProcess = new Map();
  for (const item of doneItems) {
    if (!doneByProcess.has(item.process_id)) doneByProcess.set(item.process_id, new Set());
    doneByProcess.get(item.process_id).add(item.name);
  }

  const newProcessItems = itemTargets.flatMap((process) => {
    const done = doneByProcess.get(process.id);
    return templates.get(process.type).items.map((item, index) => {
      const { type: itemType, name: itemName, bgColor: itemBgColor } = toItemRow(item);
      const isDone = done?.has(itemName) ? 1 : 0;
      return [crypto.randomUUID(), process.id, itemType, itemName, isDone, itemBgColor, index];
    });
  });

  await connection.query('DELETE FROM process_items WHERE process_id IN (?)', [itemTargetIds]);
  if (newProcessItems.length > 0) {
    await connection.query(
      'INSERT INTO process_items (id, process_id, type, name, is_done, bg_color, order_index) VALUES ?',
      [newProcessItems]
    );
  }
}

// GET all templates — objeto nome -> { items, color, order } (ordem preservada)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT name, items, sort_order, type_color, description FROM templates ORDER BY sort_order ASC, name ASC'
    );

    const templates = {};
    rows.forEach((row, idx) => {
      const items = parseItems(row);
      if (Array.isArray(items)) {
        templates[row.name] = {
          items,
          color: row.type_color || null,
          order: row.sort_order ?? idx,
          description: row.description || '',
        };
      } else if (items && typeof items === 'object' && Array.isArray(items.items)) {
        templates[row.name] = {
          items: items.items,
          color: row.type_color || items.color || null,
          order: row.sort_order ?? items.order ?? idx,
          description: row.description || '',
        };
      } else {
        templates[row.name] = { items: [], color: row.type_color || null, order: row.sort_order ?? idx, description: row.description || '' };
      }
    });

    res.json(templates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Chave de comparação de nomes igual à do MySQL (utf8mb4_0900_ai_ci): ignora maiúsculas e acentos.
const nameKey = (name) => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const ITEM_TYPES = ['doc', 'phase'];

// Itens de um modelo: texto (documento) ou { type, name, bgColor }, como a sincronização grava em
// process_items. Item fora disso virava erro 500 do banco ou item sem nome nos processos.
function checkTemplateItems(items, templateName) {
  if (!Array.isArray(items)) throw new ClientError(`Itens inválidos no modelo ${templateName}.`);
  for (const item of items) {
    const isObject = item !== null && typeof item === 'object' && !Array.isArray(item);
    const name = typeof item === 'string' ? item : isObject ? item.name : null;
    const type = isObject ? item.type || 'doc' : 'doc';
    const bgColor = isObject ? item.bgColor || null : null;
    if (!isNonEmptyString(name, MAX_LENGTHS.docName) || !ITEM_TYPES.includes(type) || (bgColor !== null && !isHexColor(bgColor))) {
      throw new ClientError(`Item inválido no modelo ${templateName}.`);
    }
  }
}

// Valida e converte o payload em linhas da tabela templates. Lança ClientError com a mensagem para o usuário.
export function parseTemplates(templates) {
  // Salvar apaga todos os modelos e grava a lista recebida: uma lista vazia (ex.: bug na tela) apagaria tudo.
  if (Object.keys(templates).length === 0) throw new ClientError('É preciso ter pelo menos um modelo.');
  const seen = new Set();
  const rows = Object.entries(templates).map(([name, val], i) => {
    const cleanName = normalizeText(name);
    if (!isNonEmptyString(cleanName, MAX_LENGTHS.templateName)) throw new ClientError('Nome de template inválido');
    if (seen.has(nameKey(cleanName))) throw new ClientError(`Nome de modelo repetido: ${cleanName}`);
    seen.add(nameKey(cleanName));

    let items = [];
    let color = null;
    let sortOrder = i;
    let description = null;
    if (Array.isArray(val)) {
      items = val;
    } else if (val && typeof val === 'object') {
      items = val.items || [];
      color = val.color || null;
      if (typeof val.order === 'number') sortOrder = val.order;
      description = normalizeText(val.description).slice(0, 255) || null;
      if (color !== null && !isHexColor(color)) throw new ClientError('Cor de template inválida');
    }
    checkTemplateItems(items, cleanName);
    return [cleanName, JSON.stringify(items), sortOrder, color, description];
  });
  return rows.sort((a, b) => a[2] - b[2]);
}

// PUT — body: { "Tipo": { items: [...], color: "#hex", order: n }, ... } ou legado { "Tipo": [...] }
router.put('/', requireAdmin, templateWriteLimiter, async (req, res) => {
  const templates = req.body;
  if (!templates || typeof templates !== 'object' || Array.isArray(templates)) {
    return res.status(400).json({ error: 'Payload de templates inválido' });
  }

  try {
    // Validação antes da transação: payload inválido não chega a mexer no banco.
    const rows = parseTemplates(templates);
    // Daqui em diante vale o que foi gravado (nomes sem espaços nas pontas), não o payload cru: com o nome
    // " Compras ", os processos do tipo Compras não eram sincronizados.
    const saved = new Map(rows.map(([name, items, order, color, description]) => [name, { items: JSON.parse(items), color, order, description: description || '' }]));
    await withTransaction(async (connection) => {
      // Itens de antes (travados até o fim): só os modelos que mudaram regravam os itens dos seus processos.
      const [previous] = await connection.query('SELECT name, items FROM templates FOR UPDATE');
      const previousKeys = new Map(previous.map((row) => [row.name, itemsKey(parseItems(row))]));
      const itemsChanged = new Set([...saved].filter(([name, t]) => previousKeys.get(name) !== itemsKey(t.items)).map(([name]) => name));
      await connection.query('DELETE FROM templates');
      await connection.query('INSERT INTO templates (name, items, sort_order, type_color, description) VALUES ?', [rows]);
      await syncActiveProcesses(connection, saved, itemsChanged);
    });
    getIO()?.emit('templates:updated', Object.fromEntries(saved));
    res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 'Falha ao salvar os modelos.');
  }
});

export default router;
