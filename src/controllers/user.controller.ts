import { Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createUserSchema,
  updateUserSchema,
  uuidSchema,
  updateCustomPermissionsSchema,
} from '../utils/validators';
import { CreateUserDTO, UpdateUserDTO, UserResponse, CustomPermissions } from '../models/user.model';
import { AuthRequest } from '../middleware/auth.middleware';

export class UserController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const userType = req.query.user_type as string;
      const users = await userService.getAllUsers(includeInactive, userType);

      const userResponses: UserResponse[] = users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        user_type: user.user_type,
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

      const user = await userService.getUserById(id);

      const userResponse: UserResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        user_type: user.user_type,
        is_active: user.is_active,
        last_login: user.last_login?.toISOString() || null,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      };

      // Compute permissions similar to login response
      const permissions: CustomPermissions | null = 
        user.user_type === 'custom' ? (user.custom_permissions || {}) : null;

      const response = {
        user: userResponse,
        permissions,
      };

      return ResponseHandler.success(res, response);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const userData = validate<CreateUserDTO>(createUserSchema, req.body);

      // Set created_by from authenticated user
      if (req.user) {
        userData.created_by = req.user.userId;
      }

      const user = await userService.createUser(userData);

      const userResponse: UserResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        user_type: user.user_type,
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

      // Set updated_by from authenticated user
      if (req.user) {
        userData.updated_by = req.user.userId;
      }

      const user = await userService.updateUser(id, userData);

      const userResponse: UserResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        user_type: user.user_type,
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

      await userService.deleteUser(id);

      return ResponseHandler.success(res, null, 'User deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async updatePermissions(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const permissions = validate<any>(updateCustomPermissionsSchema, req.body);

      const updatedBy = req.user ? req.user.userId : undefined;
      await userService.updateCustomPermissions(id, permissions, updatedBy);

      return ResponseHandler.success(res, null, 'User permissions updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();