import type { IncomingMessage } from 'node:http';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    // SSE connections stay open for minutes; logging them as requests is noise.
    ignore: (req: IncomingMessage) => req.url?.includes('/events') ?? false,
  },
});
