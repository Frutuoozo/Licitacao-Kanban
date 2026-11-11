// Processo iniciado não pode perder número, vencimento nem tipo (os três são obrigatórios desde o cadastro).
// Processo antigo que já não tinha o campo continua editável. Mesma regra e mesmas mensagens do servidor
// (backend/routes/processes.js): a tela avisa antes de gravar, porque o quadro grava sem esperar a resposta.
export function clearedStartedField(column, { processNumber, dueDate, type }) {
  const filled = (value) => String(value ?? "").trim() !== "";
  if (filled(column.processNumber) && !filled(processNumber)) return "Informe o número do processo.";
  if (filled(column.dueDate) && !filled(dueDate)) return "Informe a data de vencimento.";
  if (filled(column.type) && !filled(type)) return "Informe o tipo de processo.";
  return null;
}
