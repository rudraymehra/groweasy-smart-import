import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { LLMOutputError, TruncationError } from '../lib/errors.js';
import type { GenerateStructuredOptions, LLMProvider, LLMResult } from './provider.js';

/**
 * Anthropic Claude provider using structured outputs (constrained decoding):
 * the API guarantees the response parses against the JSON schema, which makes
 * out-of-enum values for crm_status / data_source impossible at the wire level.
 *
 * The system prompt is stable across batches and marked with cache_control so
 * repeated batches read the prefix from the prompt cache. The SDK retries
 * 429/5xx with backoff (honouring retry-after) via maxRetries.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
  }

  async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<LLMResult<T>> {
    const response = await this.client.messages.parse({
      model: opts.model,
      max_tokens: opts.maxOutputTokens ?? 16000,
      system: [
        {
          type: 'text',
          text: opts.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: opts.user }],
      output_config: { format: zodOutputFormat(opts.schema) },
    });

    if (response.stop_reason === 'max_tokens') {
      throw new TruncationError();
    }
    if (response.stop_reason === 'refusal') {
      throw new LLMOutputError('Model declined the request');
    }
    if (response.parsed_output == null) {
      throw new LLMOutputError('Model output did not match the expected schema');
    }
    return {
      data: response.parsed_output,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens ?? undefined,
      },
    };
  }
}
