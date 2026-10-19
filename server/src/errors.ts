import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'The comparison payload is invalid.' });
    return;
  }
  if (isOversized(error)) {
    res.status(413).json({ error: 'The comparison payload is too large.' });
    return;
  }
  res.status(500).json({ error: 'The comparison service failed.' });
}

function isOversized(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { type?: unknown; status?: unknown };
  return record.type === 'entity.too.large' || record.status === 413;
}
