import { app } from './app.js';
import { env } from './config/env.js';
import { db, verifyDatabaseConnection } from './config/database.js';

async function startServer(): Promise<void> {
  try {
    await verifyDatabaseConnection();
    console.log(`Connected to MySQL database: ${env.DB_NAME}`);

    const server = app.listen(env.PORT,'0.0.0.0', () => {
      console.log(`API running on port ${env.PORT}`);
    });

    const shutdown = (signal: string) => {
      console.log(`${signal} received. Shutting down...`);
      server.close(async () => {
        await db.end();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Unable to start the API:', error);
    await db.end();
    process.exit(1);
  }
}

void startServer();
