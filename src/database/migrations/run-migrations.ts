import fs from 'fs';
import path from 'path';
import { db } from '../connection';
import { logger } from '../../utils/logger';

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      logger.info(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.query(sql);
      logger.info(`Completed migration: ${file}`);
    }

    logger.info('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();


