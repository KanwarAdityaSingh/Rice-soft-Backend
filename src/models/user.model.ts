export type UserType = 'admin' | 'vendor' | 'salesman' | 'broker' | 'custom';

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  user_type: UserType;
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateUserDTO {
  username: string;
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  user_type?: UserType;
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateUserDTO {
  username?: string;
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  user_type?: UserType;
  is_active?: boolean;
  updated_by?: string;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone: string | null;
  user_type: UserType;
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

export interface UserWithEntityResponse {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  user_type: UserType;
  is_active: boolean;
  entity_data: {
    type: string;
    data: any;
  } | null;
}

