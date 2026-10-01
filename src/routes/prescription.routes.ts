import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket } from 'mysql2';
import crypto from 'crypto';

export const prescriptionRouter = Router();

prescriptionRouter.use(requireAuth);

// GET /api/prescriptions?patient_id=:patientId
prescriptionRouter.get('/', async (req, res, next) => {
  try {
    const { patient_id } = req.query;
    let sql = 'SELECT * FROM prescriptions';
    const params: any[] = [];

    if (patient_id) {
      sql += ' WHERE patient_id = ?';
      params.push(patient_id);
    }

    sql += ' ORDER BY prescription_date DESC';
    const [prescriptions] = await db.query<RowDataPacket[]>(sql, params);

    if (prescriptions.length === 0) {
      res.json([]);
      return;
    }

    const prescIds = prescriptions.map((p) => p.id);
    const [items] = await db.query<RowDataPacket[]>(
      `SELECT * FROM prescription_items WHERE prescription_id IN (${prescIds.map(() => '?').join(',')})`,
      prescIds
    );

    const itemsMap = new Map<string, any[]>();
    for (const item of items) {
      if (!itemsMap.has(item.prescription_id)) {
        itemsMap.set(item.prescription_id, []);
      }
      itemsMap.get(item.prescription_id)!.push(item);
    }

    const result = prescriptions.map((p) => ({
      ...p,
      prescription_items: itemsMap.get(p.id) || [],
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/prescriptions
prescriptionRouter.post('/', async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { prescription, items } = req.body;
    const { patient_id, prescription_date, notes } = prescription || {};

    if (!patient_id || !prescription_date) {
      res.status(400).json({ message: 'patient_id and prescription_date are required' });
      return;
    }

    await connection.beginTransaction();

    const prescId = crypto.randomUUID();
    const authUser = (req as any).auth;

    await connection.query(
      'INSERT INTO prescriptions (id, patient_id, prescription_date, notes, created_by) VALUES (?, ?, ?, ?, ?)',
      [prescId, patient_id, prescription_date, notes || null, authUser?.userId || null]
    );

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const itemId = crypto.randomUUID();
        await connection.query(
          `INSERT INTO prescription_items (id, prescription_id, medicine_name, dosage, frequency, duration, instructions)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [itemId, prescId, item.medicine_name, item.dosage || null, item.frequency || null, item.duration || null, item.instructions || null]
        );
      }
    }

    await connection.commit();

    const [created] = await db.query<RowDataPacket[]>('SELECT * FROM prescriptions WHERE id = ?', [prescId]);
    const [createdItems] = await db.query<RowDataPacket[]>('SELECT * FROM prescription_items WHERE prescription_id = ?', [prescId]);

    res.status(201).json({
      ...created[0],
      prescription_items: createdItems,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});
