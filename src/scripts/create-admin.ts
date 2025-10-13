import { userDAO } from '../dao/user.dao';
import { roleDAO } from '../dao/role.dao';
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

    // Get admin role
    const adminRole = await roleDAO.findByName('admin');
    if (!adminRole) {
      throw new Error('Admin role not found. Please run migrations first.');
    }

    // Check if admin user already exists
    const existingAdmin = await userDAO.findByUsername('admin');
    if (existingAdmin) {
      logger.info('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const adminUser = await userDAO.create({
      username: 'admin',
      email: 'admin@ricesoft.com',
      password: 'admin123',
      role_id: adminRole.id,
      full_name: 'System Administrator',
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
    logger.info('  Password: admin123');

    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create admin user:', error);
    process.exit(1);
  }
}

createAdminUser();

