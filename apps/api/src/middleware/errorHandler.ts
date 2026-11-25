import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../logger.js';
import { isAppError } from '../errors.js';
import { ZodError } from 'zod';

interface ExpressErrorWithDetails {
  code?: string;
  statusCode?: number;
  details?: unknown;
  detail?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
}

export const errorHandler: ErrorRequestHandler = (
  err: ExpressErrorWithDetails,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response has already sent headers, delegate to default express handler
  if (res.headersSent) {
    return next(err);
  }

  // 1. AppError instances (domain errors)
  if (isAppError(err)) {
    const statusCode = err.statusCode ?? 500;
    logger.warn(
      {
        code: err.code,
        statusCode,
        details: err.details,
        path: req.originalUrl,
        method: req.method,
        cause: err.cause,
      },
      `[Domain Error] ${err.message}`
    );

    res.status(statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 2. Zod validation errors
  if (err instanceof ZodError) {
    logger.warn(
      {
        path: req.originalUrl,
        method: req.method,
        issues: err.issues,
      },
      '[Validation Error] Schema validation failed'
    );

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.format(),
      },
    });
    return;
  }

  // 3. PostgreSQL unique constraint violation (code 23505)
  if (err?.code === '23505') {
    logger.warn(
      {
        path: req.originalUrl,
        method: req.method,
        detail: err.detail,
      },
      '[Conflict] Database unique constraint violation'
    );

    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: err.detail || 'A record with these details already exists.',
      },
    });
    return;
  }

  // 4. Fallback: Unexpected internal server errors
  logger.error(
    {
      err,
      path: req.originalUrl,
      method: req.method,
      query: req.query,
      stack: err?.stack,
    },
    `[Internal Error] ${err?.message || 'Unknown server error'}`
  );

  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isProd ? 'Internal server error occurred' : err?.message || 'Internal server error',
    },
  });
};
