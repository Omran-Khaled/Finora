import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
} from "@prisma/client/runtime/library";
import { Request, Response } from "express";
import { REQUEST_ID_HEADER } from "./request-id.middleware";

interface ErrorResponse {
  code?: string;
  message?: string | string[];
  error?: string;
}

interface NormalizedError {
  status: number;
  code: string;
  message: string;
}

/**
 * Prisma failures mapped onto the documented error contract (F-017 / R-001).
 *
 * Without this, a unique-constraint violation or an unreachable database bubbled
 * up as `500 VALIDATION_ERROR` carrying the raw driver message. Each class of
 * driver failure now has a stable status/code, and the driver text is never
 * forwarded to the client.
 */
const PRISMA_ERROR_MAP: Record<string, NormalizedError> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    code: "DUPLICATE_REQUEST",
    message: "A record with these values already exists.",
  },
  P2003: {
    status: HttpStatus.NOT_FOUND,
    code: "NOT_FOUND",
    message: "A referenced record does not exist.",
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    code: "NOT_FOUND",
    message: "The requested record does not exist.",
  },
  P1001: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: "SERVICE_UNAVAILABLE",
    message: "The database is unreachable. Please try again later.",
  },
  P1002: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: "SERVICE_UNAVAILABLE",
    message: "The database connection timed out. Please try again later.",
  },
};

function normalizePrismaError(exception: unknown): NormalizedError | null {
  if (exception instanceof PrismaClientKnownRequestError) {
    return (
      PRISMA_ERROR_MAP[exception.code] ?? {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      }
    );
  }
  if (exception instanceof PrismaClientInitializationError) {
    return PRISMA_ERROR_MAP.P1001;
  }
  return null;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId =
      response.locals.requestId ??
      request.header(REQUEST_ID_HEADER) ??
      "req_unknown";

    const prismaError = normalizePrismaError(exception);
    if (prismaError) {
      response
        .status(prismaError.status)
        .json({
          error: {
            code: prismaError.code,
            message: prismaError.message,
            requestId,
          },
        });
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const details =
      typeof payload === "object" && payload !== null
        ? (payload as ErrorResponse)
        : {};
    const message = Array.isArray(details.message)
      ? details.message.join("; ")
      : (details.message ?? "Internal server error.");
    const code = details.code ?? (status >= HttpStatus.INTERNAL_SERVER_ERROR ? "INTERNAL_ERROR" : "VALIDATION_ERROR");

    response.status(status).json({ error: { code, message, requestId } });
  }
}
