// Migration 023: dados da contratada (CNPJ, e-mail, telefone), início da vigência e PCA (projeto e conta
// contábil) no contrato. Todos opcionais: os contratos que já existem ficam sem esses dados.
export async function migrateContractDetails(db) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'contractor_cnpj'`
  );
  if (cols.length > 0) return false;
  await db.query(`ALTER TABLE contracts
    ADD COLUMN contractor_cnpj CHAR(14) NULL,
    ADD COLUMN contractor_email VARCHAR(254) NULL,
    ADD COLUMN contractor_phone VARCHAR(20) NULL,
    ADD COLUMN start_date DATE NULL,
    ADD COLUMN pca_project VARCHAR(255) NULL,
    ADD COLUMN pca_account VARCHAR(120) NULL`);
  return true;
}
