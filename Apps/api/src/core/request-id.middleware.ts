import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = request.header(REQUEST_ID_HEADER) ?? `req_${randomUUID()}`;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.locals.requestId = requestId;
    next();
  }
}
