const MAX_LENGTHS = {
  username: 80,
  name: 255,
  title: 255,
  processNumber: 120,
  setor: 120,
  type: 120,
  typeColor: 32,
  email: 254,
  cpf: 18,
  docName: 255,
  templateName: 120,
  genericText: 500,
  contractObject: 2000,
  processNotes: 2000,
};

export function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

const PROCESS_PRIORITIES = ['urgent', 'high', 'moderate', 'routine'];

export function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Dia atual em Teresina (AAAA-MM-DD). O servidor roda em UTC: às 21h de lá já seria o dia seguinte.
export function isoToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(now);
}

export function isPastDate(value, now = new Date()) {
  return value < isoToday(now);
}

export function isValidEmail(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= MAX_LENGTHS.email
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidCpf(value) {
  return typeof value === 'string' && /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value.trim());
}

export function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function isAllowedRole(value) {
  return ['admin', 'editor', 'viewer'].includes(value);
}

export function isAllowedStatus(value) {
  return ['active', 'archived'].includes(value);
}

export function sanitizeProcessDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const id = normalizeText(doc.id);
  const type = normalizeText(doc.type);
  const name = normalizeText(doc.name);
  const bgColor = doc.bgColor == null ? null : normalizeText(doc.bgColor);
  if (!id || !isNonEmptyString(type, MAX_LENGTHS.type) || !isNonEmptyString(name, MAX_LENGTHS.docName)) {
    return null;
  }
  if (bgColor !== null && !isHexColor(bgColor)) return null;
  return {
    id,
    type,
    name,
    done: Boolean(doc.done),
    bgColor,
  };
}

export function validateProcessPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Payload inválido';
  const title = normalizeText(payload.title);
  const processNumber = normalizeText(payload.processNumber);
  const setor = normalizeText(payload.setor);
  const type = payload.type == null ? null : normalizeText(payload.type);
  const typeColor = payload.typeColor == null ? null : normalizeText(payload.typeColor);
  const dueDate = payload.dueDate == null ? null : normalizeText(payload.dueDate);
  const status = payload.status == null ? 'active' : normalizeText(payload.status);
  // Sem o campo (undefined), quem grava mantém a observação atual.
  const notes = payload.notes === undefined ? undefined : (normalizeText(payload.notes) || null);
  // Sem o campo (undefined), quem grava mantém a prioridade atual; ao criar, vale rotina.
  const priority = payload.priority;

  if (!isNonEmptyString(title, MAX_LENGTHS.title)) return 'Título obrigatório';
  if (processNumber.length > MAX_LENGTHS.processNumber) return 'Número do processo muito longo';
  // Só a demanda pendente pode ficar sem gestor principal.
  if (status !== 'pending' && !setor) return 'Informe o gestor principal.';
  if (setor.length > MAX_LENGTHS.setor) return 'Nome do gestor muito longo.';
  if (type !== null && type.length > MAX_LENGTHS.type) return 'Tipo muito longo';
  if (typeColor !== null && !isHexColor(typeColor)) return 'Cor inválida';
  if (dueDate !== null && !isValidDateString(dueDate)) return 'Data de vencimento inválida';
  if (!isAllowedStatus(status) && status !== 'pending') return 'Status inválido';
  if (notes !== undefined && notes !== null && notes.length > MAX_LENGTHS.processNotes) return 'Observação muito longa.';
  if (priority !== undefined && !PROCESS_PRIORITIES.includes(priority)) return 'Prioridade inválida.';

  const docs = Array.isArray(payload.docs)
    ? payload.docs.map(sanitizeProcessDoc).filter(Boolean)
    : [];

  return {
    ok: true,
    data: {
      title,
      processNumber,
      setor,
      type,
      typeColor,
      docs,
      status,
      dueDate,
      notes,
      priority,
    }
  };
}

// Campos obrigatórios desde o cadastro da demanda. O número do processo só é exigido da iniciada:
// a pendente pode nascer sem ele, e ele é pedido quando ela for iniciada.
export function missingDemandField({ processNumber, dueDate, type, status }) {
  if (status !== 'pending' && !processNumber) return 'Informe o número do processo.';
  if (!dueDate) return 'Informe a data de vencimento.';
  if (!type) return 'Informe o tipo de processo.';
  return null;
}

export function validateContractPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Payload inválido';

  const processName = normalizeText(payload.processName);
  const objectDescription = normalizeText(payload.objectDescription);
  const processNumber = normalizeText(payload.processNumber);
  const fiscalEffective = normalizeText(payload.fiscalEffective);
  const fiscalSubstitute = normalizeText(payload.fiscalSubstitute);
  const modality = normalizeText(payload.modality);
  const lawType = normalizeText(payload.lawType);
  const dueDate = normalizeText(payload.dueDate);
  const valueVariable = payload.valueVariable === true;
  // Valor variável: sem valor definido; o número é opcional (guardado como 0 se não informado).
  const rawValue = payload.contractValue;
  const contractValue = valueVariable && (rawValue === '' || rawValue === null || rawValue === undefined || Number.isNaN(Number(rawValue)))
    ? 0
    : Number(rawValue);

  if (!isNonEmptyString(processName, MAX_LENGTHS.title)) return 'Nome do processo obrigatório';
  if (!isNonEmptyString(objectDescription, MAX_LENGTHS.contractObject)) return 'Descrição do objeto obrigatória';
  if (!isNonEmptyString(processNumber, MAX_LENGTHS.processNumber)) return 'Número do processo obrigatório';
  if (!Number.isFinite(contractValue) || contractValue < 0 || contractValue > 9999999999999.99) {
    return 'Valor do contrato inválido';
  }
  if (!isValidDateString(dueDate)) return 'Data de vencimento inválida';
  if (!isNonEmptyString(fiscalEffective, MAX_LENGTHS.name)) return 'Fiscal efetivo obrigatório';
  if (fiscalSubstitute.length > MAX_LENGTHS.name) return 'Nome do fiscal substituto muito longo';
  if (!isNonEmptyString(modality, MAX_LENGTHS.type)) return 'Modalidade obrigatória';
  if (!['old', 'new'].includes(lawType)) return 'Lei do contrato inválida';

  return {
    ok: true,
    data: {
      processName,
      objectDescription,
      processNumber,
      contractValue: contractValue.toFixed(2),
      valueVariable,
      dueDate,
      fiscalEffective,
      fiscalSubstitute: fiscalSubstitute || null,
      modality,
      lawType,
    },
  };
}

export { MAX_LENGTHS };
