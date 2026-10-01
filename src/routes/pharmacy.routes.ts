import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { getNextSequence } from '../utils/sequence.js';
import type { RowDataPacket } from 'mysql2';
import crypto from 'crypto';

export const pharmacyRouter = Router();

pharmacyRouter.use(requireAuth);

// GET /api/pharmacy/sales
pharmacyRouter.get('/sales', async (_req, res, next) => {
  try {
    const [sales] = await db.query<RowDataPacket[]>(`
      SELECT ps.*, 
             p.name AS patient_name, p.patient_code AS patient_patient_code, p.phone AS patient_phone,
             u.name AS user_name
      FROM pharmacy_sales ps
      LEFT JOIN patients p ON ps.patient_id = p.id
      LEFT JOIN app_users u ON ps.created_by = u.id
      ORDER BY ps.created_at DESC
    `);

    if (sales.length === 0) {
      res.json([]);
      return;
    }

    const saleIds = sales.map((s) => s.id);
    const [items] = await db.query<RowDataPacket[]>(
      `SELECT * FROM pharmacy_sale_items WHERE sale_id IN (${saleIds.map(() => '?').join(',')})`,
      saleIds
    );

    const itemsMap = new Map<string, any[]>();
    for (const item of items) {
      if (!itemsMap.has(item.sale_id)) {
        itemsMap.set(item.sale_id, []);
      }
      itemsMap.get(item.sale_id)!.push(item);
    }

    const result = sales.map((sale) => ({
      id: sale.id,
      invoice_no: sale.invoice_no,
      patient_id: sale.patient_id,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      payment_method: sale.payment_method,
      created_by: sale.created_by,
      created_at: sale.created_at,
      patients: sale.patient_name ? { name: sale.patient_name, patient_code: sale.patient_patient_code, phone: sale.patient_phone } : null,
      app_users: sale.user_name ? { name: sale.user_name } : null,
      pharmacy_sale_items: itemsMap.get(sale.id) || [],
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/pharmacy/sales/:id
pharmacyRouter.get('/sales/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [sales] = await db.query<RowDataPacket[]>(`
      SELECT ps.*, 
             p.name AS patient_name, p.patient_code AS patient_patient_code, p.phone AS patient_phone,
             u.name AS user_name
      FROM pharmacy_sales ps
      LEFT JOIN patients p ON ps.patient_id = p.id
      LEFT JOIN app_users u ON ps.created_by = u.id
      WHERE ps.id = ?
    `, [id]);

    if (!sales[0]) {
      res.status(404).json({ message: 'Pharmacy sale not found' });
      return;
    }

    const sale = sales[0];
    const [items] = await db.query<RowDataPacket[]>('SELECT * FROM pharmacy_sale_items WHERE sale_id = ?', [id]);

    res.json({
      id: sale.id,
      invoice_no: sale.invoice_no,
      patient_id: sale.patient_id,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      payment_method: sale.payment_method,
      created_by: sale.created_by,
      created_at: sale.created_at,
      patients: sale.patient_name ? { name: sale.patient_name, patient_code: sale.patient_patient_code, phone: sale.patient_phone } : null,
      app_users: sale.user_name ? { name: sale.user_name } : null,
      pharmacy_sale_items: items,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/pharmacy/sales
pharmacyRouter.post('/sales', async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { sale, items } = req.body;
    const { patient_id, subtotal, discount, total, payment_method, created_by } = sale || {};

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: 'Pharmacy sale must contain at least one item' });
      return;
    }

    await connection.beginTransaction();

    const invoiceNo = await getNextSequence('invoice_no', 'INV');
    const saleId = crypto.randomUUID();
    const authUser = (req as any).auth;
    const creatorId = created_by || authUser?.userId || null;

    await connection.query(
      `INSERT INTO pharmacy_sales (
        id, invoice_no, patient_id, subtotal, discount, total, payment_method, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId, invoiceNo, patient_id || null, subtotal || 0, discount || 0, total || 0, payment_method || 'Cash', creatorId]
    );

    for (const item of items) {
      const itemId = crypto.randomUUID();
      await connection.query(
        `INSERT INTO pharmacy_sale_items (
          id, sale_id, medicine_id, medicine_name, batch_no, quantity, unit_price, discount, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId, saleId, item.medicine_id || null, item.medicine_name, item.batch_no || null,
          item.quantity, item.unit_price || 0, item.discount || 0, item.total || 0
        ]
      );

      if (item.medicine_id) {
        const [meds] = await connection.query<RowDataPacket[]>('SELECT quantity FROM medicines WHERE id = ?', [item.medicine_id]);
        if (meds[0]) {
          const newQty = Math.max(0, (meds[0].quantity || 0) - item.quantity);
          await connection.query('UPDATE medicines SET quantity = ? WHERE id = ?', [newQty, item.medicine_id]);

          const transId = crypto.randomUUID();
          await connection.query(
            `INSERT INTO stock_transactions (
              id, medicine_id, transaction_type, quantity, balance_after, reason, reference_id, reference_type, user_id
            ) VALUES (?, ?, 'OUT', ?, ?, ?, ?, 'pharmacy_sale', ?)`,
            [transId, item.medicine_id, item.quantity, newQty, `Pharmacy Sale - ${invoiceNo}`, saleId, creatorId]
          );
        }
      }
    }

    // Insert Billing record
    const billingInvoiceNo = `BIL-${invoiceNo.slice(4)}`;
    const billingId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO billing (
        id, invoice_no, patient_id, bill_type, amount, paid, balance, payment_method, created_by
      ) VALUES (?, ?, ?, 'Pharmacy', ?, ?, 0, ?, ?)`,
      [billingId, billingInvoiceNo, patient_id || null, total || 0, total || 0, payment_method || 'Cash', creatorId]
    );

    await connection.commit();

    const [createdSale] = await db.query<RowDataPacket[]>('SELECT * FROM pharmacy_sales WHERE id = ?', [saleId]);
    const [createdItems] = await db.query<RowDataPacket[]>('SELECT * FROM pharmacy_sale_items WHERE sale_id = ?', [saleId]);

    res.status(201).json({
      ...createdSale[0],
      pharmacy_sale_items: createdItems,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// DELETE /api/pharmacy/sales/:id
pharmacyRouter.delete('/sales/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM pharmacy_sales WHERE id = ?', [id]);
    res.json({ message: 'Pharmacy sale deleted successfully' });
  } catch (error) {
    next(error);
  }
});
