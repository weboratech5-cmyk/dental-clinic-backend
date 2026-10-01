import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import { db } from '../config/database.js';

interface HealthRow extends RowDataPacket {
  database_name: string;
  mysql_version: string;
  table_count: number;
}

export const healthRouter = Router();

healthRouter.get('/', async (_request, response, next) => {
  try {
    const [rows] = await db.query<HealthRow[]>(`
      SELECT
        DATABASE() AS database_name,
        VERSION() AS mysql_version,
        (
          SELECT COUNT(*)
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
        ) AS table_count
    `);

    const database = rows[0];

    response.json({
      status: 'ok',
      api: 'Dental Clinic API',
      database: {
        connected: true,
        name: database?.database_name,
        version: database?.mysql_version,
        tables: database?.table_count ?? 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
