import { db } from '../database/connection';
import { Vehicle, CreateVehicleDTO, UpdateVehicleDTO } from '../models/vehicle.model';
import { logger } from '../utils/logger';
import {
  mergeVehicleVerificationDetailsPatch,
  parseVehicleVerificationDetails,
} from '../utils/kyc-verification';

export class VehicleDAO {
  async findAll(transporterId?: string, isActive?: boolean): Promise<Vehicle[]> {
    let query = `
      SELECT id, vehicle_number, rc_number, owner_name, vehicle_class, fuel_type,
             maker_model, registration_date, insurance_validity, fitness_validity,
             permit_validity, challan_details, transporter_ids, is_verified, verified_at, verification_details,
             is_active, created_at, updated_at, created_by, updated_by
      FROM vehicles
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (isActive !== undefined) {
      query += ` AND is_active = $${paramCount++}`;
      params.push(isActive);
    }

    if (transporterId) {
      query += ` AND $${paramCount++} = ANY(transporter_ids)`;
      params.push(transporterId);
    }

    query += ` ORDER BY vehicle_number ASC`;

    const result = await db.query<Vehicle>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Vehicle | null> {
    const query = `
      SELECT id, vehicle_number, rc_number, owner_name, vehicle_class, fuel_type,
             maker_model, registration_date, insurance_validity, fitness_validity,
             permit_validity, challan_details, transporter_ids, is_verified, verified_at, verification_details,
             is_active, created_at, updated_at, created_by, updated_by
      FROM vehicles
      WHERE id = $1
    `;
    const result = await db.query<Vehicle>(query, [id]);
    return result.rows[0] || null;
  }

  async findByVehicleNumber(vehicleNumber: string): Promise<Vehicle | null> {
    const query = `
      SELECT id, vehicle_number, rc_number, owner_name, vehicle_class, fuel_type,
             maker_model, registration_date, insurance_validity, fitness_validity,
             permit_validity, challan_details, transporter_ids, is_verified, verified_at, verification_details,
             is_active, created_at, updated_at, created_by, updated_by
      FROM vehicles
      WHERE vehicle_number = $1
    `;
    const result = await db.query<Vehicle>(query, [vehicleNumber]);
    return result.rows[0] || null;
  }

  async vehicleNumberExists(vehicleNumber: string, excludeId?: string): Promise<boolean> {
    let query = `SELECT EXISTS(SELECT 1 FROM vehicles WHERE vehicle_number = $1`;
    const params: any[] = [vehicleNumber];
    
    if (excludeId) {
      query += ` AND id != $2`;
      params.push(excludeId);
    }
    
    query += `) as exists`;
    
    const result = await db.query<{ exists: boolean }>(query, params);
    return result.rows[0].exists;
  }

  async create(vehicleData: CreateVehicleDTO): Promise<Vehicle> {
    // Check if vehicle number already exists
    const exists = await this.vehicleNumberExists(vehicleData.vehicle_number);
    if (exists) {
      throw new Error('Vehicle number already exists');
    }

    const verificationDetails = mergeVehicleVerificationDetailsPatch(
      {},
      vehicleData.verification_details
    );

    const query = `
      INSERT INTO vehicles (
        vehicle_number, rc_number, owner_name, vehicle_class, fuel_type,
        maker_model, registration_date, insurance_validity, fitness_validity,
        permit_validity, challan_details, transporter_ids, is_verified, verified_at,
        verification_details, is_active, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id, vehicle_number, rc_number, owner_name, vehicle_class, fuel_type,
                maker_model, registration_date, insurance_validity, fitness_validity,
                permit_validity, challan_details, transporter_ids, is_verified, verified_at, verification_details,
                is_active, created_at, updated_at, created_by, updated_by
    `;

    const values = [
      vehicleData.vehicle_number.toUpperCase().trim(),
      vehicleData.rc_number || null,
      vehicleData.owner_name || null,
      vehicleData.vehicle_class || null,
      vehicleData.fuel_type || null,
      vehicleData.maker_model || null,
      vehicleData.registration_date || null,
      vehicleData.insurance_validity || null,
      vehicleData.fitness_validity || null,
      vehicleData.permit_validity || null,
      vehicleData.challan_details ? JSON.stringify(vehicleData.challan_details) : '[]',
      vehicleData.transporter_ids || [],
      vehicleData.is_verified !== undefined ? vehicleData.is_verified : false,
      vehicleData.verified_at || null,
      JSON.stringify(verificationDetails),
      vehicleData.is_active !== undefined ? vehicleData.is_active : true,
      vehicleData.created_by || null,
    ];

    const result = await db.query<Vehicle>(query, values);
    const vehicle = result.rows[0];

    logger.info('Vehicle created', {
      vehicleId: vehicle.id,
      vehicleNumber: vehicle.vehicle_number,
      transporterIds: vehicle.transporter_ids,
    });

    // Note: Transporter sync is handled by database trigger
    return vehicle;
  }

  async update(id: string, vehicleData: UpdateVehicleDTO): Promise<Vehicle | null> {
    // Check if vehicle number is being changed and if it already exists
    if (vehicleData.vehicle_number) {
      const exists = await this.vehicleNumberExists(vehicleData.vehicle_number, id);
      if (exists) {
        throw new Error('Vehicle number already exists');
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (vehicleData.vehicle_number !== undefined) {
      fields.push(`vehicle_number = $${paramCount++}`);
      values.push(vehicleData.vehicle_number.toUpperCase().trim());
    }
    if (vehicleData.rc_number !== undefined) {
      fields.push(`rc_number = $${paramCount++}`);
      values.push(vehicleData.rc_number);
    }
    if (vehicleData.owner_name !== undefined) {
      fields.push(`owner_name = $${paramCount++}`);
      values.push(vehicleData.owner_name);
    }
    if (vehicleData.vehicle_class !== undefined) {
      fields.push(`vehicle_class = $${paramCount++}`);
      values.push(vehicleData.vehicle_class);
    }
    if (vehicleData.fuel_type !== undefined) {
      fields.push(`fuel_type = $${paramCount++}`);
      values.push(vehicleData.fuel_type);
    }
    if (vehicleData.maker_model !== undefined) {
      fields.push(`maker_model = $${paramCount++}`);
      values.push(vehicleData.maker_model);
    }
    if (vehicleData.registration_date !== undefined) {
      fields.push(`registration_date = $${paramCount++}`);
      values.push(vehicleData.registration_date);
    }
    if (vehicleData.insurance_validity !== undefined) {
      fields.push(`insurance_validity = $${paramCount++}`);
      values.push(vehicleData.insurance_validity);
    }
    if (vehicleData.fitness_validity !== undefined) {
      fields.push(`fitness_validity = $${paramCount++}`);
      values.push(vehicleData.fitness_validity);
    }
    if (vehicleData.permit_validity !== undefined) {
      fields.push(`permit_validity = $${paramCount++}`);
      values.push(vehicleData.permit_validity);
    }
    if (vehicleData.challan_details !== undefined) {
      fields.push(`challan_details = $${paramCount++}`);
      values.push(JSON.stringify(vehicleData.challan_details));
    }
    if (vehicleData.transporter_ids !== undefined) {
      fields.push(`transporter_ids = $${paramCount++}`);
      values.push(vehicleData.transporter_ids);
    }
    if (vehicleData.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(vehicleData.is_active);
    }
    if (vehicleData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(vehicleData.updated_by);
    }

    if (vehicleData.verification_details !== undefined) {
      const existingRow = await db.query<{ verification_details: unknown }>(
        `SELECT verification_details FROM vehicles WHERE id = $1`,
        [id]
      );
      const merged = mergeVehicleVerificationDetailsPatch(
        parseVehicleVerificationDetails(existingRow.rows[0]?.verification_details),
        vehicleData.verification_details
      );
      fields.push(`verification_details = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(merged));
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE vehicles
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, vehicle_number, rc_number, owner_name, vehicle_class, fuel_type,
                maker_model, registration_date, insurance_validity, fitness_validity,
                permit_validity, challan_details, transporter_ids, is_verified, verified_at, verification_details,
                is_active, created_at, updated_at, created_by, updated_by
    `;

    const result = await db.query<Vehicle>(query, values);
    const vehicle = result.rows[0] || null;

    if (vehicle) {
      logger.info('Vehicle updated', {
        vehicleId: vehicle.id,
        vehicleNumber: vehicle.vehicle_number,
        transporterIds: vehicle.transporter_ids,
      });
    }

    // Note: Transporter sync is handled by database trigger
    return vehicle;
  }

  async delete(id: string): Promise<boolean> {
    // Check if vehicle is linked to any active ISPs
    const ispCheckQuery = `
      SELECT EXISTS(
        SELECT 1 FROM inward_slip_passes 
        WHERE vehicle_id = $1
      ) as has_isps
    `;
    const ispCheck = await db.query<{ has_isps: boolean }>(ispCheckQuery, [id]);
    
    if (ispCheck.rows[0].has_isps) {
      throw new Error('Cannot delete vehicle that is linked to inward slip passes');
    }

    // Soft delete
    const query = `
      UPDATE vehicles
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;

    if (deleted) {
      logger.info('Vehicle soft deleted', { vehicleId: id });
    }

    return deleted;
  }
}

export const vehicleDAO = new VehicleDAO();


