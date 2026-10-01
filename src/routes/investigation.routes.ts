import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

export const investigationRouter = Router();

investigationRouter.use(requireAuth);

// GET /api/investigations?patient_id=:patientId
investigationRouter.get('/', async (req, res, next) => {
  try {
    const { patient_id } = req.query;
    let sql = 'SELECT * FROM investigations';
    const params: any[] = [];

    if (patient_id) {
      sql += ' WHERE patient_id = ?';
      params.push(patient_id);
    }

    sql += ' ORDER BY investigation_date DESC';
    const [rows] = await db.query<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/investigations
investigationRouter.post('/', async (req, res, next) => {
  try {
    const { patient_id, investigation_type, investigation_date, result, notes, file_url, status } = req.body;

    if (!patient_id || !investigation_type || !investigation_date) {
      res.status(400).json({ message: 'patient_id, investigation_type and investigation_date are required' });
      return;
    }

    const id = crypto.randomUUID();
    const authUser = (req as any).auth;

    await db.query<ResultSetHeader>(
      `INSERT INTO investigations (
        id, patient_id, investigation_type, investigation_date, result, notes, file_url, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, patient_id, investigation_type, investigation_date, result || null, notes || null,
        file_url || null, status || 'Pending', authUser?.userId || null
      ]
    );

    const [created] = await db.query<RowDataPacket[]>('SELECT * FROM investigations WHERE id = ?', [id]);
    res.status(201).json(created[0]);
  } catch (error) {
    next(error);
  }
});
