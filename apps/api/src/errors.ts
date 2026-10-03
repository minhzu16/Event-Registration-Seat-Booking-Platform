export interface AppErrorOptions {
  code: string;
  statusCode?: number;
  details?: any;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, options: AppErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, details?: any) {
    super(`${resource} not found`, {
      code: 'NOT_FOUND',
      statusCode: 404,
      details,
    });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, {
      code: 'CONFLICT',
      statusCode: 409,
      details,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', details?: any) {
    super(message, {
      code: 'UNAUTHORIZED',
      statusCode: 401,
      details,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', details?: any) {
    super(message, {
      code: 'FORBIDDEN',
      statusCode: 403,
      details,
    });
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: 'DATABASE_ERROR',
      statusCode: 500,
      cause,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
