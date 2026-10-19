import { ArgumentsHost, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ApiExceptionFilter } from '../src/core/api-exception.filter';
import { endOfMonth, monthPrefix, monthWindow } from '../src/core/period';
import { toSafeMinor } from '../src/core/money';

function prismaKnownError(code: string): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError('driver message that must never leak', { code, clientVersion: '6.19.3' });
}

function capture(filter: ApiExceptionFilter, exception: unknown): { status: number; body: { error: { code: string; message: string; requestId: string } } } {
  const response = {
    locals: { requestId: 'req_test' },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    statusCode: 0,
    json(payload: unknown) {
      response.payload = payload;
      return response;
    },
    payload: undefined as unknown,
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ header: () => undefined }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  filter.catch(exception, host);
  return { status: response.statusCode, body: response.payload as { error: { code: string; message: string; requestId: string } } };
}

describe('F-019 — calendar month window', () => {
  it('uses the real last day of the month', () => {
    // The old `${prefix}-31` bound rolled 2026-02-31 over to 2026-03-03.
    expect(endOfMonth(2026, 2)).toBe('2026-02-28');
    expect(endOfMonth(2024, 2)).toBe('2024-02-29');
    expect(endOfMonth(2026, 4)).toBe('2026-04-30');
    expect(endOfMonth(2026, 7)).toBe('2026-07-31');
    expect(endOfMonth(2026, 12)).toBe('2026-12-31');
  });

  it('builds inclusive bounds and the month prefix', () => {
    expect(monthWindow(2026, 2)).toEqual({ prefix: '2026-02', from: '2026-02-01', to: '2026-02-28' });
    expect(monthPrefix(2026, 8)).toBe('2026-08');
  });

  it('keeps a March row out of the February window', () => {
    const february = monthWindow(2026, 2);
    const marchRow = '2026-03-01';
    expect(marchRow >= february.from && marchRow <= february.to).toBe(false);
  });
});

describe('Q-001 — minor-unit overflow guard', () => {
  it('accepts safe integers', () => {
    expect(toSafeMinor(1500)).toBe(1500n);
    expect(toSafeMinor(Number.MAX_SAFE_INTEGER)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });

  it('rejects values beyond the safe integer range with 422 INVALID_AMOUNT', () => {
    for (const unsafe of [Number.MAX_SAFE_INTEGER + 1, 2 ** 60, Number.POSITIVE_INFINITY, Number.NaN, 1.5]) {
      try {
        toSafeMinor(unsafe);
        throw new Error(`expected toSafeMinor(${String(unsafe)}) to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'INVALID_AMOUNT' });
      }
    }
  });
});

describe('R-001 — Prisma errors are normalised, never leaked', () => {
  const filter = new ApiExceptionFilter();

  it('maps a unique-constraint violation to 409 DUPLICATE_REQUEST', () => {
    const result = capture(filter, prismaKnownError('P2002'));
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('DUPLICATE_REQUEST');
    expect(result.body.error.message).not.toContain('driver message');
  });

  it('maps a missing record to 404 and an unreachable database to 503', () => {
    expect(capture(filter, prismaKnownError('P2025')).body.error.code).toBe('NOT_FOUND');
    expect(capture(filter, prismaKnownError('P2003')).status).toBe(404);

    const unavailable = capture(filter, prismaKnownError('P1001'));
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe('SERVICE_UNAVAILABLE');

    const init = capture(filter, new PrismaClientInitializationError('cannot reach database', '6.19.3'));
    expect(init.status).toBe(503);
    expect(init.body.error.message).not.toContain('cannot reach database');
  });

  it('leaves HttpExceptions untouched including their codes', () => {
    expect(capture(filter, new ConflictException({ code: 'BUDGET_ALREADY_EXISTS' })).body.error.code).toBe('BUDGET_ALREADY_EXISTS');
    expect(capture(filter, new NotFoundException({ code: 'ACCOUNT_NOT_FOUND' })).body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});