import { userDAO } from '../dao/user.dao';
import { NotFoundError, ConflictError } from '../utils/errors';
import { CreateUserDTO, UpdateUserDTO, User, CustomPermissions } from '../models/user.model';
import { logger } from '../utils/logger';

export class UserService {
  async getAllUsers(includeInactive: boolean, userType?: string): Promise<User[]> {
    return await userDAO.findAll(includeInactive, userType);
  }

  async getUserById(id: string): Promise<User> {
    const user = await userDAO.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  async createUser(userData: CreateUserDTO): Promise<User> {
    // Check if username already exists
    const usernameExists = await userDAO.usernameExists(userData.username);
    if (usernameExists) {
      throw new ConflictError('Username already exists');
    }

    // Check if email already exists (only if email is provided)
    if (userData.email) {
      const emailExists = await userDAO.emailExists(userData.email);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }
    }

    logger.info('Creating user', {
      username: userData.username,
      email: userData.email || null,
      userType: userData.user_type
    });

    return await userDAO.create(userData);
  }

  async updateUser(id: string, userData: UpdateUserDTO): Promise<User> {
    // Check if user exists
    const existingUser = await userDAO.findById(id);
    if (!existingUser) {
      throw new NotFoundError('User not found');
    }

    // Check if username already exists (if being updated)
    if (userData.username) {
      const usernameExists = await userDAO.usernameExists(userData.username, id);
      if (usernameExists) {
        throw new ConflictError('Username already exists');
      }
    }

    // Check if email already exists (if being updated)
    if (userData.email) {
      const emailExists = await userDAO.emailExists(userData.email, id);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }
    }

    logger.info('Updating user', { userId: id });

    const user = await userDAO.update(id, userData);
    if (!user) {
      throw new NotFoundError('User not found after update');
    }

    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await userDAO.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    logger.info('Deleting user', { userId: id });
    await userDAO.delete(id);
  }

  async updateCustomPermissions(id: string, permissions: CustomPermissions, updatedBy?: string): Promise<void> {
    const user = await userDAO.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    await userDAO.updateCustomPermissions(id, permissions, updatedBy);
  }
}

export const userService = new UserService();

