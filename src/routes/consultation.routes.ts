import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

export const consultationRouter = Router();

consultationRouter.use(requireAuth);

// GET /api/consultation-payments
consultationRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>(`
      SELECT cp.*, p.name AS patient_name, p.patient_code AS patient_patient_code
      FROM consultation_payments cp
      LEFT JOIN patients p ON cp.patient_id = p.id
      ORDER BY cp.created_at DESC
    `);

    const formatted = rows.map((row) => ({
      id: row.id,
      patient_id: row.patient_id,
      visit_id: row.visit_id,
      amount: row.amount,
      payment_method: row.payment_method,
      created_by: row.created_by,
      created_at: row.created_at,
      patients: row.patient_name ? { name: row.patient_name, patient_code: row.patient_patient_code } : null,
    }));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

// POST /api/consultation-payments
consultationRouter.post('/', async (req, res, next) => {
  try {
    const { patient_id, visit_id, amount, payment_method } = req.body;

    if (!patient_id || !amount) {
      res.status(400).json({ message: 'patient_id and amount are required' });
      return;
    }

    const id = crypto.randomUUID();
    const authUser = (req as any).auth;

    await db.query<ResultSetHeader>(
      `INSERT INTO consultation_payments (
        id, patient_id, visit_id, amount, payment_method, created_by
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, patient_id, visit_id || null, amount, payment_method || 'Cash', authUser?.userId || null]
    );

    const [created] = await db.query<RowDataPacket[]>('SELECT * FROM consultation_payments WHERE id = ?', [id]);
    res.status(201).json(created[0]);
  } catch (error) {
    next(error);
  }
});
