import { withTransaction } from './db.js';
import { ClientError } from './errors.js';

// Trava as linhas dos admins e a do usuário até o fim da transação. Duas exclusões ou rebaixamentos ao mesmo
// tempo passam a esperar um pelo outro, e o segundo já conta os admins depois do primeiro: sem a trava, cada um
// via "ainda sobra outro admin" e os dois seguiam, deixando o sistema sem administrador.
async function lockAdminsAndUser(conn, userId) {
  const [rows] = await conn.query("SELECT id, role FROM users WHERE role = 'admin' OR id = ? FOR UPDATE", [userId]);
  const user = rows.find((row) => row.id === userId);
  if (!user) throw new ClientError('Usuário não encontrado', 404);
  return { user, adminCount: rows.filter((row) => row.role === 'admin').length };
}

// Remove o usuário e o histórico de acessos dele numa transação: se uma parte falhar, nada é apagado.
// Recusa (ClientError) quando é o último administrador.
export function deleteUser(userId) {
  return withTransaction(async (conn) => {
    const { user, adminCount } = await lockAdminsAndUser(conn, userId);
    if (user.role === 'admin' && adminCount <= 1) {
      throw new ClientError('Não é possível excluir o último administrador');
    }
    await conn.query('DELETE FROM login_events WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM users WHERE id = ?', [userId]);
  });
}

// Troca o papel do usuário. Recusa (ClientError) rebaixar o último administrador.
export function changeUserRole(userId, role) {
  return withTransaction(async (conn) => {
    const { user, adminCount } = await lockAdminsAndUser(conn, userId);
    if (user.role === 'admin' && role !== 'admin' && adminCount <= 1) {
      throw new ClientError('Deve existir pelo menos um administrador');
    }
    await conn.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
  });
}
