import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket } from 'mysql2';

export const billingRouter = Router();

billingRouter.use(requireAuth);

// GET /api/billing?patient_id=:patientId
billingRouter.get('/', async (req, res, next) => {
  try {
    const { patient_id } = req.query;
    let sql = `
      SELECT b.*, p.name AS patient_name, p.patient_code AS patient_patient_code
      FROM billing b
      LEFT JOIN patients p ON b.patient_id = p.id
    `;
    const params: any[] = [];

    if (patient_id) {
      sql += ' WHERE b.patient_id = ?';
      params.push(patient_id);
    }

    sql += ' ORDER BY b.created_at DESC';
    const [rows] = await db.query<RowDataPacket[]>(sql, params);

    const formatted = rows.map((row) => ({
      id: row.id,
      invoice_no: row.invoice_no,
      patient_id: row.patient_id,
      visit_id: row.visit_id,
      bill_type: row.bill_type,
      amount: row.amount,
      paid: row.paid,
      balance: row.balance,
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
