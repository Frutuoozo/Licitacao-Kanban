// CNPJ da contratada: máscara enquanto digita e a mesma conferência de dígitos do backend (isValidCnpj em
// backend/validation.js), para avisar antes de enviar.

export const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

// Máscara progressiva até 00.000.000/0000-00; o que passa de 14 dígitos é ignorado.
export function formatCnpj(value) {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function isValidCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const checkDigit = (length) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const rest = weights.reduce((total, weight, i) => total + Number(digits[i]) * weight, 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return checkDigit(12) === Number(digits[12]) && checkDigit(13) === Number(digits[13]);
}
