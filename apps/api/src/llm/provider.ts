import type { z } from 'zod';

export interface GenerateStructuredOptions<T> {
  model: string;
  system: string;
  user: string;
  /** Zod schema the output MUST validate against (enforced via constrained decoding). */
  schema: z.ZodType<T>;
  schemaName: string;
  maxOutputTokens?: number;
}

export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
}

export interface LLMResult<T> {
  data: T;
  usage?: LLMUsage;
}

/**
 * Provider abstraction so the AI backend is swappable (OpenAI / Gemini / local)
 * without touching the pipeline. Implementations must throw:
 *  - TruncationError when the model ran out of output tokens (caller splits the batch)
 *  - LLMOutputError when output failed schema validation (caller retries)
 */
export interface LLMProvider {
  readonly name: string;
  generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<LLMResult<T>>;
}
