// CNPJ da contratada no formulário: máscara enquanto digita e a mesma conferência de dígitos do backend.
import { formatCnpj, isValidCnpj, onlyDigits } from "./contractFields";

test("onlyDigits tira tudo que não é dígito", () => {
  expect(onlyDigits("11.222.333/0001-81")).toBe("11222333000181");
  expect(onlyDigits(undefined)).toBe("");
});

test("formatCnpj aplica a máscara completa", () => {
  expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
});

test("formatCnpj aplica a máscara aos poucos, enquanto digita", () => {
  expect(formatCnpj("")).toBe("");
  expect(formatCnpj("11")).toBe("11");
  expect(formatCnpj("11222")).toBe("11.222");
  expect(formatCnpj("11222333")).toBe("11.222.333");
  expect(formatCnpj("112223330001")).toBe("11.222.333/0001");
});

test("formatCnpj ignora o que passa de 14 dígitos", () => {
  expect(formatCnpj("11.222.333/0001-81999")).toBe("11.222.333/0001-81");
});

test("isValidCnpj confere os dígitos verificadores", () => {
  expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  expect(isValidCnpj("11222333000505")).toBe(true);
  expect(isValidCnpj("11222333000182")).toBe(false);
  expect(isValidCnpj("11111111111111")).toBe(false);
  expect(isValidCnpj("1122233300018")).toBe(false);
});
