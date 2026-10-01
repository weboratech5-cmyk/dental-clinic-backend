import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket } from 'mysql2';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// GET /api/dashboard
dashboardRouter.get('/', async (_req, res, next) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const [patients] = await db.query<RowDataPacket[]>('SELECT * FROM patients');
    const [appointments] = await db.query<RowDataPacket[]>(
      'SELECT * FROM appointments WHERE appointment_date = ?',
      [todayStr]
    );
    const [pharmacySales] = await db.query<RowDataPacket[]>('SELECT * FROM pharmacy_sales');
    const [consultationPayments] = await db.query<RowDataPacket[]>('SELECT * FROM consultation_payments');
    const [medicines] = await db.query<RowDataPacket[]>('SELECT * FROM medicines');

    res.json({
      patients: patients || [],
      appointments: appointments || [],
      pharmacySales: pharmacySales || [],
      consultationPayments: consultationPayments || [],
      medicines: medicines || [],
    });
  } catch (error) {
    next(error);
  }
});
