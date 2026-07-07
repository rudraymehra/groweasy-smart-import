import { Router } from 'express';
import { loadEnv } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const env = loadEnv();
  res.json({
    ok: true,
    uptime_seconds: Math.round(process.uptime()),
    models: { mapping: env.MAPPING_MODEL, extraction: env.EXTRACTION_MODEL },
  });
});
