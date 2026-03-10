export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code: string) {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(401, message, 'UNAUTHORIZED'); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, message, 'FORBIDDEN'); }
}

export class NotFoundError extends AppError {
  constructor(resource: string) { super(404, `${resource} not found`, 'NOT_FOUND'); }
}

export class BadRequestError extends AppError {
  constructor(message: string) { super(400, message, 'BAD_REQUEST'); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(409, message, 'CONFLICT'); }
}

export class InsufficientFundsError extends AppError {
  constructor() { super(400, 'Insufficient wallet balance', 'INSUFFICIENT_FUNDS'); }
}

export class SpendingLimitError extends AppError {
  constructor(limit: string) { super(400, `Spending limit exceeded: ${limit}`, 'SPENDING_LIMIT'); }
}
