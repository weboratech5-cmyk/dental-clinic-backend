import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getNextSequence } from '../utils/sequence.js';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2';
import crypto from 'crypto';

export const staffRouter = Router();

staffRouter.use(requireAuth);
staffRouter.use(requireRole('admin'));

// GET /api/staff
staffRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>("SELECT id, name, username, email, role, phone, status, last_login, created_at, updated_at FROM app_users WHERE role = 'staff' ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/staff/details
staffRouter.get('/details', async (_req, res, next) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>(`
      SELECT sd.*, 
             u.id AS user_id, u.name, u.username, u.email, u.role, u.phone, u.status, u.last_login, u.created_at AS user_created_at
      FROM staff_details sd
      JOIN app_users u ON sd.user_id = u.id
      ORDER BY sd.created_at DESC
    `);

    const formatted = rows.map((row) => ({
      id: row.id,
      staff_id: row.staff_id,
      user_id: row.user_id,
      created_at: row.created_at,
      app_users: {
        id: row.user_id,
        name: row.name,
        username: row.username,
        email: row.email,
        role: row.role,
        phone: row.phone,
        status: row.status,
        last_login: row.last_login,
        created_at: row.user_created_at,
      },
    }));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

// POST /api/staff
staffRouter.post('/', async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { name, username, email, phone, password, status } = req.body;

    if (!name || !username || !email || !password) {
      res.status(400).json({ message: 'name, username, email and password are required' });
      return;
    }

    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM app_users WHERE username = ? OR email = ?',
      [username.trim(), email.trim()]
    );

    if (existing.length > 0) {
      res.status(400).json({ message: 'User with this username or email already exists' });
      return;
    }

    await connection.beginTransaction();

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    await connection.query(
      `INSERT INTO app_users (id, name, username, email, password_hash, role, phone, status)
       VALUES (?, ?, ?, ?, ?, 'staff', ?, ?)`,
      [userId, name.trim(), username.trim(), email.trim(), passwordHash, phone || null, status || 'active']
    );

    const staffCode = await getNextSequence('staff_id', 'STF');
    const detailId = crypto.randomUUID();

    await connection.query(
      'INSERT INTO staff_details (id, staff_id, user_id) VALUES (?, ?, ?)',
      [detailId, staffCode, userId]
    );

    await connection.commit();

    const [createdUser] = await db.query<RowDataPacket[]>(
      'SELECT id, name, username, email, role, phone, status, created_at FROM app_users WHERE id = ?',
      [userId]
    );

    res.status(201).json(createdUser[0]);
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// PUT /api/staff/:id
staffRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.password_hash;
    delete updates.password;
    delete updates.created_at;
    delete updates.updated_at;

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      const [existing] = await db.query<RowDataPacket[]>('SELECT id, name, username, email, role, phone, status FROM app_users WHERE id = ?', [id]);
      res.json(existing[0]);
      return;
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    await db.query(`UPDATE app_users SET ${setClause} WHERE id = ?`, values);
    const [updated] = await db.query<RowDataPacket[]>('SELECT id, name, username, email, role, phone, status FROM app_users WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/staff/:id/reset-password
staffRouter.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ message: 'New password must be at least 6 characters' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE app_users SET password_hash = ? WHERE id = ?', [passwordHash, id]);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});
