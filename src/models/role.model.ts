export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export enum RoleName {
  ADMIN = 'admin',
  SALESMAN = 'salesman',
  ACCOUNTANT = 'accountant',
  WAREHOUSE_OPERATOR = 'warehouse_operator',
  BROKER = 'broker',
  VIEWER = 'viewer',
}

export interface CreateRoleDTO {
  name: string;
  description?: string;
  permissions?: Record<string, any>;
}

export interface UpdateRoleDTO {
  name?: string;
  description?: string;
  permissions?: Record<string, any>;
}

export interface RoleResponse {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, any>;
  created_at: string;
  updated_at: string;
}

