import { ConflictError } from './errors';

export type EntityEmailModule = 'sales party' | 'vendor' | 'transporter';

interface EmailConflictEntity {
  id: string;
  business_name: string;
}

export function buildEntityEmailConflictMessage(
  module: EntityEmailModule,
  email: string,
  entityName: string
): string {
  return `Email already exists on ${module} "${entityName}" (${email})`;
}

/** Per-module email uniqueness with a descriptive conflict message. */
export async function assertModuleEmailAvailable(
  email: string | null | undefined,
  module: EntityEmailModule,
  findByEmail: (email: string) => Promise<EmailConflictEntity | null>,
  excludeId?: string
): Promise<void> {
  const trimmed = email?.trim();
  if (!trimmed) {
    return;
  }

  const existing = await findByEmail(trimmed);
  if (!existing) {
    return;
  }
  if (excludeId && existing.id === excludeId) {
    return;
  }

  throw new ConflictError(
    buildEntityEmailConflictMessage(module, trimmed, existing.business_name)
  );
}
