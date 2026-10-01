import { db } from '../config/database.js';
import type { RowDataPacket } from 'mysql2';

export async function getNextSequence(sequenceName: string, prefix: string, padLength: number = 4): Promise<string> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'UPDATE number_sequences SET current_value = current_value + 1 WHERE sequence_name = ?',
      [sequenceName]
    );
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT current_value FROM number_sequences WHERE sequence_name = ?',
      [sequenceName]
    );
    await connection.commit();
    const val = rows[0]?.current_value || 1;
    return `${prefix}-${String(val).padStart(padLength, '0')}`;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
