import { userDAO } from '../dao/user.dao';
import { logger } from '../utils/logger';
import { db } from '../database/connection';

async function createAdminUser() {
  try {
    logger.info('Starting admin user creation...');

    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Check if admin user already exists
    const existingAdmin = await userDAO.findByUsername('admin');
    if (existingAdmin) {
      logger.info('Admin user already exists');
      process.exit(0);
    }

    // Get admin password from environment variable or use secure default
    // Note: Change this password immediately after first login via environment variable
    const adminPassword = process.env.ADMIN_PASSWORD || 'Xk9#mP2@nQ7!vR4$wT8&aL5';

    // Create admin user
    const adminUser = await userDAO.create({
      username: 'admin',
      email: 'admin@ricesoft.com',
      password: adminPassword,
      full_name: 'System Administrator',
      user_type: 'admin',
      is_active: true,
    });

    logger.info('Admin user created successfully', {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
    });

    logger.warn('IMPORTANT: Please change the default password after first login!');
    logger.info('Default credentials:');
    logger.info('  Username: admin');
    logger.info(`  Password: ${adminPassword}`);

    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create admin user:', error);
    process.exit(1);
  }
}

createAdminUser();

