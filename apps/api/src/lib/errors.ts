/** Application error with an HTTP status and machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);

/** The model's structured output failed validation or was empty. Retryable. */
export class LLMOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMOutputError';
  }
}

/** The model ran out of output tokens mid-response. Split the batch, don't retry as-is. */
export class TruncationError extends Error {
  constructor(message = 'LLM response truncated (max_tokens)') {
    super(message);
    this.name = 'TruncationError';
  }
}
