import { Response, NextFunction } from 'express';
import { expenseDAO } from '../dao/expense.dao';
import { expenseLineDAO } from '../dao/expense-line.dao';
import { expenseOverheadDAO } from '../dao/expense-overhead.dao';
import { expenseEntityLinkDAO } from '../dao/expense-entity-link.dao';
import { expenseCategoryDAO } from '../dao/expense-category.dao';
import { expenseService, toExpenseResponse } from '../services/expense.service';
import { expenseLinkingService } from '../services/expense-linking.service';
import { ResponseHandler } from '../utils/response';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import {
  validate,
  uuidSchema,
  createExpenseSchema,
  updateExpenseSchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import {
  CreateExpenseDTO,
  UpdateExpenseDTO,
  ExpenseStatus,
  PayeeType,
} from '../models/expense.model';

export class ExpenseController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const expense_category_id = req.query.expense_category_id as string | undefined;
      const status = req.query.status as ExpenseStatus | undefined;
      const payee_type = req.query.payee_type as PayeeType | undefined;
      const payee_id = req.query.payee_id as string | undefined;
      const date_from = req.query.date_from as string | undefined;
      const date_to = req.query.date_to as string | undefined;
      const financial_year = req.query.financial_year as string | undefined;
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);

      const { rows, total } = await expenseDAO.findAll({
        expense_category_id,
        status,
        payee_type,
        payee_id,
        date_from,
        date_to,
        financial_year,
        search,
        limit,
        offset,
      });

      // Batch load related data
      const expenseIds = rows.map((e) => e.id);
      const categoryIds = [...new Set(rows.map((e) => e.expense_category_id))];

      const [linesByExpense, overheadsByExpense, linksByExpense, categories] = await Promise.all([
        expenseLineDAO.findByExpenseIds(expenseIds),
        expenseOverheadDAO.findByExpenseIds(expenseIds),
        expenseEntityLinkDAO.findByExpenseIds(expenseIds),
        Promise.all(categoryIds.map((id) => expenseCategoryDAO.findById(id))),
      ]);

      const categoryMap = new Map(categories.filter(Boolean).map((cat) => [cat!.id, cat!]));

      const responses = await Promise.all(
        rows.map((expense) => {
          const category = categoryMap.get(expense.expense_category_id);
          return toExpenseResponse(
            expense,
            linesByExpense.get(expense.id) || [],
            overheadsByExpense.get(expense.id) || [],
            linksByExpense.get(expense.id) || [],
            category?.name,
            category?.code
          );
        })
      );

      return ResponseHandler.success(res, toPaginatedResult(responses, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const expense = await expenseService.getExpenseById(id);
      return ResponseHandler.success(res, expense);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const validated = validate<CreateExpenseDTO>(createExpenseSchema, req.body);
      const data: CreateExpenseDTO = {
        ...validated,
        created_by: req.user?.userId,
      };

      const expense = await expenseService.createExpense(data);
      return ResponseHandler.created(res, expense, 'Expense created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const validated = validate<UpdateExpenseDTO>(updateExpenseSchema, req.body);
      const data: UpdateExpenseDTO = {
        ...validated,
        updated_by: req.user?.userId,
      };

      const expense = await expenseService.updateExpense(id, data);
      return ResponseHandler.success(res, expense, 'Expense updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      await expenseService.deleteExpense(id);
      return ResponseHandler.success(res, null, 'Expense deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { status } = req.body;

      if (!status || typeof status !== 'string') {
        return ResponseHandler.error(res, 'Status is required', 400);
      }

      const validStatuses: ExpenseStatus[] = ['draft', 'submitted', 'approved', 'paid', 'rejected'];
      if (!validStatuses.includes(status as ExpenseStatus)) {
        return ResponseHandler.error(
          res,
          `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          400
        );
      }

      const expense = await expenseService.updateStatus(id, status as ExpenseStatus);
      return ResponseHandler.success(res, expense, 'Expense status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async confirm(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const expense = await expenseService.confirmExpense(id);
      return ResponseHandler.success(res, expense, 'Expense confirmed successfully');
    } catch (error) {
      next(error);
    }
  }

  async markPaid(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      // Upload payment proof if file provided
      let paymentProofUrl = req.body.payment_proof_url;

      if (req.file) {
        validateFileSize(req.file.size, 10);
        validateFileType(req.file.mimetype, [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'application/pdf',
        ]);

        const uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.paymentSlipsFolder
        );
        paymentProofUrl = uploadResult.url;
      }

      const expense = await expenseService.markAsPaid(id, paymentProofUrl);
      return ResponseHandler.success(res, expense, 'Expense marked as paid successfully');
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const reason = req.body.reason as string | undefined;
      const expense = await expenseService.cancelExpense(id, reason);
      return ResponseHandler.success(res, expense, 'Expense cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAvailableEntities(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const entityType = req.query.entity_type as string;
      if (!entityType) {
        return ResponseHandler.error(res, 'entity_type is required', 400);
      }
      const godown_id = req.query.godown_id as string | undefined;
      const date_from = req.query.date_from as string | undefined;
      const date_to = req.query.date_to as string | undefined;
      const status = req.query.status as string | undefined;
      const transporter_id = req.query.transporter_id as string | undefined;

      const entities = await expenseLinkingService.getAvailableEntities(entityType, {
        godown_id,
        date_from,
        date_to,
        status,
        transporter_id,
      });

      return ResponseHandler.success(res, entities);
    } catch (error) {
      next(error);
    }
  }

  async uploadPaymentProof(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        return ResponseHandler.error(res, 'File is required', 400);
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'application/pdf',
      ]);

      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        appConfig.aws.s3.paymentSlipsFolder
      );

      const expense = await expenseDAO.updatePaymentProof(id, uploadResult.url);
      if (!expense) {
        return ResponseHandler.error(res, 'Expense not found', 404);
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Payment proof uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadBill(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        return ResponseHandler.error(res, 'File is required', 400);
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);

      const uploadResult = await uploadToS3(
        req.file.buffer,
        req.file.originalname,
        'documents'
      );

      const expense = await expenseDAO.updateBillPdf(id, uploadResult.url);
      if (!expense) {
        return ResponseHandler.error(res, 'Expense not found', 404);
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Bill uploaded successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const expenseController = new ExpenseController();
