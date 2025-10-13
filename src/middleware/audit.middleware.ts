import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { auditLogDAO } from '../dao/audit-log.dao';
import { logger } from '../utils/logger';

export const auditLog = (action: string, entityType: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const originalJson = res.json;

      res.json = function (data: any) {
        // Only log successful operations
        if (res.statusCode < 400 && req.user) {
          const entityId = req.params.id || data?.data?.id;

          auditLogDAO
            .create({
              user_id: req.user.userId,
              action,
              entity_type: entityType,
              entity_id: entityId,
              new_values: req.body,
              ip_address: req.ip,
              user_agent: req.headers['user-agent'],
            })
            .catch((err) => {
              logger.error('Failed to create audit log:', err);
            });
        }

        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};

