# Rice Soft Backend

A comprehensive Purchase Management System for rice trading firms that manages contracts, truck deliveries, weighbridge operations, financial calculations, and compliance reporting.

## Features

- **User Management**: Complete user authentication and authorization with role-based access control
- **Role-Based Permissions**: Six predefined roles (Admin, Salesman, Accountant, Warehouse Operator, Broker, Viewer)
- **JWT Authentication**: Secure token-based authentication
- **Audit Logging**: Comprehensive audit trail for all operations
- **RESTful API**: Well-structured REST API with proper error handling
- **Database Migrations**: SQL-based migration system
- **TypeScript**: Full type safety throughout the application

## Tech Stack

- **Node.js** (v18+)
- **TypeScript** (v5.3)
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **Winston** - Logging
- **Joi** - Validation
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing

## Project Structure

```
Rice-soft-Backend/
├── src/
│   ├── bin/
│   │   └── init.ts                 # Server initialization
│   ├── config/
│   │   ├── app.config.ts           # Application configuration
│   │   └── database.config.ts      # Database configuration
│   ├── controllers/
│   │   ├── auth.controller.ts      # Authentication controller
│   │   ├── user.controller.ts      # User management controller
│   │   └── role.controller.ts      # Role management controller
│   ├── dao/
│   │   ├── user.dao.ts             # User data access object
│   │   ├── role.dao.ts             # Role data access object
│   │   └── audit-log.dao.ts        # Audit log data access object
│   ├── database/
│   │   ├── connection.ts           # Database connection pool
│   │   └── migrations/
│   │       ├── 001_create_users_roles.sql
│   │       └── run-migrations.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts      # Authentication middleware
│   │   ├── error.middleware.ts     # Error handling middleware
│   │   ├── rate-limit.middleware.ts # Rate limiting
│   │   └── audit.middleware.ts     # Audit logging middleware
│   ├── models/
│   │   ├── user.model.ts           # User models and DTOs
│   │   ├── role.model.ts           # Role models and DTOs
│   │   └── audit-log.model.ts      # Audit log models
│   ├── routes/
│   │   ├── index.ts                # Main router
│   │   ├── auth.routes.ts          # Authentication routes
│   │   ├── user.routes.ts          # User routes
│   │   └── role.routes.ts          # Role routes
│   ├── utils/
│   │   ├── errors.ts               # Custom error classes
│   │   ├── response.ts             # Response handler
│   │   ├── jwt.ts                  # JWT utilities
│   │   ├── validators.ts           # Validation schemas
│   │   └── logger.ts               # Winston logger
│   └── app.ts                      # Express app setup
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd Rice-soft-Backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rice_soft_db
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Security
BCRYPT_ROUNDS=10
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs

# CORS
CORS_ORIGIN=http://localhost:3001

# API
API_PREFIX=/api/v1
```

4. **Create PostgreSQL database**

```bash
createdb rice_soft_db
```

5. **Run database migrations**

```bash
npm run migrate
```

6. **Create initial admin user**

```bash
npm run create-admin
```

This will create an admin user with:
- Username: `admin`
- Password: Set via `ADMIN_PASSWORD` environment variable (default: `Xk9#mP2@nQ7!vR4$wT8&aL5`)
  - Change this immediately after first login or set a custom password in `.env`

### Running the Application

**Development mode with auto-reload:**

```bash
npm run dev:watch
```

**Development mode:**

```bash
npm run dev
```

**Production mode:**

```bash
npm run build
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## API Documentation

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication Endpoints

#### Login
```
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "Xk9#mP2@nQ7!vR4$wT8&aL5"
}

Response:
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": "24h"
  }
}
```

#### Get Profile
```
GET /auth/profile
Authorization: Bearer <token>
```

#### Logout
```
POST /auth/logout
Authorization: Bearer <token>
```

### User Endpoints

All user endpoints require authentication.

#### Get All Users (Admin only)
```
GET /users
Authorization: Bearer <token>
```

#### Get User by ID
```
GET /users/:id
Authorization: Bearer <token>
```

#### Create User (Admin only)
```
POST /users
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "password123",
  "role_id": "uuid-here",
  "full_name": "John Doe",
  "phone": "+1234567890"
}
```

#### Update User
```
PUT /users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "full_name": "John Smith",
  "phone": "+1234567890"
}
```

#### Delete User (Admin only)
```
DELETE /users/:id
Authorization: Bearer <token>
```

### Role Endpoints

#### Get All Roles
```
GET /roles
Authorization: Bearer <token>
```

#### Get Role by ID
```
GET /roles/:id
Authorization: Bearer <token>
```

#### Create Role (Admin only)
```
POST /roles
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "custom_role",
  "description": "Custom role description",
  "permissions": {
    "contracts": ["read", "create"]
  }
}
```

#### Update Role (Admin only)
```
PUT /roles/:id
Authorization: Bearer <token>
```

#### Delete Role (Admin only)
```
DELETE /roles/:id
Authorization: Bearer <token>
```

### Health Check
```
GET /health

Response:
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345
}
```

## User Roles

1. **Admin** - Full system access
2. **Salesman** - Create contracts and lots, view purchases
3. **Accountant** - Manage purchases and payments, view contracts
4. **Warehouse Operator** - Manage lots and stock
5. **Broker** - View contracts, lots, and purchases
6. **Viewer** - Read-only access

## Error Handling

The API uses standard HTTP status codes and returns errors in the following format:

```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

Common status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error

## Security Features

- Password hashing with bcrypt
- JWT token-based authentication
- Role-based access control
- Rate limiting
- Helmet security headers
- CORS protection
- SQL injection protection (parameterized queries)
- Audit logging for all operations

## Logging

Logs are stored in the `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only

Log levels: error, warn, info, debug

## Scripts

- `npm run dev` - Run in development mode
- `npm run dev:watch` - Run with auto-reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run migrate` - Run database migrations
- `npm run create-admin` - Create initial admin user
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Development Guidelines

### Adding New Entities

1. Create model in `src/models/`
2. Create DAO in `src/dao/`
3. Create controller in `src/controllers/`
4. Create routes in `src/routes/`
5. Add routes to `src/routes/index.ts`
6. Create migration SQL file in `src/database/migrations/`

### Code Style

- Use TypeScript for type safety
- Follow ESLint rules
- Use Prettier for formatting
- Write descriptive variable and function names
- Add comments for complex logic
- Handle errors properly
- Use async/await for asynchronous operations

## Future Enhancements

- Contract (Sauda) management
- Lot (truck delivery) tracking
- Purchase (invoice) management
- Payment processing
- Stock management
- E-way bill integration
- Document management with OCR
- Reporting and analytics
- Real-time notifications
- Export to Excel/PDF

## License

ISC

## Support

For issues and questions, please create an issue in the repository.


