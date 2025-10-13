import { Response, NextFunction } from 'express';
import { roleDAO } from '../dao/role.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createRoleSchema,
  updateRoleSchema,
  uuidSchema,
} from '../utils/validators';
import { NotFoundError, ConflictError } from '../utils/errors';
import { CreateRoleDTO, UpdateRoleDTO, RoleResponse } from '../models/role.model';
import { AuthRequest } from '../middleware/auth.middleware';

export class RoleController {
  async getAll(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const roles = await roleDAO.findAll();

      const roleResponses: RoleResponse[] = roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        created_at: role.created_at.toISOString(),
        updated_at: role.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, roleResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const role = await roleDAO.findById(id);
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      const roleResponse: RoleResponse = {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        created_at: role.created_at.toISOString(),
        updated_at: role.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, roleResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const roleData = validate<CreateRoleDTO>(createRoleSchema, req.body);

      // Check if role name already exists
      const nameExists = await roleDAO.nameExists(roleData.name);
      if (nameExists) {
        throw new ConflictError('Role name already exists');
      }

      const role = await roleDAO.create(roleData);

      const roleResponse: RoleResponse = {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        created_at: role.created_at.toISOString(),
        updated_at: role.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, roleResponse, 'Role created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const roleData = validate<UpdateRoleDTO>(updateRoleSchema, req.body);

      // Check if role exists
      const existingRole = await roleDAO.findById(id);
      if (!existingRole) {
        throw new NotFoundError('Role not found');
      }

      // Check if role name already exists (if being updated)
      if (roleData.name) {
        const nameExists = await roleDAO.nameExists(roleData.name, id);
        if (nameExists) {
          throw new ConflictError('Role name already exists');
        }
      }

      const role = await roleDAO.update(id, roleData);
      if (!role) {
        throw new NotFoundError('Role not found after update');
      }

      const roleResponse: RoleResponse = {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        created_at: role.created_at.toISOString(),
        updated_at: role.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, roleResponse, 'Role updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      // Check if role exists
      const role = await roleDAO.findById(id);
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      await roleDAO.delete(id);

      return ResponseHandler.success(res, null, 'Role deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const roleController = new RoleController();

