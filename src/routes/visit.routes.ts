import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

export const visitRouter = Router();

visitRouter.use(requireAuth);

// GET /api/visits?patient_id=:patientId
visitRouter.get('/', async (req, res, next) => {
  try {
    const { patient_id } = req.query;
    let sql = 'SELECT * FROM patient_visits';
    const params: any[] = [];

    if (patient_id) {
      sql += ' WHERE patient_id = ?';
      params.push(patient_id);
    }

    sql += ' ORDER BY visit_date DESC';
    const [rows] = await db.query<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/visits
visitRouter.post('/', async (req, res, next) => {
  try {
    const { patient_id, visit_date, diagnosis, treatment, doctor_notes, treatment_cost, status } = req.body;

    if (!patient_id || !visit_date) {
      res.status(400).json({ message: 'patient_id and visit_date are required' });
      return;
    }

    const id = crypto.randomUUID();
    const authUser = (req as any).auth;

    await db.query<ResultSetHeader>(
      `INSERT INTO patient_visits (
        id, patient_id, visit_date, diagnosis, treatment, doctor_notes, treatment_cost, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, patient_id, visit_date, diagnosis || null, treatment || null, doctor_notes || null,
        treatment_cost || 0, status || 'Completed', authUser?.userId || null
      ]
    );

    const [created] = await db.query<RowDataPacket[]>('SELECT * FROM patient_visits WHERE id = ?', [id]);
    res.status(201).json(created[0]);
  } catch (error) {
    next(error);
  }
});
