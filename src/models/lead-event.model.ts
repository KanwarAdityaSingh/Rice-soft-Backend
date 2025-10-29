export interface LeadEvent {
  id: string;
  lead_id: string;
  event_type: string;
  event_description: string | null;
  created_by: string | null;
  created_at: Date;
  metadata: any | null;
}

export interface CreateLeadEventDTO {
  lead_id: string;
  event_type: string;
  event_description?: string;
  created_by?: string;
  metadata?: any;
}

export interface LeadEventResponse {
  id: string;
  lead_id: string;
  event_type: string;
  event_description: string | null;
  created_by: string | null;
  created_at: string;
  metadata: any | null;
}

// Common event types
export const LEAD_EVENT_TYPES = {
  CREATED: 'created',
  STATUS_CHANGED: 'status_changed',
  ASSIGNED: 'assigned',
  NOTE_ADDED: 'note_added',
  CALL_MADE: 'call_made',
  EMAIL_SENT: 'email_sent',
  MEETING_SCHEDULED: 'meeting_scheduled',
  MEETING_COMPLETED: 'meeting_completed',
  QUOTE_SENT: 'quote_sent',
  CONVERTED: 'converted',
  REJECTED: 'rejected',
  FOLLOW_UP: 'follow_up',
  PRIORITY_CHANGED: 'priority_changed',
  VALUE_UPDATED: 'value_updated',
  CLOSE_DATE_UPDATED: 'close_date_updated'
} as const; 
