import { userDAO } from '../dao/user.dao';
import { logger } from '../utils/logger';
import { db } from '../database/connection';

async function resetAdminPassword() {
  try {
    logger.info('Starting admin password reset...');

    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Find admin user
    const adminUser = await userDAO.findByUsername('admin');
    if (!adminUser) {
      logger.error('Admin user not found. Please run create-admin script first.');
      process.exit(1);
    }

    // Get admin password from environment variable or use secure default
    const adminPassword = process.env.ADMIN_PASSWORD || 'Xk9#mP2@nQ7!vR4$wT8&aL5';

    // Update admin password
    await userDAO.updatePassword(adminUser.id, adminPassword);

    logger.info('Admin password reset successfully', {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
    });

    logger.info('Updated credentials:');
    logger.info('  Username: admin');
    logger.info(`  Password: ${adminPassword}`);
    logger.warn(
      'Shell/curl tip: the default password contains $. In bash/zsh, wrap JSON in SINGLE quotes ' +
        "so the shell does not strip it, e.g. curl ... -d '{\"username\":\"admin\",\"password\":\"...\"}'"
    );
    logger.warn('IMPORTANT: Please change this password after logging in!');

    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('Failed to reset admin password:', error);
    process.exit(1);
  }
}

resetAdminPassword();




