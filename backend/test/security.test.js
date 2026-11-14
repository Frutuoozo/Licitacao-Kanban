import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword } from '../security.js';
import { isAdminRole, isEditorOrAdminRole } from '../permissions.js';
import { validateProcessPayload } from '../validation.js';

// Política atual: 8+ caracteres, 1 maiúscula, 1 número e 1 caractere especial (conferidos nessa ordem).
test('validatePassword rejects short or simple passwords', () => {
  assert.equal(validatePassword('abc'), 'A senha deve conter no mínimo 8 caracteres');
  assert.equal(validatePassword(12345678), 'A senha deve conter no mínimo 8 caracteres');
  assert.equal(validatePassword('abcdefgh'), 'A senha deve conter pelo menos uma letra maiúscula');
  assert.equal(validatePassword('Abcdefgh'), 'A senha deve conter pelo menos um número');
  assert.equal(validatePassword('Abcdefg1'), 'A senha deve conter pelo menos um caractere especial');
});

test('validatePassword accepts a password that follows every rule', () => {
  assert.equal(validatePassword('Abcdef1!'), null);
  assert.equal(validatePassword('Senha#2026 com espaço'), null);
});

test('permission helpers accept only expected roles', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('editor'), false);
  assert.equal(isEditorOrAdminRole('admin'), true);
  assert.equal(isEditorOrAdminRole('editor'), true);
  assert.equal(isEditorOrAdminRole('viewer'), false);
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
