import { db } from '../database/connection';
import { userDAO } from '../dao/user.dao';
import { User, UserType } from '../models/user.model';
import { ConflictError } from './errors';

type EntityUserType = Extract<UserType, 'vendor' | 'broker' | 'salesman'>;

export interface ResolveEntityUserParams {
  email: string;
  fullName: string;
  phone?: string;
  userType: EntityUserType;
  isActive: boolean;
  createdBy?: string;
  entityLabel: string;
}

async function findExistingEntityLink(userId: string): Promise<string | null> {
  const result = await db.query<{ entity: string }>(
    `
      SELECT entity FROM (
        SELECT 'vendor' AS entity FROM vendors WHERE user_id = $1
        UNION ALL
        SELECT 'broker' FROM brokers WHERE user_id = $1
        UNION ALL
        SELECT 'salesman' FROM salesmen WHERE user_id = $1
      ) t
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0]?.entity ?? null;
}

function baseUsernameFromName(fullName: string): string {
  return fullName
    .toLowerCase()
    .split(' ')[0]
    .replace(/[^a-z0-9]/g, '');
}

async function allocateUsername(fullName: string): Promise<string> {
  const baseUsername = baseUsernameFromName(fullName);
  let username = baseUsername;
  let counter = 1;
  while (await userDAO.usernameExists(username)) {
    username = `${baseUsername}${counter}`;
    counter++;
  }
  return username;
}

export async function resolveOrCreateEntityUser(
  params: ResolveEntityUserParams
): Promise<User> {
  const email = params.email.trim();
  const existingUser = await userDAO.findByEmail(email);

  if (existingUser) {
    const linkedEntity = await findExistingEntityLink(existingUser.id);
    if (linkedEntity) {
      throw new ConflictError(`Email is already linked to an existing ${linkedEntity}`);
    }

    if (existingUser.user_type !== params.userType) {
      await userDAO.update(existingUser.id, {
        user_type: params.userType,
        updated_by: params.createdBy,
      });
    }

    return existingUser;
  }

  try {
    return await userDAO.create({
      username: await allocateUsername(params.fullName),
      email,
      password: 'defaultPassword123',
      full_name: params.fullName,
      phone: params.phone,
      user_type: params.userType,
      is_active: params.isActive,
      created_by: params.createdBy,
    });
  } catch (userError) {
    console.error('User creation failed:', userError);
    throw new ConflictError(`Failed to create user account for ${params.entityLabel}`);
  }
}

export { allocateUsername };
