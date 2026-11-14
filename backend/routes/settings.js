import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { requireAdmin } from '../middleware/admin.js';
import { createRouter } from '../asyncRouter.js';

// Configurações administrativas gerais (chave/valor). Leitura para todos os autenticados,
// porque o app precisa delas em qualquer perfil (ex.: tempo de sessão); gravação só para admin.
const router = createRouter();
const settingsWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas alterações em pouco tempo. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

export const SESSION_MINUTES_OPTIONS = [15, 30, 60, 120];
const LOCKOUT_ATTEMPTS_OPTIONS = [3, 5, 10];
const LOCKOUT_MINUTES_OPTIONS = [5, 15, 30, 60];
const PASSWORD_DAYS_OPTIONS = [30, 60, 90, 180];

// Cada configuração: tipo (bool ou número com opções permitidas) e valor padrão.
const SETTINGS_SCHEMA = {
  sessionTimeoutEnabled: { type: 'bool', default: true },
  sessionTimeoutMinutes: { type: 'number', options: SESSION_MINUTES_OPTIONS, default: 30 },
  confirmBeforeDelete: { type: 'bool', default: true },
  lockoutEnabled: { type: 'bool', default: true },
  lockoutAttempts: { type: 'number', options: LOCKOUT_ATTEMPTS_OPTIONS, default: 5 },
  lockoutMinutes: { type: 'number', options: LOCKOUT_MINUTES_OPTIONS, default: 15 },
  passwordExpiryEnabled: { type: 'bool', default: false },
  passwordExpiryDays: { type: 'number', options: PASSWORD_DAYS_OPTIONS, default: 90 },
};
export const SETTINGS_DEFAULTS = Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([key, def]) => [key, def.default]));

export async function readSettings(conn = db) {
  const [rows] = await conn.query('SELECT setting_key, setting_value FROM app_settings');
  const stored = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  return Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([key, def]) => {
    const raw = stored[key];
    if (raw === undefined) return [key, def.default];
    if (def.type === 'bool') return [key, raw === 'true'];
    return [key, def.options.includes(Number(raw)) ? Number(raw) : def.default];
  }));
}

router.get('/', async (_req, res) => {
  try {
    res.json(await readSettings());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao carregar configurações' });
  }
});

router.put('/', requireAdmin, settingsWriteLimiter, async (req, res) => {
  const body = req.body || {};
  const next = {};
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) {
    if (body[key] === undefined) continue;
    if (def.type === 'bool') next[key] = body[key] === true;
    else if (def.options.includes(Number(body[key]))) next[key] = Number(body[key]);
    else return res.status(400).json({ error: `Valor inválido para ${key}.` });
  }
  try {
    // Todas as chaves num upsert só (uma consulta, atômica).
    const rows = Object.entries(next).map(([key, value]) => [key, String(value), req.userId || null]);
    if (rows.length > 0) {
      await db.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES ?
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [rows]
      );
    }
    res.json(await readSettings());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao salvar configurações' });
  }
});

export default router;
