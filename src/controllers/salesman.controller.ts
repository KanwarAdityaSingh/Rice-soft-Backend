import { Response, NextFunction } from 'express';
import { salesmanDAO } from '../dao/salesman.dao';
import { userDAO } from '../dao/user.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createSalesmanSchema,
  updateSalesmanSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ConflictError,
} from '../utils/errors';
import { CreateSalesmanDTO, UpdateSalesmanDTO, SalesmanResponse } from '../models/salesman.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { resolveOrCreateEntityUser, allocateUsername } from '../utils/resolve-entity-user';

export class SalesmanController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const salesmen = await salesmanDAO.findAll(includeInactive);

      const salesmenResponses: SalesmanResponse[] = salesmen.map((salesman) => ({
        id: salesman.id,
        name: salesman.name,
        phone: salesman.phone,
        email: salesman.email,
        is_active: salesman.is_active,
        created_at: salesman.created_at.toISOString(),
        updated_at: salesman.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, salesmenResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const salesman = await salesmanDAO.findById(id);
      if (!salesman) {
        throw new NotFoundError('Salesman not found');
      }

      const salesmanResponse: SalesmanResponse = {
        id: salesman.id,
        name: salesman.name,
        phone: salesman.phone,
        email: salesman.email,
        is_active: salesman.is_active,
        created_at: salesman.created_at.toISOString(),
        updated_at: salesman.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, salesmanResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salesmanData = validate<CreateSalesmanDTO>(createSalesmanSchema, req.body);

      // Check if email already exists in salesmen (only if email is provided)
      if (salesmanData.email) {
        const emailExists = await salesmanDAO.emailExists(salesmanData.email);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Create or reuse login user
      let user;
      if (salesmanData.email) {
        user = await resolveOrCreateEntityUser({
          email: salesmanData.email,
          fullName: salesmanData.name,
          phone: salesmanData.phone,
          userType: 'salesman',
          isActive: salesmanData.is_active !== undefined ? salesmanData.is_active : true,
          createdBy: req.user?.userId,
          entityLabel: 'salesman',
        });
      } else {
        const username = await allocateUsername(salesmanData.name);
        try {
          user = await userDAO.create({
            username,
            password: 'defaultPassword123',
            full_name: salesmanData.name,
            phone: salesmanData.phone,
            user_type: 'salesman',
            is_active: salesmanData.is_active !== undefined ? salesmanData.is_active : true,
            created_by: req.user?.userId,
          });
        } catch (userError) {
          console.error('User creation failed:', userError);
          throw new ConflictError('Failed to create user account for salesman');
        }
      }

      // Create salesman with user_id
      const salesmanWithUser = {
        ...salesmanData,
        user_id: user.id,
        created_by: req.user?.userId,
      };

      const salesman = await salesmanDAO.create(salesmanWithUser);

      const salesmanResponse: SalesmanResponse = {
        id: salesman.id,
        name: salesman.name,
        phone: salesman.phone,
        email: salesman.email,
        is_active: salesman.is_active,
        created_at: salesman.created_at.toISOString(),
        updated_at: salesman.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, salesmanResponse, 'Salesman created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const salesmanData = validate<UpdateSalesmanDTO>(updateSalesmanSchema, req.body);

      // Check if salesman exists
      const existingSalesman = await salesmanDAO.findById(id);
      if (!existingSalesman) {
        throw new NotFoundError('Salesman not found');
      }

      // Check if email already exists (if being updated)
      if (salesmanData.email) {
        const emailExists = await salesmanDAO.emailExists(salesmanData.email, id);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        salesmanData.updated_by = req.user.userId;
      }

      const salesman = await salesmanDAO.update(id, salesmanData);
      if (!salesman) {
        throw new NotFoundError('Salesman not found after update');
      }

      const salesmanResponse: SalesmanResponse = {
        id: salesman.id,
        name: salesman.name,
        phone: salesman.phone,
        email: salesman.email,
        is_active: salesman.is_active,
        created_at: salesman.created_at.toISOString(),
        updated_at: salesman.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, salesmanResponse, 'Salesman updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      // Check if salesman exists
      const salesman = await salesmanDAO.findById(id);
      if (!salesman) {
        throw new NotFoundError('Salesman not found');
      }

      await salesmanDAO.delete(id);

      return ResponseHandler.success(res, null, 'Salesman deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const salesmanController = new SalesmanController();

