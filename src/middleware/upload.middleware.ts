import multer from 'multer';
import { Request } from 'express';

// Configure multer to store files in memory
const storage = multer.memoryStorage();

// File filter to accept only images
const imageFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept images only
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF)'));
  }
};

const licenseOcrMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

const licenseOcrFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (licenseOcrMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, or PDF files are allowed for licence OCR'));
  }
};

// Create multer upload instance for business cards
export const businessCardUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: imageFileFilter,
});

// Generic file upload for other types
export const documentUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/** Surepass driving-licence OCR — front required, back optional. */
export const licenseOcrUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: licenseOcrFileFilter,
}).fields([
  { name: 'front', maxCount: 1 },
  { name: 'back', maxCount: 1 },
]);

/** Surepass document OCR (GST, PAN, Aadhaar, vehicle RC) — single file field. */
export const documentOcrUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: licenseOcrFileFilter,
}).single('file');

