export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role_id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface UserWithRole extends Omit<User, 'password_hash'> {
  role_name: string;
  role_permissions: Record<string, any>;
}

export interface CreateUserDTO {
  username: string;
  email: string;
  password: string;
  role_id: string;
  full_name: string;
  phone?: string;
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateUserDTO {
  username?: string;
  email?: string;
  password?: string;
  role_id?: string;
  full_name?: string;
  phone?: string;
  is_active?: boolean;
  updated_by?: string;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  role_id: string;
  role_name: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginDTO {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: UserResponse;
  token: string;
  expires_in: string;
}

