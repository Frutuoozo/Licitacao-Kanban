import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET all templates
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM templates');
    
    // Convert array of templates into the object format used by frontend
    const templates = {};
    rows.forEach(row => {
      // items are stored as JSON in DB, parse if needed (mysql2 usually parses JSON automatically if column is JSON)
      templates[row.name] = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
    });

    res.json(templates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// PUT to replace all templates
router.put('/', async (req, res) => {
  const templates = req.body; // object { "Aquisições": [...], ... }
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    // For simplicity, delete all and re-insert
    await connection.query('DELETE FROM templates');
    
    const entries = Object.entries(templates);
    if (entries.length > 0) {
      const values = entries.map(([name, items]) => [
        name, JSON.stringify(items)
      ]);
      await connection.query(
        'INSERT INTO templates (name, items) VALUES ?',
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
