import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  isAppError,
} from '../src/errors.js';

describe('Error Architecture & Hierarchy', () => {
  it('correctly creates AppError with code and status code', () => {
    const error = new AppError('Resource missing', {
      code: 'RESOURCE_MISSING',
      statusCode: 404,
      details: { id: 'seat_123' },
    });

    expect(error.name).toBe('AppError');
    expect(error.code).toBe('RESOURCE_MISSING');
    expect(error.statusCode).toBe(404);
    expect(error.details).toEqual({ id: 'seat_123' });
    expect(isAppError(error)).toBe(true);
  });

  it('correctly instantiates domain subclasses', () => {
    const notFound = new NotFoundError('EventSeat', { seatId: '42' });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.code).toBe('NOT_FOUND');
    expect(notFound.message).toBe('EventSeat not found');

    const validation = new ValidationError('Seat count exceeds maximum limit');
    expect(validation.statusCode).toBe(400);
    expect(validation.code).toBe('VALIDATION_ERROR');

    const conflict = new ConflictError('Seat already held by another user');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.code).toBe('CONFLICT');
  });

  it('preserves error cause chain', () => {
    const originalError = new Error('Connection timed out');
    const appError = new AppError('Database operation failed', {
      code: 'DATABASE_TIMEOUT',
      statusCode: 504,
      cause: originalError,
    });

    expect(appError.cause).toBe(originalError);
  });
});
