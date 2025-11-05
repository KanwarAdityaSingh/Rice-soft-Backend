import fs from 'fs';
import path from 'path';
import { db } from '../connection';
import { logger } from '../../utils/logger';

/**
 * Split SQL file into individual statements
 * Handles multi-line statements and function bodies with $$ delimiters
 */
function splitSQLStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let inFunctionBody = false;
  let delimiter = '';
  
  const lines = sql.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check for function body delimiters ($$ or $tag$)
    const dollarMatch = trimmedLine.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/);
    if (dollarMatch && dollarMatch[0]) {
      const foundDelimiter = dollarMatch[0];
      if (!inFunctionBody) {
        // Entering function body
        delimiter = foundDelimiter;
        inFunctionBody = true;
        currentStatement += line + '\n';
      } else if (foundDelimiter === delimiter) {
        // Exiting function body
        inFunctionBody = false;
        delimiter = '';
        currentStatement += line + '\n';
        // Check if this line ends with semicolon
        if (trimmedLine.endsWith(';')) {
          const trimmed = currentStatement.trim();
          if (trimmed && trimmed !== ';') {
            statements.push(trimmed);
          }
          currentStatement = '';
        }
      } else {
        currentStatement += line + '\n';
      }
      continue;
    }
    
    currentStatement += line + '\n';
    
    // Only split on semicolon if we're not inside a function body
    if (!inFunctionBody && trimmedLine.endsWith(';')) {
      const trimmed = currentStatement.trim();
      if (trimmed && trimmed !== ';') {
        statements.push(trimmed);
      }
      currentStatement = '';
    }
  }
  
  // Add any remaining statement
  const trimmed = currentStatement.trim();
  if (trimmed && trimmed !== ';' && trimmed !== '') {
    statements.push(trimmed);
  }
  
  return statements.filter(stmt => stmt.length > 0);
}

/**
 * Execute SQL statements with error handling
 * Uses savepoints to handle errors gracefully without aborting the entire transaction
 */
async function executeSQLStatements(sql: string): Promise<void> {
  const statements = splitSQLStatements(sql);
  
  if (statements.length === 0) {
    logger.warn('No SQL statements found in migration');
    return;
  }
  
  logger.debug(`Split migration into ${statements.length} statements`);
  
  // Execute all statements in a transaction with savepoints for error handling
  await db.transaction(async (client) => {
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (!statement || statement === ';') continue;
      
      // Create a savepoint for each statement
      const savepointName = `sp_${i}`;
      try {
        await client.query(`SAVEPOINT ${savepointName}`);
        
        // Check if this is a CREATE INDEX statement that might fail
        const createIndexMatch = statement.match(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+\w+\s+ON\s+(\w+)\s*\((\w+)\)/i);
        if (createIndexMatch) {
          const tableName = createIndexMatch[1];
          const columnName = createIndexMatch[2];
          
          // Check if column exists before creating index
          const result = await client.query(
            `SELECT column_name 
             FROM information_schema.columns 
             WHERE table_name = $1 AND column_name = $2`,
            [tableName, columnName]
          );
          
          if (result.rows.length === 0) {
            logger.warn(`Skipping index creation on ${tableName}.${columnName} - column does not exist`);
            await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            continue;
          }
        }
        
        await client.query(statement);
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        logger.debug(`Executed statement ${i + 1}/${statements.length}`);
      } catch (error: any) {
        // Rollback to savepoint to continue with next statement
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        
        // Handle specific errors that we can safely skip
        const skipableErrors = [
          '42703', // Column doesn't exist (for CREATE INDEX)
          '42710', // Trigger already exists (for CREATE TRIGGER)
          '42P07', // Table already exists (for CREATE TABLE)
          '42723', // Function already exists (for CREATE FUNCTION)
          '42701', // Column already exists (for ALTER TABLE ADD COLUMN)
          '23502', // NOT NULL constraint violation (for INSERT statements - typically sample data)
        ];
        
        if (skipableErrors.includes(error?.code)) {
          let skipMessage = '';
          
          if (error?.code === '42703' && statement.toUpperCase().includes('CREATE INDEX')) {
            const tableMatch = statement.match(/ON\s+(\w+)\s*\(/i);
            const columnMatch = statement.match(/\((\w+)\)/i);
            if (tableMatch && columnMatch) {
              skipMessage = `Skipping index creation on ${tableMatch[1]}.${columnMatch[1]} - column does not exist`;
            }
          } else if (error?.code === '42710' && statement.toUpperCase().includes('CREATE TRIGGER')) {
            const triggerMatch = statement.match(/CREATE\s+TRIGGER\s+(\w+)/i);
            if (triggerMatch) {
              skipMessage = `Skipping trigger creation: ${triggerMatch[1]} - trigger already exists`;
            }
          } else if (error?.code === '42P07' && statement.toUpperCase().includes('CREATE TABLE')) {
            skipMessage = `Skipping table creation - table already exists`;
          } else if (error?.code === '42723' && statement.toUpperCase().includes('CREATE FUNCTION')) {
            const funcMatch = statement.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+)/i);
            if (funcMatch) {
              skipMessage = `Function ${funcMatch[1]} already exists (using CREATE OR REPLACE should handle this)`;
            }
          } else if (error?.code === '42701' && statement.toUpperCase().includes('ALTER TABLE') && statement.toUpperCase().includes('ADD COLUMN')) {
            const columnMatch = statement.match(/ADD\s+COLUMN\s+(\w+)/i);
            const tableMatch = statement.match(/ALTER\s+TABLE\s+(\w+)/i);
            if (columnMatch && tableMatch) {
              skipMessage = `Skipping ALTER TABLE ${tableMatch[1]} ADD COLUMN ${columnMatch[1]} - column already exists`;
            }
          } else if ((error?.code === '42P07' || error?.code === '42710') && statement.toUpperCase().includes('ALTER TABLE') && statement.toUpperCase().includes('ADD CONSTRAINT')) {
            const constraintMatch = statement.match(/ADD\s+CONSTRAINT\s+(\w+)/i);
            const tableMatch = statement.match(/ALTER\s+TABLE\s+(\w+)/i);
            if (constraintMatch && tableMatch) {
              skipMessage = `Skipping ALTER TABLE ${tableMatch[1]} ADD CONSTRAINT ${constraintMatch[1]} - constraint already exists`;
            }
          } else if (error?.code === '23502' && statement.toUpperCase().includes('INSERT')) {
            // Handle NOT NULL constraint violations in INSERT statements (typically sample data)
            const insertMatch = statement.match(/INSERT\s+INTO\s+(\w+)/i);
            if (insertMatch) {
              skipMessage = `Skipping INSERT into ${insertMatch[1]} - constraint violation (likely sample data with schema mismatch)`;
            }
          }
          
          if (skipMessage) {
            logger.warn(skipMessage);
            continue;
          }
        }
        
        // If it's not a skipable error, log and rethrow
        logger.error(`Error in statement ${i + 1}/${statements.length}:`, {
          statement: statement.substring(0, 200) + (statement.length > 200 ? '...' : ''),
          error
        });
        throw error;
      }
    }
  });
}

/**
 * Create the migrations tracking table if it doesn't exist
 */
async function ensureMigrationsTable(): Promise<void> {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64),
      execution_time_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_schema_migrations_name ON schema_migrations(migration_name);
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at ON schema_migrations(executed_at);
  `;

  await executeSQLStatements(createTableSQL);
  logger.info('Migrations tracking table ready');
}

/**
 * Get list of already executed migrations
 */
async function getExecutedMigrations(): Promise<string[]> {
  try {
    const result = await db.query<{ migration_name: string }>(
      'SELECT migration_name FROM schema_migrations ORDER BY executed_at'
    );
    return result.rows.map(row => row.migration_name);
  } catch (error) {
    // If table doesn't exist yet, return empty array
    logger.warn('Could not fetch executed migrations, assuming none exist');
    return [];
  }
}

/**
 * Record a successful migration execution
 */
async function recordMigration(
  migrationName: string,
  executionTimeMs: number,
  checksum?: string
): Promise<void> {
  await db.query(
    `INSERT INTO schema_migrations (migration_name, execution_time_ms, checksum)
     VALUES ($1, $2, $3)
     ON CONFLICT (migration_name) DO NOTHING`,
    [migrationName, executionTimeMs, checksum || null]
  );
}

/**
 * Calculate a simple checksum for migration content
 */
function calculateChecksum(content: string): string {
  // Simple hash function for checksum
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Ensure migrations tracking table exists
    await ensureMigrationsTable();

    // Get list of already executed migrations
    const executedMigrations = await getExecutedMigrations();
    logger.info(`Found ${executedMigrations.length} previously executed migrations`);

    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    let executedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      // Skip if already executed
      if (executedMigrations.includes(file)) {
        logger.info(`Skipping already executed migration: ${file}`);
        skippedCount++;
        continue;
      }

      const startTime = Date.now();
      logger.info(`Running migration: ${file}`);

      try {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const checksum = calculateChecksum(sql);
        
        // Execute the migration (split into statements and execute in transaction)
        await executeSQLStatements(sql);
        
        const executionTimeMs = Date.now() - startTime;
        
        // Record successful migration
        await recordMigration(file, executionTimeMs, checksum);
        
        logger.info(`Completed migration: ${file} (${executionTimeMs}ms)`);
        executedCount++;
      } catch (error) {
        logger.error(`Failed to execute migration: ${file}`, error);
        throw error;
      }
    }

    logger.info(`Migrations completed: ${executedCount} executed, ${skippedCount} skipped`);
    logger.info('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();


