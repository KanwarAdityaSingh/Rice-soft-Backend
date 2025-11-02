# Rice Soft Backend - Setup Guide

## Quick Start

Follow these steps to get the Rice Soft Backend up and running:

### 1. Prerequisites

Ensure you have the following installed:
- Node.js (v18+): `node --version`
- PostgreSQL (v12+): `psql --version`
- npm (v9+): `npm --version`

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the project root:

```bash
# Copy the content below to your .env file

NODE_ENV=development
PORT=3000
HOST=localhost

DB_HOST=localhost
DB_PORT=5432
DB_NAME=rice_soft_db
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000

JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

BCRYPT_ROUNDS=10
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

LOG_LEVEL=info
LOG_FILE_PATH=./logs

CORS_ORIGIN=http://localhost:3001

API_PREFIX=/api/v1
```

**Important:** Update the following values:
- `DB_PASSWORD`: Your PostgreSQL password
- `JWT_SECRET`: A long, random, secure string

### 4. Create Database

```bash
# Using PostgreSQL command line
createdb rice_soft_db

# Or using psql
psql -U postgres
CREATE DATABASE rice_soft_db;
\q
```

### 5. Run Database Migrations

```bash
npm run migrate
```

This will:
- Create the `roles` table with default roles
- Create the `users` table
- Create the `audit_logs` table
- Set up database triggers and functions

### 6. Create Admin User

```bash
npm run create-admin
```

This creates an admin user with default credentials:
- **Username:** `admin`
- **Password:** Set via `ADMIN_PASSWORD` environment variable (default: `Xk9#mP2@nQ7!vR4$wT8&aL5`)

**⚠️ IMPORTANT:** Change this password after your first login or set a custom password in `.env`!

### 7. Start the Server

**Development mode with auto-reload:**
```bash
npm run dev:watch
```

**Regular development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

### 8. Verify Installation

Test the health endpoint:
```bash
curl http://localhost:3000/api/v1/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 1.234
}
```

### 9. Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Xk9#mP2@nQ7!vR4$wT8&aL5"
  }'
```

You should receive a JWT token in the response.

## Troubleshooting

### Database Connection Issues

**Error:** `Database connection failed`

**Solutions:**
1. Verify PostgreSQL is running: `pg_isready`
2. Check database exists: `psql -l | grep rice_soft_db`
3. Verify credentials in `.env` file
4. Check PostgreSQL is accepting connections on port 5432

### Port Already in Use

**Error:** `EADDRINUSE: address already in use`

**Solutions:**
1. Change `PORT` in `.env` file
2. Kill process using port 3000: `lsof -ti:3000 | xargs kill`

### Migration Errors

**Error:** `Migration failed`

**Solutions:**
1. Check database exists
2. Verify database user has proper permissions
3. Drop and recreate database if needed:
   ```bash
   dropdb rice_soft_db
   createdb rice_soft_db
   npm run migrate
   ```

### Module Not Found

**Error:** `Cannot find module`

**Solutions:**
1. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
2. Clear npm cache: `npm cache clean --force`

## Default Roles

The system comes with 6 predefined roles:

1. **Admin** - Full system access
   - Permissions: All operations on all resources

2. **Salesman** - Sales operations
   - Permissions: Create/read/update contracts and lots, read purchases

3. **Accountant** - Financial operations
   - Permissions: Full access to purchases and payments, read contracts

4. **Warehouse Operator** - Inventory operations
   - Permissions: Create/read/update lots and stock

5. **Broker** - View-only for business operations
   - Permissions: Read contracts, lots, and purchases

6. **Viewer** - Read-only access
   - Permissions: Read all resources

## Next Steps

After successful setup:

1. **Change Admin Password**
   ```bash
   # Login and get token, then:
   curl -X PUT http://localhost:3000/api/v1/users/{admin-user-id} \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"password": "new_secure_password"}'
   ```

2. **Create Additional Users**
   - Use the `/api/v1/users` endpoint to create users for your team

3. **Explore API Documentation**
   - Check README.md for detailed API documentation
   - Test endpoints with Postman or curl

4. **Configure Production Settings**
   - Update `NODE_ENV=production`
   - Set strong `JWT_SECRET`
   - Configure proper CORS origins
   - Set up SSL/TLS
   - Configure logging levels

## Development Workflow

1. Create a new branch for your feature
2. Make changes to the code
3. Test your changes: `npm run dev:watch`
4. Run linter: `npm run lint`
5. Format code: `npm run format`
6. Build for production: `npm run build`

## Project Structure Overview

```
src/
├── bin/init.ts          → Server initialization
├── app.ts               → Express app setup
├── config/              → Configuration files
├── controllers/         → Business logic
├── dao/                 → Database access layer
├── database/            → Database connections & migrations
├── middleware/          → Express middleware
├── models/              → TypeScript models & DTOs
├── routes/              → API routes
├── scripts/             → Utility scripts
└── utils/               → Helper functions
```

## Support

If you encounter any issues:
1. Check the logs in `logs/` directory
2. Review error messages carefully
3. Consult the README.md for API documentation
4. Create an issue in the repository

Happy coding! 🚀


