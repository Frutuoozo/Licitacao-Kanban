import express from 'express';
import db from '../db.js';
import { getIO } from '../socket.js';
import crypto from 'crypto';
import { requireAdmin } from '../middleware/admin.js';

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
router.put('/', requireAdmin, async (req, res) => {
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

      // Sincronizar processos ativos com os novos templates
      const [activeProcesses] = await connection.query(
        "SELECT id, type, typeColor FROM processes WHERE status = 'active'"
      );

      for (const process of activeProcesses) {
        if (!process.type || !templates[process.type]) continue;

        const tpl = templates[process.type];
        let tplItems = [];
        let tplColor = null;

        if (Array.isArray(tpl)) {
          tplItems = tpl;
        } else if (tpl && typeof tpl === 'object') {
          tplItems = tpl.items || [];
          tplColor = tpl.color || null;
        }

        // 1. Atualizar a cor do processo se necessário
        if (process.typeColor !== tplColor) {
          await connection.query(
            "UPDATE processes SET typeColor = ? WHERE id = ?",
            [tplColor, process.id]
          );
        }

        // 2. Atualizar os itens do processo preservando o status 'is_done' por nome do item
        const [currentItems] = await connection.query(
          "SELECT name, is_done FROM process_items WHERE process_id = ?",
          [process.id]
        );

        const doneMap = {};
        currentItems.forEach(item => {
          if (item.is_done) {
            doneMap[item.name] = true;
          }
        });

        const newProcessItems = tplItems.map((item, index) => {
          let itemType = 'doc';
          let itemName = '';
          let itemBgColor = null;

          if (typeof item === 'string') {
            itemName = item;
          } else if (item && typeof item === 'object') {
            itemType = item.type || 'doc';
            itemName = item.name || '';
            itemBgColor = item.bgColor || null;
          }

          const isDone = doneMap[itemName] ? 1 : 0;
          return [crypto.randomUUID(), process.id, itemType, itemName, isDone, itemBgColor, index];
        });

        await connection.query(
          "DELETE FROM process_items WHERE process_id = ?",
          [process.id]
        );

        if (newProcessItems.length > 0) {
          await connection.query(
            "INSERT INTO process_items (id, process_id, type, name, is_done, bg_color, order_index) VALUES ?",
            [newProcessItems]
          );
        }
      }
    }

    await connection.commit();
    getIO()?.emit('templates:updated', templates);
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
