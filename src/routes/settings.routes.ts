import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type { RowDataPacket } from 'mysql2';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

// GET /api/settings
settingsRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM settings LIMIT 1');
    if (!rows[0]) {
      res.json(null);
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/:id
settingsRouter.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.updated_at;

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      const [existing] = await db.query<RowDataPacket[]>('SELECT * FROM settings WHERE id = ?', [id]);
      res.json(existing[0]);
      return;
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    await db.query(`UPDATE settings SET ${setClause} WHERE id = ?`, values);
    const [updated] = await db.query<RowDataPacket[]>('SELECT * FROM settings WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    next(error);
  }
});
