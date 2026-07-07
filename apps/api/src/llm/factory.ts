import type { Env } from '../config/env.js';
import { AnthropicProvider } from './anthropic.js';
import type { LLMProvider } from './provider.js';

/**
 * Single construction point for the AI backend. Adding OpenAI/Gemini support
 * means implementing LLMProvider and adding a branch here — nothing in the
 * pipeline changes.
 */
export function createProvider(env: Env): LLMProvider {
  return new AnthropicProvider(env.ANTHROPIC_API_KEY);
}
