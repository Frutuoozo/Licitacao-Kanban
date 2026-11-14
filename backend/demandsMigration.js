// Demandas: processo pendente (ainda não iniciado), data de início e observação.
// Processos que já existem contam como iniciados na data em que foram criados.
export async function migrateDemands(db) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processes' AND COLUMN_NAME = 'started_at'`
  );
  if (cols.length > 0) return false;
  await db.query(`ALTER TABLE processes
    MODIFY COLUMN status ENUM('active', 'archived', 'pending') DEFAULT 'active',
    ADD COLUMN started_at DATETIME NULL,
    ADD COLUMN notes TEXT NULL`);
  // updated_at = updated_at: a coluna tem ON UPDATE CURRENT_TIMESTAMP e, sem isso, viraria "agora".
  await db.query('UPDATE processes SET started_at = created_at, updated_at = updated_at');
  return true;
}

// Prioridade da demanda. Processos que já existem ficam como rotina.
export async function migrateDemandPriority(db) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processes' AND COLUMN_NAME = 'priority'`
  );
  if (cols.length > 0) return false;
  await db.query("ALTER TABLE processes ADD COLUMN priority ENUM('urgent', 'high', 'moderate', 'routine') NOT NULL DEFAULT 'routine'");
  return true;
}