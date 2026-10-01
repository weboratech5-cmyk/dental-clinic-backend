import { Router } from 'express';
import { db } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

export const medicineRouter = Router();

medicineRouter.use(requireAuth);

// GET /api/medicines/transactions
medicineRouter.get('/transactions', async (req, res, next) => {
  try {
    const { medicine_id } = req.query;
    let sql = `
      SELECT st.*, m.medicine_name AS medicine_name
      FROM stock_transactions st
      LEFT JOIN medicines m ON st.medicine_id = m.id
    `;
    const params: any[] = [];

    if (medicine_id) {
      sql += ' WHERE st.medicine_id = ?';
      params.push(medicine_id);
    }

    sql += ' ORDER BY st.created_at DESC';
    const [rows] = await db.query<RowDataPacket[]>(sql, params);

    const formatted = rows.map((row) => ({
      id: row.id,
      medicine_id: row.medicine_id,
      transaction_type: row.transaction_type,
      quantity: row.quantity,
      balance_after: row.balance_after,
      reason: row.reason,
      reference_id: row.reference_id,
      reference_type: row.reference_type,
      user_id: row.user_id,
      created_at: row.created_at,
      medicines: row.medicine_name ? { medicine_name: row.medicine_name } : null,
    }));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines
medicineRouter.get('/', async (req, res, next) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : '';
    let sql = 'SELECT * FROM medicines';
    const params: any[] = [];

    if (search) {
      sql += ' WHERE medicine_name LIKE ? OR generic_name LIKE ? OR batch_no LIKE ?';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY medicine_name ASC';
    const [rows] = await db.query<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/:id
medicineRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM medicines WHERE id = ?', [id]);
    if (!rows[0]) {
      res.status(404).json({ message: 'Medicine not found' });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines
medicineRouter.post('/', async (req, res, next) => {
  try {
    const { medicine_name, generic_name, batch_no, expiry_date, quantity, unit, purchase_price, selling_price, supplier, reorder_level } = req.body;

    if (!medicine_name) {
      res.status(400).json({ message: 'medicine_name is required' });
      return;
    }

    const id = crypto.randomUUID();

    await db.query<ResultSetHeader>(
      `INSERT INTO medicines (
        id, medicine_name, generic_name, batch_no, expiry_date, quantity, unit, purchase_price, selling_price, supplier, reorder_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, medicine_name, generic_name || null, batch_no || null, expiry_date || null,
        quantity || 0, unit || 'units', purchase_price || 0, selling_price || 0,
        supplier || null, reorder_level || 10
      ]
    );

    const [created] = await db.query<RowDataPacket[]>('SELECT * FROM medicines WHERE id = ?', [id]);
    res.status(201).json(created[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/medicines/:id
medicineRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      const [existing] = await db.query<RowDataPacket[]>('SELECT * FROM medicines WHERE id = ?', [id]);
      res.json(existing[0]);
      return;
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    await db.query(`UPDATE medicines SET ${setClause} WHERE id = ?`, values);
    const [updated] = await db.query<RowDataPacket[]>('SELECT * FROM medicines WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/medicines/:id
medicineRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM medicines WHERE id = ?', [id]);
    res.json({ message: 'Medicine deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/medicines/:id/stock-in
medicineRouter.post('/:id/stock-in', async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const { quantity, purchasePrice, supplier, invoiceNo } = req.body;

    if (!quantity || quantity <= 0) {
      res.status(400).json({ message: 'Valid positive quantity is required' });
      return;
    }

    await connection.beginTransaction();

    const [meds] = await connection.query<RowDataPacket[]>('SELECT * FROM medicines WHERE id = ?', [id]);
    if (!meds[0]) {
      res.status(404).json({ message: 'Medicine not found' });
      return;
    }

    const newQty = (meds[0].quantity || 0) + Number(quantity);
    await connection.query(
      'UPDATE medicines SET quantity = ?, purchase_price = ?, supplier = ? WHERE id = ?',
      [newQty, purchasePrice || meds[0].purchase_price, supplier || meds[0].supplier, id]
    );

    const transId = crypto.randomUUID();
    const authUser = (req as any).auth;

    await connection.query(
      `INSERT INTO stock_transactions (
        id, medicine_id, transaction_type, quantity, balance_after, reason, reference_type, user_id
      ) VALUES (?, ?, 'IN', ?, ?, ?, 'stock_in', ?)`,
      [transId, id, quantity, newQty, `Stock In - Invoice: ${invoiceNo || 'N/A'}`, authUser?.userId || null]
    );

    await connection.commit();
    res.json({ message: 'Stock updated successfully', quantity: newQty });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});
