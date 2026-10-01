import mysql from 'mysql2/promise';
import { env } from './env.js';

export const db = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,

  ssl: {
    rejectUnauthorized: false,
  },

  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  decimalNumbers: true,
  timezone: 'Z',
});

export async function verifyDatabaseConnection(): Promise<void> {
  const connection = await db.getConnection();

  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}