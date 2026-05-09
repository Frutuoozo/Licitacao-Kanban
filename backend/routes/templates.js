import express from 'express';
import db from '../db.js';

const router = express.Router();

function parseItems(row) {
  const raw = row.items;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// GET all templates — objeto nome -> { items, color, order } (ordem preservada)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT name, items, sort_order, type_color FROM templates ORDER BY sort_order ASC, name ASC'
    );

    const templates = {};
    rows.forEach((row, idx) => {
      const items = parseItems(row);
      if (Array.isArray(items)) {
        templates[row.name] = {
          items,
          color: row.type_color || null,
          order: row.sort_order ?? idx,
        };
      } else if (items && typeof items === 'object' && Array.isArray(items.items)) {
        templates[row.name] = {
          items: items.items,
          color: row.type_color || items.color || null,
          order: row.sort_order ?? items.order ?? idx,
        };
      } else {
        templates[row.name] = { items: [], color: row.type_color || null, order: row.sort_order ?? idx };
      }
    });

    res.json(templates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// PUT — body: { "Tipo": { items: [...], color: "#hex", order: n }, ... } ou legado { "Tipo": [...] }
router.put('/', async (req, res) => {
  const templates = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query('DELETE FROM templates');

    const entries = Object.entries(templates || {});
    if (entries.length > 0) {
      const normalized = entries.map(([name, val], i) => {
        let items;
        let color = null;
        let sortOrder = i;
        if (Array.isArray(val)) {
          items = val;
        } else if (val && typeof val === 'object') {
          items = val.items || [];
          color = val.color || null;
          if (typeof val.order === 'number') sortOrder = val.order;
        } else {
          items = [];
        }
        return [name, JSON.stringify(items), sortOrder, color];
      });

      normalized.sort((a, b) => a[2] - b[2]);

      const values = normalized.map((row) => [row[0], row[1], row[2], row[3]]);
      await connection.query(
        'INSERT INTO templates (name, items, sort_order, type_color) VALUES ?',
        [values]
      );
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Failed to update templates' });
  } finally {
    connection.release();
  }
});

export default router;
