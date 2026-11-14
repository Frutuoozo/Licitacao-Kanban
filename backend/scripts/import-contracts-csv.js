import crypto from 'crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import db from '../db.js';
import { validateContractPayload } from '../validation.js';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  return rows;
}

function parseCurrency(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-' || /vari[aá]vel/i.test(raw)) return null;
  const normalized = raw.replace(/R\$/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function rowToContract(row) {
  const currentValue = parseCurrency(row[11]);
  const initialValue = parseCurrency(row[7]);
  return {
    processName: clean(row[1]),
    objectDescription: clean(row[5]),
    processNumber: clean(row[3]),
    contractValue: currentValue ?? initialValue,
    dueDate: parseDate(row[13]) || parseDate(row[23]) || parseDate(row[9]),
    fiscalEffective: clean(row[28]),
    fiscalSubstitute: clean(row[30]),
    modality: clean(row[4]),
    lawType: /8\.666/.test(clean(row[2])) ? 'old' : 'new',
  };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceArg = args.find((arg) => arg !== '--dry-run');

if (!sourceArg) {
  console.error('Uso: node scripts/import-contracts-csv.js <arquivo.csv> [--dry-run]');
  process.exitCode = 1;
} else {
  const sourcePath = path.resolve(sourceArg);
  const rows = parseCsv(await readFile(sourcePath, 'utf8')).slice(2);
  const valid = [];
  const invalid = [];

  rows.forEach((row, index) => {
    const contract = rowToContract(row);
    const validated = validateContractPayload(contract);
    if (typeof validated === 'string') invalid.push({ line: index + 3, processNumber: contract.processNumber, error: validated });
    else valid.push(validated.data);
  });

  console.log(`Linhas de dados: ${rows.length}`);
  console.log(`Contratos válidos: ${valid.length}`);
  console.log(`Linhas rejeitadas: ${invalid.length}`);
  invalid.forEach((item) => console.log(`- Linha ${item.line} (${item.processNumber || 'sem processo'}): ${item.error}`));

  if (!dryRun && valid.length > 0) {
    const connection = await db.getConnection();
    let inserted = 0;
    let updated = 0;
    try {
      await connection.beginTransaction();
      for (const contract of valid) {
        const [existing] = await connection.query('SELECT id FROM contracts WHERE process_number = ? LIMIT 1', [contract.processNumber]);
        if (existing.length > 0) {
          await connection.query(
            `UPDATE contracts SET process_name = ?, object_description = ?, contract_value = ?, due_date = ?,
             fiscal_effective = ?, fiscal_substitute = ?, modality = ?, law_type = ? WHERE id = ?`,
            [contract.processName, contract.objectDescription, contract.contractValue, contract.dueDate,
              contract.fiscalEffective, contract.fiscalSubstitute, contract.modality, contract.lawType, existing[0].id]
          );
          updated += 1;
        } else {
          await connection.query(
            `INSERT INTO contracts (id, process_name, object_description, process_number, contract_value,
             due_date, fiscal_effective, fiscal_substitute, modality, law_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), contract.processName, contract.objectDescription, contract.processNumber,
              contract.contractValue, contract.dueDate, contract.fiscalEffective, contract.fiscalSubstitute,
              contract.modality, contract.lawType]
          );
          inserted += 1;
        }
      }
      await connection.commit();
      console.log(`Importação concluída: ${inserted} incluídos e ${updated} atualizados.`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  await db.end();
}
