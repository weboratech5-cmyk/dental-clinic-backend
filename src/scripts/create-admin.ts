import 'dotenv/config';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { db } from '../config/database.js';

interface CountRow extends RowDataPacket {
  count: number;
}

const adminSchema = z.object({
  ADMIN_NAME: z.string().trim().min(2),
  ADMIN_USERNAME: z.string().trim().min(3).max(80),
  ADMIN_EMAIL: z.string().trim().email(),
  ADMIN_PASSWORD: z.string().min(10, 'ADMIN_PASSWORD must contain at least 10 characters'),
});

async function createAdmin(): Promise<void> {
  const parsed = adminSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Admin configuration is invalid:', parsed.error.flatten().fieldErrors);
    process.exitCode = 1;
    return;
  }

  const admin = parsed.data;
  const [existing] = await db.execute<CountRow[]>(
    'SELECT COUNT(*) AS count FROM app_users WHERE username = ? OR email = ?',
    [admin.ADMIN_USERNAME, admin.ADMIN_EMAIL],
  );

  if ((existing[0]?.count ?? 0) > 0) {
    throw new Error('An account with this username or email already exists');
  }

  const passwordHash = await bcrypt.hash(admin.ADMIN_PASSWORD, 12);
  await db.execute<ResultSetHeader>(
    `INSERT INTO app_users (name, username, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'admin', 'active')`,
    [admin.ADMIN_NAME, admin.ADMIN_USERNAME, admin.ADMIN_EMAIL, passwordHash],
  );

  console.log(`Admin account created successfully: ${admin.ADMIN_USERNAME}`);
}

try {
  await createAdmin();
} catch (error) {
  console.error('Unable to create admin:', error);
  process.exitCode = 1;
} finally {
  await db.end();
}
