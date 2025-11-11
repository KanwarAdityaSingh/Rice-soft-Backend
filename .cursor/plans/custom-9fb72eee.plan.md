<!-- 9fb72eee-4197-469a-93b2-5f28a4fae439 f2b99ee5-5081-46ea-9e27-0a6aabd5068b -->
# Implement custom-user permissions returned at login

### What we'll add

- **Data**: `users.custom_permissions JSONB` storing CRUD flags per entity for `custom` users.
- **Model types**: `CustomPermissions` TS type; extend `User`, `LoginResponse` to include permissions.
- **Login response**: Compute `permissions` at login and include alongside `token`.
- **Admin API**: Endpoint to upsert a custom user's permissions.
- **No per-API auth checks**: We will not add middleware/validators for permissions.

### DB migration

- File: `src/database/migrations/010_add_custom_permissions.sql`
- Adds a nullable JSONB column:
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_permissions JSONB;
-- Optional: default empty object for new custom users
UPDATE users SET custom_permissions = '{}'::jsonb WHERE user_type = 'custom' AND custom_permissions IS NULL;
```


### TypeScript models

- File: `src/models/user.model.ts`
  - Add:
```ts
export type EntityKey = 'salesman' | 'broker' | 'vendor' | 'leads' | 'riceCode';
export interface CrudPerm { create: boolean; read: boolean; update: boolean; delete: boolean }
export type CustomPermissions = Partial<Record<EntityKey, CrudPerm>>;
```

  - Extend interfaces:
```ts
export interface User { /* existing fields */; custom_permissions?: CustomPermissions | null }
export interface LoginResponse { /* existing fields */; permissions: CustomPermissions | null }
```


### DAO (read/write permissions)

- File: `src/dao/user.dao.ts`
  - Update SELECTs to include `custom_permissions`.
  - Add methods to get/update `custom_permissions` for a user.

### Compute permissions at login

- File: `src/controllers/auth.controller.ts`
  - Inject a small helper `buildPermissionsForUser(user)`:
    - If `user.user_type === 'custom'`: return `user.custom_permissions || {}`
    - Else: return `null` (frontend can use `user_type`), unless you prefer defaults.
  - Include `permissions` in `LoginResponse`.
- Reference injection point:
```93:116:src/controllers/auth.controller.ts
      // Generate JWT token
      const token = JWTService.generateToken({
        userId: userInfo.id,
        username: userInfo.username,
      });

      const userResponse: UserResponse = { /* ...existing... */ };

      const response: LoginResponse = {
        user: userResponse,
        token,
        expires_in: '24h',
        permissions: /* <- new: compute here */
      };
```


### Admin API to set permissions

- Route: `PATCH /api/v1/users/:id/permissions`
- Files: `src/routes/user.routes.ts`, `src/controllers/user.controller.ts`, `src/dao/user.dao.ts`
- Validates body shape lightly and updates `users.custom_permissions`.

### Frontend consumption

- On successful login, store `permissions` next to the access token and user info; check CRUD flags to enable/disable UI actions per entity.

### Notes

- If you later want backend enforcement, we can add an optional middleware that reads the same shape.
- We can also include `permissions` inside JWT as a claim, but for now it will be in the login JSON payload only.

### To-dos

- [ ] Add users.custom_permissions JSONB migration
- [ ] Add CustomPermissions, extend User and LoginResponse types
- [ ] Select custom_permissions in user.dao and add update method
- [ ] Compute permissions in login and return in response
- [ ] Add PATCH endpoint to update a user’s custom permissions
- [ ] Document response shape and example; add minimal validation