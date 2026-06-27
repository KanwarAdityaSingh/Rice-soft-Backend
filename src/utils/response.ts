import { Response, Request } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  /** Present when create succeeded but optional post-steps (e.g. bank verification) failed */
  verification_error?: string;
  /** Present when optional post-steps (e.g. bank verification) succeeded */
  verification_message?: string;
  /** True when bank account holder name does not match the KYC verification snapshot */
  bank_verification_flagged?: boolean;
  /** OpenAI similarity score when bank verified via llm_similarity */
  bank_name_similarity_score?: number;
  /** exact | llm_similarity */
  bank_verification_method?: 'exact' | 'llm_similarity';
  /** True when driver was created without a transport DOE from DL verification */
  transport_doe_not_found?: boolean;
  timestamp: string;
  isSessionValid?: boolean;
}

export type SuccessResponseExtras = Pick<
  ApiResponse,
  | 'verification_error'
  | 'verification_message'
  | 'bank_verification_flagged'
  | 'bank_name_similarity_score'
  | 'bank_verification_method'
  | 'transport_doe_not_found'
>;

export class ResponseHandler {
  static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode = 200,
    extras?: SuccessResponseExtras
  ): Response {
    const req = res.req as Request & { isSessionValid?: boolean };
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
      isSessionValid: req.isSessionValid !== undefined ? req.isSessionValid : true,
      ...extras,
    };
    return res.status(statusCode).json(response);
  }

  static created<T>(
    res: Response,
    data: T,
    message = 'Resource created successfully',
    extras?: SuccessResponseExtras
  ): Response {
    return this.success(res, data, message, 201, extras);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  static error(res: Response, error: string, statusCode = 500, message?: string): Response {
    const req = res.req as Request & { isSessionValid?: boolean };
    const response: ApiResponse = {
      success: false,
      message,
      error,
      timestamp: new Date().toISOString(),
      isSessionValid: req.isSessionValid !== undefined ? req.isSessionValid : true,
    };
    return res.status(statusCode).json(response);
  }
}


