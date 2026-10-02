import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword } from '../security.js';
import { isAdminRole, isEditorOrAdminRole } from '../permissions.js';
import { normalizeContractUrl } from '../contracts.js';
import { validateProcessPayload } from '../validation.js';

test('validatePassword rejects short or simple passwords', () => {
  assert.equal(validatePassword('abc'), 'A senha deve conter no mínimo 8 caracteres');
  assert.equal(validatePassword('abcdefgh'), 'A senha deve conter pelo menos um caractere especial');
});

test('permission helpers accept only expected roles', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('editor'), false);
  assert.equal(isEditorOrAdminRole('admin'), true);
  assert.equal(isEditorOrAdminRole('editor'), true);
  assert.equal(isEditorOrAdminRole('viewer'), false);
});

test('normalizeContractUrl blocks non-google URLs', () => {
  const blocked = normalizeContractUrl('https://example.com/file.csv');
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Google/);

  const allowed = normalizeContractUrl('https://docs.google.com/spreadsheets/d/abc/export?format=csv');
  assert.equal(allowed.ok, true);
});

test('validateProcessPayload rejects invalid data and accepts a normal payload', () => {
  const invalid = validateProcessPayload({ title: '', setor: '', dueDate: '2026-99-99' });
  assert.equal(typeof invalid, 'string');

  const valid = validateProcessPayload({
    title: 'Processo 1',
    processNumber: '123',
    setor: 'Compras',
    type: 'Convênio',
    typeColor: '#ffcc00',
    docs: [{ id: '1', type: 'doc', name: 'Documento', done: true, bgColor: '#fff' }],
    status: 'active',
    dueDate: '2026-08-17',
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.data.title, 'Processo 1');
  assert.equal(valid.data.docs.length, 1);
});
