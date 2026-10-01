import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { getNextSequence } from '../utils/sequence.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

export const patientRouter = Router();

patientRouter.use(requireAuth);

// GET /api/patients
patientRouter.get('/', async (req, res, next) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : '';
    let sql = 'SELECT * FROM patients';
    const params: any[] = [];

    if (search) {
      sql += ' WHERE name LIKE ? OR patient_code LIKE ? OR phone LIKE ?';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY created_at DESC';
    const [rows] = await db.query<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/patients/:id
patientRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM patients WHERE id = ?', [id]);
    if (!rows[0]) {
      res.status(404).json({ message: 'Patient not found' });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/patients
patientRouter.post('/', async (req, res, next) => {
  try {
    const {
      name, dob, age, gender, phone, alternate_phone, email, address, city,
      blood_group, medical_history, allergies, current_medication, notes,
      emergency_name, emergency_relationship, emergency_phone
    } = req.body;

    if (!name) {
      res.status(400).json({ message: 'Patient name is required' });
      return;
    }

    const patientCode = await getNextSequence('patient_code', 'PAT');
    const id = crypto.randomUUID();
    const authUser = (req as any).auth;

    await db.query<ResultSetHeader>(
      `INSERT INTO patients (
        id, patient_code, name, dob, age, gender, phone, alternate_phone, email,
        address, city, blood_group, medical_history, allergies, current_medication,
        notes, emergency_name, emergency_relationship, emergency_phone, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, patientCode, name, dob || null, age || null, gender || null, phone || null,
        alternate_phone || null, email || null, address || null, city || null,
        blood_group || null, medical_history || null, allergies || null,
        current_medication || null, notes || null, emergency_name || null,
        emergency_relationship || null, emergency_phone || null, authUser?.userId || null
      ]
    );

    const [created] = await db.query<RowDataPacket[]>('SELECT * FROM patients WHERE id = ?', [id]);
    res.status(201).json(created[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/patients/:id
patientRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.patient_code;
    delete updates.created_at;
    delete updates.updated_at;

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      const [existing] = await db.query<RowDataPacket[]>('SELECT * FROM patients WHERE id = ?', [id]);
      res.json(existing[0]);
      return;
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    await db.query(`UPDATE patients SET ${setClause} WHERE id = ?`, values);
    const [updated] = await db.query<RowDataPacket[]>('SELECT * FROM patients WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/patients/:id
patientRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM patients WHERE id = ?', [id]);
    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    next(error);
  }
});
