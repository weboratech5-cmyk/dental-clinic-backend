import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

export const medicationRouter = Router();

medicationRouter.use(requireAuth);

// GET /api/medications?patient_id=:patientId
medicationRouter.get('/', async (req, res, next) => {
  try {
    const { patient_id } = req.query;
    let sql = 'SELECT * FROM medications';
    const params: any[] = [];

    if (patient_id) {
      sql += ' WHERE patient_id = ?';
      params.push(patient_id);
    }

    sql += ' ORDER BY created_at DESC';
    const [rows] = await db.query<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/medications
medicationRouter.post('/', async (req, res, next) => {
  try {
    const { patient_id, medicine_name, dosage, frequency, duration, start_date, end_date, instructions, status } = req.body;

    if (!patient_id || !medicine_name) {
      res.status(400).json({ message: 'patient_id and medicine_name are required' });
      return;
    }

    const id = crypto.randomUUID();
    const authUser = (req as any).auth;

    await db.query<ResultSetHeader>(
      `INSERT INTO medications (
        id, patient_id, medicine_name, dosage, frequency, duration, start_date, end_date, instructions, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, patient_id, medicine_name, dosage || null, frequency || null, duration || null,
        start_date || null, end_date || null, instructions || null, status || 'Active', authUser?.userId || null
      ]
    );

    const [created] = await db.query<RowDataPacket[]>('SELECT * FROM medications WHERE id = ?', [id]);
    res.status(201).json(created[0]);
  } catch (error) {
    next(error);
  }
});
