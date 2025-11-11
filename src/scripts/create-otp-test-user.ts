import { userDAO } from '../dao/user.dao';
import { db } from '../database/connection';
import { logger } from '../utils/logger';

async function ensureTestUser() {
  try {
    const username = 'otpuser';
    const phone = '9876543210';
    let user = await userDAO.findByUsername(username);
    if (!user) {
      logger.info('Creating OTP test user...');
      user = await userDAO.create({
        username,
        email: 'otpuser@example.com',
        password: 'TempPassword123!',
        full_name: 'OTP Test User',
        phone,
        user_type: 'custom',
        is_active: true,
      });
      logger.info('OTP test user created', { id: user.id });
    } else {
      logger.info('OTP test user already exists, updating phone if needed');
      await userDAO.update(user.id, { phone });
    }
    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('Failed to ensure OTP test user', { error });
    process.exit(1);
  }
}

ensureTestUser();


