import express from 'express';
import db from '../db.js';
import { getIO } from '../socket.js';

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
      docs: itemsByProcess[p.id] || []
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch processes' });
  }
});

// POST a new process
router.post('/', async (req, res) => {
  const { id, title, processNumber, setor, type, typeColor, docs, status = 'active' } = req.body;
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    await connection.query(
      `INSERT INTO processes (id, title, processNumber, setor, type, typeColor, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, processNumber, setor, type, typeColor, status]
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
    getIO()?.emit('process:added', { id, title, processNumber, setor, type, typeColor, status, docs: docs || [] });
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
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, processNumber, setor } = req.body;
  try {
    await db.query(
      `UPDATE processes SET title = ?, processNumber = ?, setor = ? WHERE id = ?`,
      [title, processNumber, setor, id]
    );
    getIO()?.emit('process:updated', { id, title, processNumber, setor });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update process' });
  }
});

// DELETE a process
router.delete('/:id', async (req, res) => {
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
router.put('/:id/status', async (req, res) => {
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
router.put('/:id/items', async (req, res) => {
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
