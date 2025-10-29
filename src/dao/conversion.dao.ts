import { db } from '../database/connection';
import { Conversion, CreateConversionDTO, UpdateConversionDTO, ConversionWithDetails } from '../models/conversion.model';
import { logger } from '../utils/logger';

export class ConversionDAO {
  async findAll(): Promise<Conversion[]> {
    const query = `
      SELECT id, lead_id, vendor_id, broker_id, conversion_date, conversion_value,
             commission_rate, commission_amount, created_by, notes
      FROM conversions
      ORDER BY conversion_date DESC
    `;
    const result = await db.query<Conversion>(query);
    return result.rows;
  }

  async findById(id: string): Promise<Conversion | null> {
    const query = `
      SELECT id, lead_id, vendor_id, broker_id, conversion_date, conversion_value,
             commission_rate, commission_amount, created_by, notes
      FROM conversions
      WHERE id = $1
    `;
    const result = await db.query<Conversion>(query, [id]);
    return result.rows[0] || null;
  }

  async findByLeadId(leadId: string): Promise<Conversion | null> {
    const query = `
      SELECT id, lead_id, vendor_id, broker_id, conversion_date, conversion_value,
             commission_rate, commission_amount, created_by, notes
      FROM conversions
      WHERE lead_id = $1
    `;
    const result = await db.query<Conversion>(query, [leadId]);
    return result.rows[0] || null;
  }

  async findByVendorId(vendorId: string): Promise<Conversion[]> {
    const query = `
      SELECT id, lead_id, vendor_id, broker_id, conversion_date, conversion_value,
             commission_rate, commission_amount, created_by, notes
      FROM conversions
      WHERE vendor_id = $1
      ORDER BY conversion_date DESC
    `;
    const result = await db.query<Conversion>(query, [vendorId]);
    return result.rows;
  }

  async findByBrokerId(brokerId: string): Promise<Conversion[]> {
    const query = `
      SELECT id, lead_id, vendor_id, broker_id, conversion_date, conversion_value,
             commission_rate, commission_amount, created_by, notes
      FROM conversions
      WHERE broker_id = $1
      ORDER BY conversion_date DESC
    `;
    const result = await db.query<Conversion>(query, [brokerId]);
    return result.rows;
  }

  async findAllWithDetails(): Promise<ConversionWithDetails[]> {
    const query = `
      SELECT 
        c.id, c.lead_id, c.vendor_id, c.broker_id, c.conversion_date, c.conversion_value,
        c.commission_rate, c.commission_amount, c.created_by, c.notes,
        l.company_name as lead_company_name,
        v.business_name as vendor_business_name,
        b.business_name as broker_business_name,
        u.username as created_by_username
      FROM conversions c
      LEFT JOIN leads l ON c.lead_id = l.id
      LEFT JOIN vendors v ON c.vendor_id = v.id
      LEFT JOIN brokers b ON c.broker_id = b.id
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.conversion_date DESC
    `;
    const result = await db.query<ConversionWithDetails>(query);
    return result.rows;
  }

  async create(conversionData: CreateConversionDTO): Promise<Conversion> {
    const query = `
      INSERT INTO conversions (lead_id, vendor_id, broker_id, conversion_value,
                             commission_rate, commission_amount, created_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, lead_id, vendor_id, broker_id, conversion_date, conversion_value,
                commission_rate, commission_amount, created_by, notes
    `;
    
    const values = [
      conversionData.lead_id,
      conversionData.vendor_id,
      conversionData.broker_id || null,
      conversionData.conversion_value || null,
      conversionData.commission_rate || null,
      conversionData.commission_amount || null,
      conversionData.created_by || null,
      conversionData.notes || null
    ];

    const result = await db.query<Conversion>(query, values);
    const conversion = result.rows[0];

    logger.info('Conversion created', {
      conversionId: conversion.id,
      leadId: conversion.lead_id,
      vendorId: conversion.vendor_id,
      brokerId: conversion.broker_id
    });

    return conversion;
  }

  async update(id: string, conversionData: UpdateConversionDTO): Promise<Conversion | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (conversionData.conversion_value !== undefined) {
      fields.push(`conversion_value = $${paramCount++}`);
      values.push(conversionData.conversion_value);
    }
    if (conversionData.commission_rate !== undefined) {
      fields.push(`commission_rate = $${paramCount++}`);
      values.push(conversionData.commission_rate);
    }
    if (conversionData.commission_amount !== undefined) {
      fields.push(`commission_amount = $${paramCount++}`);
      values.push(conversionData.commission_amount);
    }
    if (conversionData.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(conversionData.notes);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const query = `
      UPDATE conversions
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, lead_id, vendor_id, broker_id, conversion_date, conversion_value,
                commission_rate, commission_amount, created_by, notes
    `;

    const result = await db.query<Conversion>(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM conversions WHERE id = $1';
    const result = await db.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  async getConversionStats(): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_conversions,
        SUM(conversion_value) as total_value,
        AVG(conversion_value) as avg_value,
        SUM(commission_amount) as total_commission,
        AVG(commission_rate) as avg_commission_rate,
        COUNT(CASE WHEN broker_id IS NOT NULL THEN 1 END) as broker_involved_conversions
      FROM conversions
    `;
    const result = await db.query(query);
    return result.rows[0];
  }

  async getMonthlyConversions(): Promise<any[]> {
    const query = `
      SELECT 
        DATE_TRUNC('month', conversion_date) as month,
        COUNT(*) as conversions,
        SUM(conversion_value) as total_value,
        SUM(commission_amount) as total_commission
      FROM conversions
      GROUP BY DATE_TRUNC('month', conversion_date)
      ORDER BY month DESC
    `;
    const result = await db.query(query);
    return result.rows;
  }
}
