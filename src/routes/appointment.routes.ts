import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

export const appointmentRouter = Router();

appointmentRouter.use(requireAuth);

// GET /api/appointments?date=:date
appointmentRouter.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;
    let sql = `
      SELECT a.*, p.name AS patient_name, p.patient_code AS patient_patient_code, p.phone AS patient_phone
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
    `;
    const params: any[] = [];

    if (date) {
      sql += ' WHERE a.appointment_date = ?';
      params.push(date);
    }

    sql += ' ORDER BY a.appointment_date DESC, a.appointment_time ASC';
    const [rows] = await db.query<RowDataPacket[]>(sql, params);

    const formatted = rows.map((row) => ({
      id: row.id,
      patient_id: row.patient_id,
      appointment_date: row.appointment_date,
      appointment_time: row.appointment_time,
      reason: row.reason,
      notes: row.notes,
      status: row.status,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      patients: row.patient_name ? {
        name: row.patient_name,
        patient_code: row.patient_patient_code,
        phone: row.patient_phone,
      } : null,
    }));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

// POST /api/appointments
appointmentRouter.post('/', async (req, res, next) => {
  try {
    const { patient_id, appointment_date, appointment_time, reason, notes, status } = req.body;

    if (!patient_id || !appointment_date || !appointment_time) {
      res.status(400).json({ message: 'patient_id, appointment_date and appointment_time are required' });
      return;
    }

    const id = crypto.randomUUID();
    const authUser = (req as any).auth;

    await db.query<ResultSetHeader>(
      `INSERT INTO appointments (
        id, patient_id, appointment_date, appointment_time, reason, notes, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, patient_id, appointment_date, appointment_time, reason || null, notes || null,
        status || 'Scheduled', authUser?.userId || null
      ]
    );

    const [created] = await db.query<RowDataPacket[]>('SELECT * FROM appointments WHERE id = ?', [id]);
    res.status(201).json(created[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/appointments/:id
appointmentRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;
    delete updates.patients;

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      const [existing] = await db.query<RowDataPacket[]>('SELECT * FROM appointments WHERE id = ?', [id]);
      res.json(existing[0]);
      return;
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    await db.query(`UPDATE appointments SET ${setClause} WHERE id = ?`, values);
    const [updated] = await db.query<RowDataPacket[]>('SELECT * FROM appointments WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/appointments/:id
appointmentRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM appointments WHERE id = ?', [id]);
    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    next(error);
  }
});
