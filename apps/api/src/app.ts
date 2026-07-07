import cors from 'cors';
import express, { type Express } from 'express';
import { loadEnv } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { healthRouter } from './routes/health.js';
import { importsRouter } from './routes/imports.js';

/** App factory — keeps the server testable without binding a port. */
export function createApp(): Express {
  const env = loadEnv();
  const app = express();

  app.use(requestLogger);
  app.use(
    cors({
      origin: env.ALLOWED_ORIGIN.split(',').map((o) => o.trim()),
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/health', healthRouter);
  app.use('/api/imports', importsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
