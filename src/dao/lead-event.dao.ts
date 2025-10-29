import { db } from '../database/connection';
import { LeadEvent, CreateLeadEventDTO } from '../models/lead-event.model';
import { logger } from '../utils/logger';

export class LeadEventDAO {
  async findByLeadId(leadId: string): Promise<LeadEvent[]> {
    const query = `
      SELECT id, lead_id, event_type, event_description, created_by, created_at, metadata
      FROM lead_events
      WHERE lead_id = $1
      ORDER BY created_at DESC
    `;
    const result = await db.query<LeadEvent>(query, [leadId]);
    return result.rows;
  }

  async findById(id: string): Promise<LeadEvent | null> {
    const query = `
      SELECT id, lead_id, event_type, event_description, created_by, created_at, metadata
      FROM lead_events
      WHERE id = $1
    `;
    const result = await db.query<LeadEvent>(query, [id]);
    return result.rows[0] || null;
  }

  async create(eventData: CreateLeadEventDTO): Promise<LeadEvent> {
    const query = `
      INSERT INTO lead_events (lead_id, event_type, event_description, created_by, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, lead_id, event_type, event_description, created_by, created_at, metadata
    `;
    
    const values = [
      eventData.lead_id,
      eventData.event_type,
      eventData.event_description || null,
      eventData.created_by || null,
      eventData.metadata ? JSON.stringify(eventData.metadata) : null
    ];

    const result = await db.query<LeadEvent>(query, values);
    const event = result.rows[0];

    logger.info('Lead event created', {
      eventId: event.id,
      leadId: event.lead_id,
      eventType: event.event_type
    });

    return event;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM lead_events WHERE id = $1';
    const result = await db.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  async getEventStats(leadId?: string): Promise<any> {
    let query = `
      SELECT 
        event_type,
        COUNT(*) as count,
        MAX(created_at) as last_occurrence
      FROM lead_events
    `;
    const params: any[] = [];
    
    if (leadId) {
      query += ' WHERE lead_id = $1';
      params.push(leadId);
    }
    
    query += ' GROUP BY event_type ORDER BY count DESC';
    
    const result = await db.query(query, params);
    return result.rows;
  }

  async getRecentEvents(limit = 10): Promise<LeadEvent[]> {
    const query = `
      SELECT id, lead_id, event_type, event_description, created_by, created_at, metadata
      FROM lead_events
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const result = await db.query<LeadEvent>(query, [limit]);
    return result.rows;
  }
}
