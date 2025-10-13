import { Response, NextFunction } from 'express';
import { userDAO } from '../dao/user.dao';
import { roleDAO } from '../dao/role.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createUserSchema,
  updateUserSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../utils/errors';
import { CreateUserDTO, UpdateUserDTO, UserResponse } from '../models/user.model';
import { AuthRequest } from '../middleware/auth.middleware';

export class UserController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const users = await userDAO.findAll(includeInactive);

      const userResponses: UserResponse[] = users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        last_login: user.last_login?.toISOString() || null,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, userResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const user = await userDAO.findById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const userResponse: UserResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        last_login: user.last_login?.toISOString() || null,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, userResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const userData = validate<CreateUserDTO>(createUserSchema, req.body);

      // Check if role exists
      const roleExists = await roleDAO.exists(userData.role_id);
      if (!roleExists) {
        throw new ValidationError('Invalid role_id');
      }

      // Check if username already exists
      const usernameExists = await userDAO.usernameExists(userData.username);
      if (usernameExists) {
        throw new ConflictError('Username already exists');
      }

      // Check if email already exists
      const emailExists = await userDAO.emailExists(userData.email);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }

      // Set created_by from authenticated user
      if (req.user) {
        userData.created_by = req.user.userId;
      }

      const user = await userDAO.create(userData);

      const userResponse: UserResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        last_login: user.last_login?.toISOString() || null,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, userResponse, 'User created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const userData = validate<UpdateUserDTO>(updateUserSchema, req.body);

      // Check if user exists
      const existingUser = await userDAO.findById(id);
      if (!existingUser) {
        throw new NotFoundError('User not found');
      }

      // Users can only update themselves unless they are admin
      if (req.user?.roleName !== 'admin' && req.user?.userId !== id) {
        throw new ForbiddenError('You can only update your own profile');
      }

      // Check if role exists (if being updated)
      if (userData.role_id) {
        const roleExists = await roleDAO.exists(userData.role_id);
        if (!roleExists) {
          throw new ValidationError('Invalid role_id');
        }

        // Only admins can change roles
        if (req.user?.roleName !== 'admin') {
          throw new ForbiddenError('Only admins can change user roles');
        }
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

      // Set updated_by from authenticated user
      if (req.user) {
        userData.updated_by = req.user.userId;
      }

      const user = await userDAO.update(id, userData);
      if (!user) {
        throw new NotFoundError('User not found after update');
      }

      const userResponse: UserResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        last_login: user.last_login?.toISOString() || null,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, userResponse, 'User updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      // Check if user exists
      const user = await userDAO.findById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Prevent users from deleting themselves
      if (req.user?.userId === id) {
        throw new ForbiddenError('You cannot delete your own account');
      }

      await userDAO.delete(id);

      return ResponseHandler.success(res, null, 'User deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();


