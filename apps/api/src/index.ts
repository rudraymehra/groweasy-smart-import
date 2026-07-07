import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './middleware/requestLogger.js';

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, mapping: env.MAPPING_MODEL, extraction: env.EXTRACTION_MODEL },
    `GrowEasy Smart Import API listening on :${env.PORT}`,
  );
});
