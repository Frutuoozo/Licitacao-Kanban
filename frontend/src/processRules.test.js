import { clearedStartedField } from "./processRules";

// Mesma regra do servidor (backend/routes/processes.js): processo iniciado não perde número,
// vencimento nem tipo; processo antigo que já não tinha o campo continua editável.
const column = { processNumber: "001/2026", dueDate: "2030-01-15", type: "Compras" };
const edits = { processNumber: "001/2026", dueDate: "2030-01-15", type: "Compras" };

test("edição que mantém os três campos passa", () => {
  expect(clearedStartedField(column, edits)).toBeNull();
});

test("apagar o número do processo é recusado", () => {
  expect(clearedStartedField(column, { ...edits, processNumber: "  " })).toBe("Informe o número do processo.");
});

test("apagar o vencimento é recusado", () => {
  expect(clearedStartedField(column, { ...edits, dueDate: "" })).toBe("Informe a data de vencimento.");
});

test("apagar o tipo é recusado", () => {
  expect(clearedStartedField(column, { ...edits, type: null })).toBe("Informe o tipo de processo.");
});

test("processo antigo sem vencimento nem tipo continua editável", () => {
  const legacy = { processNumber: "001/2026", dueDate: null, type: null };
  expect(clearedStartedField(legacy, { processNumber: "001/2026", dueDate: "", type: null })).toBeNull();
});
