import { db } from '../database/connection';
import { AuditLog, CreateAuditLogDTO } from '../models/audit-log.model';

export class AuditLogDAO {
  async create(data: CreateAuditLogDTO): Promise<AuditLog> {
    const query = `
      INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, action, entity_type, entity_id, old_values, new_values, 
                ip_address, user_agent, created_at
    `;

    const values = [
      data.user_id || null,
      data.action,
      data.entity_type,
      data.entity_id || null,
      data.old_values ? JSON.stringify(data.old_values) : null,
      data.new_values ? JSON.stringify(data.new_values) : null,
      data.ip_address || null,
      data.user_agent || null,
    ];

    const result = await db.query<AuditLog>(query, values);
    return result.rows[0];
  }

  async findByEntityId(entityType: string, entityId: string): Promise<AuditLog[]> {
    const query = `
      SELECT id, user_id, action, entity_type, entity_id, old_values, new_values,
             ip_address, user_agent, created_at
      FROM audit_logs
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
    `;
    const result = await db.query<AuditLog>(query, [entityType, entityId]);
    return result.rows;
  }

  async findByUserId(userId: string, limit = 100): Promise<AuditLog[]> {
    const query = `
      SELECT id, user_id, action, entity_type, entity_id, old_values, new_values,
             ip_address, user_agent, created_at
      FROM audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await db.query<AuditLog>(query, [userId, limit]);
    return result.rows;
  }

  async findRecent(limit = 100): Promise<AuditLog[]> {
    const query = `
      SELECT id, user_id, action, entity_type, entity_id, old_values, new_values,
             ip_address, user_agent, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const result = await db.query<AuditLog>(query, [limit]);
    return result.rows;
  }
}

export const auditLogDAO = new AuditLogDAO();


