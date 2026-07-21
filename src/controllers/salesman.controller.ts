import { Response, NextFunction } from 'express';
import { salesmanDAO } from '../dao/salesman.dao';
import { userDAO } from '../dao/user.dao';
import { salesmanService } from '../services/salesman.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createSalesmanSchema,
  updateSalesmanSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  UnauthorizedError,
} from '../utils/errors';
import {
  CreateSalesmanDTO,
  UpdateSalesmanDTO,
  Salesman,
  SalesmanResponse,
  SalesmanSalaryHistoryResponse,
  BankDetails,
} from '../models/salesman.model';
import { SalesmanDetail } from '../services/salesman.service';
import { SALESMAN_COMMISSION_TYPE_OPTIONS } from '../constants/salesman-commission-types';
import { AuthRequest } from '../middleware/auth.middleware';
import { resolveOrCreateEntityUser, allocateUsername } from '../utils/resolve-entity-user';
import { parseEntityKycDetails } from '../utils/kyc-verification';
import { applyBankVerificationFromSnapshot } from '../utils/apply-bank-verification-from-snapshot';
import {
  isBankVerificationSuccess,
  bankVerificationSuccessExtras,
} from '../utils/bank-verification-response';

const LENIENT_BANK_VERIFY_FAIL_MESSAGE =
  'Salesman created but bank account holder name does not match the verification snapshot.';

const LENIENT_BANK_VERIFY_FAIL_MESSAGE_UPDATE =
  'Salesman updated but bank account holder name does not match the verification snapshot.';

function toDateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toResponse(
  salesman: Salesman | SalesmanDetail,
  options?: { includeRelations?: boolean }
): SalesmanResponse {
  const includeRelations = options?.includeRelations === true;
  const detail = salesman as SalesmanDetail;
  return {
    id: salesman.id,
    salesperson_code: salesman.salesperson_code,
    name: salesman.name,
    phone: salesman.phone,
    alternate_phone: salesman.alternate_phone ?? null,
    email: salesman.email,
    date_of_birth: toDateString(salesman.date_of_birth),
    date_of_joining: toDateString(salesman.date_of_joining),
    designation: salesman.designation ?? null,
    aadhar_number: salesman.aadhar_number ?? null,
    pan_number: salesman.pan_number ?? null,
    address: salesman.address || { street: '', city: '', state: '', pincode: '', country: '' },
    bank_details: salesman.bank_details,
    bank_details_verified_at: salesman.bank_details_verified_at?.toISOString?.()
      ?? (salesman.bank_details_verified_at
        ? String(salesman.bank_details_verified_at)
        : null),
    bank_details_verified_by: salesman.bank_details_verified_by ?? null,
    bank_verification_error: salesman.bank_verification_error ?? null,
    kyc_verification_details: parseEntityKycDetails(salesman.kyc_verification_details),
    is_verified: salesman.is_verified,
    verified_at: salesman.verified_at?.toISOString?.()
      ?? (salesman.verified_at ? String(salesman.verified_at) : null),
    salary_type: salesman.salary_type ?? null,
    basic_salary: salesman.basic_salary ?? null,
    salary_effective_from: toDateString(salesman.salary_effective_from),
    commission_types: Array.isArray(salesman.commission_types) ? salesman.commission_types : [],
    ...(includeRelations
      ? {
          assigned_areas: detail.assigned_areas ?? [],
          customer_allocations: detail.customer_allocations ?? [],
        }
      : {}),
    is_active: salesman.is_active,
    user_id: salesman.user_id,
    created_at:
      salesman.created_at instanceof Date
        ? salesman.created_at.toISOString()
        : String(salesman.created_at),
    updated_at:
      salesman.updated_at instanceof Date
        ? salesman.updated_at.toISOString()
        : String(salesman.updated_at),
  };
}

async function tryVerifyBankAfterSave(
  salesmanId: string,
  bankDetails: BankDetails,
  kycVerificationDetails: ReturnType<typeof parseEntityKycDetails>,
  userId: string | undefined
) {
  return applyBankVerificationFromSnapshot({
    bankDetails,
    kycVerificationDetails,
    userId,
    markVerified: async (verifiedBy) => {
      await salesmanDAO.markBankDetailsVerified(salesmanId, verifiedBy);
    },
    setVerificationError: async (message) => {
      await salesmanDAO.setBankVerificationError(salesmanId, message);
    },
  });
}

export class SalesmanController {
  async getCommissionTypes(
    _req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      return ResponseHandler.success(res, SALESMAN_COMMISSION_TYPE_OPTIONS);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const salesmen = await salesmanService.getAllSalesmen(includeInactive);
      return ResponseHandler.success(res, salesmen.map((s) => toResponse(s)));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const salesman = await salesmanService.getSalesmanById(id);
      return ResponseHandler.success(res, toResponse(salesman, { includeRelations: true }));
    } catch (error) {
      next(error);
    }
  }

  async getSalaryHistory(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const history = await salesmanService.getSalaryHistory(id);
      const payload: SalesmanSalaryHistoryResponse[] = history.map((row) => ({
        id: row.id,
        salesman_id: row.salesman_id,
        salary_type: row.salary_type,
        basic_salary: row.basic_salary,
        effective_from: toDateString(row.effective_from)!,
        created_at:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
        created_by: row.created_by,
      }));
      return ResponseHandler.success(res, payload);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salesmanData = validate<CreateSalesmanDTO>(createSalesmanSchema, req.body);
      const verifyBank = salesmanData.verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }
      if (verifyBank && !salesmanData.kyc_verification_details?.bank) {
        throw new ValidationError(
          'verify_bank requires kyc_verification_details.bank from a prior GET /api/v1/kyc/bank/verify call'
        );
      }

      if (salesmanData.email) {
        const emailExists = await salesmanDAO.emailExists(salesmanData.email);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      let user;
      if (salesmanData.email) {
        user = await resolveOrCreateEntityUser({
          email: salesmanData.email,
          fullName: salesmanData.name,
          phone: salesmanData.phone,
          userType: 'salesman',
          isActive: salesmanData.is_active !== undefined ? salesmanData.is_active : true,
          createdBy: req.user?.userId,
          entityLabel: 'salesman',
        });
      } else {
        const username = await allocateUsername(salesmanData.name);
        try {
          user = await userDAO.create({
            username,
            password: 'defaultPassword123',
            full_name: salesmanData.name,
            phone: salesmanData.phone,
            user_type: 'salesman',
            is_active: salesmanData.is_active !== undefined ? salesmanData.is_active : true,
            created_by: req.user?.userId,
          });
        } catch (userError) {
          console.error('User creation failed:', userError);
          throw new ConflictError('Failed to create user account for salesman');
        }
      }

      const salesman = await salesmanService.createSalesman({
        ...salesmanData,
        user_id: user.id,
        created_by: req.user?.userId,
      });

      let bankFlagged = false;
      let bankVerifyResult: Awaited<ReturnType<typeof tryVerifyBankAfterSave>> | null = null;
      if (verifyBank && salesmanData.bank_details) {
        bankVerifyResult = await tryVerifyBankAfterSave(
          salesman.id,
          salesmanData.bank_details,
          parseEntityKycDetails(
            salesmanData.kyc_verification_details ?? salesman.kyc_verification_details
          ),
          req.user?.userId
        );
        bankFlagged = !isBankVerificationSuccess(bankVerifyResult);
      }

      const refreshed = await salesmanService.getSalesmanById(salesman.id);
      const response = toResponse(refreshed, { includeRelations: true });

      if (bankFlagged && bankVerifyResult) {
        return ResponseHandler.created(
          res,
          response,
          LENIENT_BANK_VERIFY_FAIL_MESSAGE,
          {
            verification_error: bankVerifyResult.message,
            bank_verification_flagged: true,
          }
        );
      }

      if (bankVerifyResult && isBankVerificationSuccess(bankVerifyResult)) {
        return ResponseHandler.created(
          res,
          response,
          'Salesman created successfully',
          bankVerificationSuccessExtras(bankVerifyResult)
        );
      }

      return ResponseHandler.created(res, response, 'Salesman created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const salesmanData = validate<UpdateSalesmanDTO>(updateSalesmanSchema, req.body);
      const verifyBank = salesmanData.verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }

      const existing = await salesmanDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Salesman not found');
      }

      const kycForVerify =
        salesmanData.kyc_verification_details?.bank != null
          ? parseEntityKycDetails({
              ...parseEntityKycDetails(existing.kyc_verification_details),
              ...salesmanData.kyc_verification_details,
            })
          : parseEntityKycDetails(existing.kyc_verification_details);

      if (verifyBank && !kycForVerify.bank) {
        throw new ValidationError(
          'verify_bank requires kyc_verification_details.bank from a prior GET /api/v1/kyc/bank/verify call'
        );
      }

      if (req.user) {
        salesmanData.updated_by = req.user.userId;
      }

      const salesman = await salesmanService.updateSalesman(id, salesmanData);

      let bankFlagged = false;
      let bankVerifyResult: Awaited<ReturnType<typeof tryVerifyBankAfterSave>> | null = null;
      const bankDetails = salesmanData.bank_details ?? salesman.bank_details;
      if (verifyBank && bankDetails) {
        bankVerifyResult = await tryVerifyBankAfterSave(
          id,
          bankDetails,
          kycForVerify,
          req.user?.userId
        );
        bankFlagged = !isBankVerificationSuccess(bankVerifyResult);
      }

      const refreshed = await salesmanService.getSalesmanById(id);
      const response = toResponse(refreshed, { includeRelations: true });

      if (bankFlagged && bankVerifyResult) {
        return ResponseHandler.success(
          res,
          response,
          LENIENT_BANK_VERIFY_FAIL_MESSAGE_UPDATE,
          200,
          {
            verification_error: bankVerifyResult.message,
            bank_verification_flagged: true,
          }
        );
      }

      if (bankVerifyResult && isBankVerificationSuccess(bankVerifyResult)) {
        return ResponseHandler.success(
          res,
          response,
          'Salesman updated successfully',
          200,
          bankVerificationSuccessExtras(bankVerifyResult)
        );
      }

      return ResponseHandler.success(res, response, 'Salesman updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async confirmBankVerification(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      if (!req.user?.userId) {
        throw new UnauthorizedError('Authentication required');
      }

      const salesman = await salesmanDAO.findById(id);
      if (!salesman) {
        throw new NotFoundError('Salesman not found');
      }

      if (!salesman.bank_details?.account_holder_name?.trim()) {
        throw new ValidationError(
          'Salesman must have account_holder_name in bank_details before confirmation'
        );
      }

      const verifyResult = await tryVerifyBankAfterSave(
        id,
        salesman.bank_details,
        parseEntityKycDetails(salesman.kyc_verification_details),
        req.user.userId
      );

      const updated = await salesmanDAO.findById(id);
      if (!updated) {
        throw new NotFoundError('Salesman not found');
      }

      if (!isBankVerificationSuccess(verifyResult)) {
        return ResponseHandler.success(
          res,
          toResponse(updated),
          LENIENT_BANK_VERIFY_FAIL_MESSAGE_UPDATE,
          200,
          { verification_error: verifyResult.message, bank_verification_flagged: true }
        );
      }

      return ResponseHandler.success(
        res,
        toResponse(updated),
        'Bank details verified and saved',
        200,
        bankVerificationSuccessExtras(verifyResult)
      );
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      await salesmanService.deleteSalesman(id);
      return ResponseHandler.success(res, null, 'Salesman deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const salesmanController = new SalesmanController();
