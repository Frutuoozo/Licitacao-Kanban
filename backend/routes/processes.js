import express from 'express';
import db from '../db.js';
import { getIO } from '../socket.js';
import { requireEditorOrAdmin } from '../middleware/editor.js';

const router = express.Router();

// GET all processes (active and archived)
router.get('/', async (req, res) => {
  try {
    const [processes] = await db.query('SELECT * FROM processes');
    const [items] = await db.query('SELECT * FROM process_items ORDER BY order_index ASC');
    
    // Group items by process_id
    const itemsByProcess = {};
    items.forEach(item => {
      if (!itemsByProcess[item.process_id]) {
        itemsByProcess[item.process_id] = [];
      }
      itemsByProcess[item.process_id].push({
        id: item.id,
        type: item.type,
        name: item.name,
        done: !!item.is_done,
        bgColor: item.bg_color
      });
    });

    const result = processes.map(p => ({
      id: p.id,
      title: p.title,
      processNumber: p.processNumber,
      setor: p.setor,
      type: p.type,
      typeColor: p.typeColor,
      status: p.status,
      dueDate: p.due_date
        ? (typeof p.due_date === 'string'
            ? p.due_date.slice(0, 10)
            : `${p.due_date.getFullYear()}-${String(p.due_date.getMonth()+1).padStart(2,'0')}-${String(p.due_date.getDate()).padStart(2,'0')}`)
        : null,
      docs: itemsByProcess[p.id] || []
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch processes' });
  }
});

// POST a new process
router.post('/', requireEditorOrAdmin, async (req, res) => {
  const { id, title, processNumber, setor, type, typeColor, docs, status = 'active', dueDate } = req.body;

  if (!dueDate) {
    return res.status(400).json({ error: 'Data de vencimento é obrigatória' });
  }
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    await connection.query(
      `INSERT INTO processes (id, title, processNumber, setor, type, typeColor, status, due_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, processNumber, setor, type, typeColor, status, dueDate]
    );

    if (docs && docs.length > 0) {
      const values = docs.map((doc, index) => [
        doc.id, id, doc.type, doc.name, doc.done || false, doc.bgColor || null, index
      ]);
      await connection.query(
        `INSERT INTO process_items (id, process_id, type, name, is_done, bg_color, order_index) 
         VALUES ?`,
        [values]
      );
    }
    
    await connection.commit();
    getIO()?.emit('process:added', { id, title, processNumber, setor, type, typeColor, status, dueDate, docs: docs || [] });
    res.status(201).json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Failed to create process' });
  } finally {
    connection.release();
  }
});

// PUT to update a process (except items)
router.put('/:id', requireEditorOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, processNumber, setor, dueDate } = req.body;
  try {
    await db.query(
      `UPDATE processes SET title = ?, processNumber = ?, setor = ?, due_date = ? WHERE id = ?`,
      [title, processNumber, setor, dueDate || null, id]
    );
    getIO()?.emit('process:updated', { id, title, processNumber, setor, dueDate });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update process' });
  }
});

// DELETE a process
router.delete('/:id', requireEditorOrAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`DELETE FROM processes WHERE id = ?`, [id]);
    getIO()?.emit('process:deleted', { id });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete process' });
  }
});

// PUT to update process status (active/archived)
router.put('/:id/status', requireEditorOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await db.query(`UPDATE processes SET status = ? WHERE id = ?`, [status, id]);
    getIO()?.emit('process:status_changed', { id, status });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update process status' });
  }
});

// PUT to update process items
router.put('/:id/items', requireEditorOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { docs } = req.body;
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    await connection.query(`DELETE FROM process_items WHERE process_id = ?`, [id]);

    if (docs && docs.length > 0) {
      const values = docs.map((doc, index) => [
        doc.id, id, doc.type, doc.name, doc.done || false, doc.bgColor || null, index
      ]);
      await connection.query(
        `INSERT INTO process_items (id, process_id, type, name, is_done, bg_color, order_index) 
         VALUES ?`,
        [values]
      );
    }
    
    await connection.commit();
    getIO()?.emit('process:items_updated', { id, docs: docs || [] });
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Failed to update process items' });
  } finally {
    connection.release();
  }
});

export default router;
