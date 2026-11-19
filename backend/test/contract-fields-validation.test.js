// Campos da contratada (CNPJ, e-mail, telefone), início da vigência e PCA (projeto e conta contábil):
// CNPJ (guardado só com os 14 dígitos), início da vigência e PCA são obrigatórios; e-mail e telefone são opcionais e,
// quando preenchidos, precisam ser válidos.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCnpj, validateContractPayload } from '../validation.js';

const base = {
  processName: 'Nordeste Telecom', objectDescription: 'Objeto de teste', processNumber: '001/2026',
  contractValue: 1000, dueDate: '2030-01-01', fiscalEffective: 'Maria', modality: 'Pregão Eletrônico', lawType: 'new',
  contractorCnpj: '11222333000181', startDate: '2026-01-01', pcaProject: 'Projeto 12', pcaAccount: '3.3.90.39',
};
const validate = (extra) => validateContractPayload({ ...base, ...extra });

describe('isValidCnpj', () => {
  test('aceita CNPJ com dígitos verificadores certos', () => assert.equal(isValidCnpj('11222333000181'), true));
  // Resto da divisão menor que 2: o dígito verificador é 0.
  test('aceita CNPJ com dígito verificador 0', () => assert.equal(isValidCnpj('11222333000505'), true));
  test('recusa dígito verificador errado', () => assert.equal(isValidCnpj('11222333000182'), false));
  test('recusa sequência repetida', () => assert.equal(isValidCnpj('00000000000000'), false));
  test('recusa tamanho diferente de 14', () => assert.equal(isValidCnpj('123'), false));
});

describe('validateContractPayload — contratada, vigência e PCA', () => {
  test('sem CNPJ é recusado', () => {
    assert.equal(validate({ contractorCnpj: undefined }), 'CNPJ obrigatório');
    assert.equal(validate({ contractorCnpj: '  ' }), 'CNPJ obrigatório');
  });

  test('sem início da vigência é recusado', () => {
    assert.equal(validate({ startDate: undefined }), 'Início da vigência obrigatório');
    assert.equal(validate({ startDate: '' }), 'Início da vigência obrigatório');
  });

  test('sem projeto do PCA é recusado', () => {
    assert.equal(validate({ pcaProject: ' ' }), 'Projeto do PCA obrigatório');
  });

  test('sem conta contábil é recusado', () => {
    assert.equal(validate({ pcaAccount: undefined }), 'Conta contábil obrigatória');
  });

  test('importação de planilha antiga dispensa CNPJ, vigência e PCA (legacyImport)', () => {
    const { contractorCnpj, startDate, pcaProject, pcaAccount, ...legacy } = base;
    const { data } = validateContractPayload(legacy, { legacyImport: true });
    assert.deepEqual([data.contractorCnpj, data.startDate, data.pcaProject, data.pcaAccount], [null, null, null, null]);
  });

  test('sem e-mail e telefone, os dois ficam null', () => {
    const { data } = validate({ contractorEmail: ' ', contractorPhone: '' });
    assert.deepEqual([data.contractorEmail, data.contractorPhone], [null, null]);
  });

  test('CNPJ com máscara é guardado só com os dígitos', () => {
    assert.equal(validate({ contractorCnpj: '11.222.333/0001-81' }).data.contractorCnpj, '11222333000181');
    assert.equal(validate({ contractorCnpj: ' 11222333000181 ' }).data.contractorCnpj, '11222333000181');
  });

  for (const cnpj of ['11222333000182', '00000000000000', '123', '11.222.333/0001-8X']) {
    test(`recusa CNPJ ${cnpj}`, () => assert.equal(validate({ contractorCnpj: cnpj }), 'CNPJ inválido'));
  }

  test('e-mail válido é aceito; inválido é recusado', () => {
    assert.equal(validate({ contractorEmail: ' contato@empresa.com.br ' }).data.contractorEmail, 'contato@empresa.com.br');
    assert.equal(validate({ contractorEmail: 'a@b' }), 'E-mail da contratada inválido');
  });

  for (const phone of ['(86) 99999-0000', '+55 86 3222-1111']) {
    test(`aceita telefone ${phone}`, () => assert.equal(validate({ contractorPhone: phone }).data.contractorPhone, phone));
  }
  for (const phone of ['abc', '(86) 99999-0000000000', '1234']) {
    test(`recusa telefone ${phone}`, () => assert.equal(validate({ contractorPhone: phone }), 'Telefone da contratada inválido'));
  }

  test('início da vigência igual ao vencimento é aceito', () => {
    assert.equal(validate({ startDate: '2030-01-01' }).data.startDate, '2030-01-01');
  });
  test('início da vigência depois do vencimento é recusado', () => {
    assert.equal(validate({ startDate: '2030-01-02' }), 'O início da vigência não pode ser depois do vencimento');
  });
  test('início da vigência com data inexistente é recusado', () => {
    assert.equal(validate({ startDate: '2030-13-01' }), 'Data de início da vigência inválida');
  });

  test('projeto e conta contábil respeitam o tamanho da coluna', () => {
    assert.equal(validate({ pcaProject: 'P'.repeat(255), pcaAccount: 'C'.repeat(120) }).data.pcaProject.length, 255);
    assert.equal(validate({ pcaProject: 'P'.repeat(256) }), 'Projeto do PCA muito longo');
    assert.equal(validate({ pcaAccount: 'C'.repeat(121) }), 'Conta contábil muito longa');
  });

  test('nome da empresa vazio é recusado com o rótulo novo', () => {
    assert.equal(validate({ processName: '' }), 'Nome da empresa obrigatório');
  });
});
