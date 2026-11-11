// Datas: além do formato AAAA-MM-DD, o dia precisa existir no calendário. Antes, 2026-02-31 passava
// pela validação e chegava ao banco (erro 500 ou data inválida gravada).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDateString, validateContractPayload, validateProcessPayload } from '../validation.js';

describe('isValidDateString', () => {
  for (const date of ['2026-01-01', '2026-12-31', '2026-02-28', '2028-02-29', '2000-02-29', '2026-04-30']) {
    test(`aceita ${date}`, () => assert.equal(isValidDateString(date), true));
  }

  for (const date of ['2026-02-31', '2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32', '0000-01-01']) {
    test(`recusa ${date}, que não existe no calendário`, () => assert.equal(isValidDateString(date), false));
  }

  for (const value of ['2026-1-01', '01/02/2026', '2026-01-01T00:00', '', null, undefined, 20260101]) {
    test(`recusa formato inválido: ${JSON.stringify(value)}`, () => assert.equal(isValidDateString(value), false));
  }
});

describe('cadastros com data impossível', () => {
  test('processo com vencimento 31/02 é recusado', () => {
    const result = validateProcessPayload({ title: 'Teste', setor: 'Maria', dueDate: '2026-02-31' });
    assert.equal(result, 'Data de vencimento inválida');
  });

  test('contrato com vencimento 31/04 é recusado', () => {
    const result = validateContractPayload({
      processName: 'Teste', objectDescription: 'Objeto', processNumber: '001/2026', contractValue: 10,
      dueDate: '2026-04-31', fiscalEffective: 'Maria', modality: 'Pregão Eletrônico', lawType: 'new',
    });
    assert.equal(result, 'Data de vencimento inválida');
  });
});
