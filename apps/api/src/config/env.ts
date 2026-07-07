import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required — see .env.example'),
  PORT: z.coerce.number().int().positive().default(4000),
  ALLOWED_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  EXTRACTION_MODEL: z.string().default('claude-haiku-4-5'),
  MAPPING_MODEL: z.string().default('claude-sonnet-5'),
  BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(30),
  MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(100).default(20),
  NODE_ENV: z.string().default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validates process.env once at boot; exits with an actionable message on failure. */
export function loadEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`\nInvalid environment configuration:\n${issues}\n`);
    process.exit(1);
  }
  cached = result.data;
  return cached;
}
