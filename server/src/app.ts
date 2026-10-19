import cors from 'cors';
import express from 'express';
import { compareSnapshots } from '../../src/compare/compareSnapshots';
import { errorMiddleware } from './errors';
import { compareRequestSchema } from './schema';

export function createApp(allowedOrigin: string) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    cors({
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/compare', (req, res, next) => {
    try {
      const body = compareRequestSchema.parse(req.body);
      res.json(compareSnapshots(body.left, body.right));
    } catch (error) {
      next(error);
    }
  });

  app.use(errorMiddleware);
  return app;
}
