import winston from 'winston';
import { appConfig } from '../config/app.config';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = appConfig.logging.filePath;
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Helper function to safely stringify objects with circular references
function safeStringify(obj: any, space?: number): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_key, value) => {
      // Skip circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      // Handle Error objects specially
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      return value;
    },
    space
  );
}

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? safeStringify(meta, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

export const logger = winston.createLogger({
  level: appConfig.logging.level,
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Always add console transport (remove in production if needed)
// This ensures we can see startup errors
logger.add(
  new winston.transports.Console({
    format: consoleFormat,
  })
);

export default logger;

