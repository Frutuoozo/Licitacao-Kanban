import { withTransaction } from './db.js';

// Remove o usuário e o histórico de acessos dele numa transação: se uma parte falhar, nada é apagado.
export function deleteUser(userId) {
  return withTransaction(async (conn) => {
    await conn.query('DELETE FROM login_events WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM users WHERE id = ?', [userId]);
  });
}
