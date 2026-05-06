import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { appConfig } from '../config/app.config';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Initialize S3 Client
const s3Client = new S3Client({
  region: appConfig.aws.region,
  credentials: {
    accessKeyId: appConfig.aws.accessKeyId,
    secretAccessKey: appConfig.aws.secretAccessKey,
  },
});

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
}

/**
 * Upload a file to S3
 * @param file - File buffer or stream
 * @param originalFilename - Original filename
 * @param folder - S3 folder path (default: business-cards)
 * @returns Upload result with URL, key, and bucket
 */
export async function uploadToS3(
  file: Buffer,
  originalFilename: string,
  folder: string = appConfig.aws.s3.businessCardsFolder
): Promise<UploadResult> {
  try {
    // Generate unique filename
    const fileExtension = path.extname(originalFilename);
    const uniqueFilename = `${uuidv4()}${fileExtension}`;
    const key = `${folder}/${uniqueFilename}`;

    // Determine content type based on file extension
    const contentType = getContentType(fileExtension);

    const uploadParams = {
      Bucket: appConfig.aws.s3.bucketName,
      Key: key,
      Body: file,
      ContentType: contentType,
      ACL: 'public-read' as const,
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    // Construct the public URL
    const url = `https://${appConfig.aws.s3.bucketName}.s3.${appConfig.aws.region}.amazonaws.com/${key}`;

    logger.info('File uploaded to S3', {
      key,
      bucket: appConfig.aws.s3.bucketName,
      url,
    });

    return {
      url,
      key,
      bucket: appConfig.aws.s3.bucketName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'Error';
    logger.error('S3 upload failed', { 
      error: { name: errorName, message: errorMessage },
      originalFilename 
    });
    throw new Error(`Failed to upload file to S3: ${errorMessage}`);
  }
}

/**
 * Delete a file from S3
 * @param key - S3 object key
 */
export async function deleteFromS3(key: string): Promise<void> {
  try {
    const deleteParams = {
      Bucket: appConfig.aws.s3.bucketName,
      Key: key,
    };

    const command = new DeleteObjectCommand(deleteParams);
    await s3Client.send(command);

    logger.info('File deleted from S3', { key });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'Error';
    logger.error('S3 deletion failed', { 
      error: { name: errorName, message: errorMessage },
      key 
    });
    throw new Error(`Failed to delete file from S3: ${errorMessage}`);
  }
}

/**
 * Extract S3 key from URL
 * @param url - Full S3 URL
 * @returns S3 key
 */
export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // Remove leading slash
    return urlObj.pathname.substring(1);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to extract key from URL', { 
      error: errorMessage,
      url 
    });
    return null;
  }
}

/**
 * Get content type based on file extension
 * @param extension - File extension
 * @returns Content type
 */
function getContentType(extension: string): string {
  const contentTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  return contentTypes[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * Validate file size
 * @param fileSize - File size in bytes
 * @param maxSizeMB - Maximum allowed size in MB (default: 5MB)
 * @returns True if valid, throws error otherwise
 */
export function validateFileSize(fileSize: number, maxSizeMB: number = 5): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (fileSize > maxSizeBytes) {
    throw new Error(`File size exceeds maximum allowed size of ${maxSizeMB}MB`);
  }
  return true;
}

/**
 * Strip parameters (e.g. charset) for reliable MIME comparison.
 */
export function normalizeMimeType(mimetype: string): string {
  return mimetype.split(';')[0].trim().toLowerCase();
}

/**
 * Validate file type
 * @param mimetype - File mimetype
 * @param allowedTypes - Array of allowed mimetypes (parameters ignored)
 * @returns True if valid, throws error otherwise
 */
export function validateFileType(mimetype: string, allowedTypes: string[]): boolean {
  const normalized = normalizeMimeType(mimetype);
  const allowed = allowedTypes.map((t) => normalizeMimeType(t));
  if (!allowed.includes(normalized)) {
    throw new Error(`File type ${normalized} is not allowed. Allowed types: ${allowed.join(', ')}`);
  }
  return true;
}

