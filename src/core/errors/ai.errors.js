import createAppError from './AppError.js';

/**
 * AI Provider Error - When AI provider API fails
 */
export const AIProviderError = (message, statusCode = 500) => {
  return createAppError(`AI Provider Error: ${message}`, statusCode);
};

/**
 * AI Timeout Error - When AI request exceeds timeout
 */
export const AITimeoutError = (timeout = 30000) => {
  return createAppError(
    `AI request timed out after ${timeout}ms`,
    504
  );
};

/**
 * AI Rate Limit Error - When rate limit is exceeded
 */
export const AIRateLimitError = (retryAfter = null) => {
  const error = createAppError(
    'AI rate limit exceeded. Please try again later.',
    429
  );
  if (retryAfter) {
    error.retryAfter = retryAfter;
  }
  return error;
};

/**
 * AI Configuration Error - When AI is misconfigured
 */
export const AIConfigurationError = (message) => {
  return createAppError(`AI Configuration Error: ${message}`, 500);
};

/**
 * AI Invalid Response Error - When AI returns invalid response
 */
export const AIInvalidResponseError = (message = 'Invalid response from AI provider') => {
  return createAppError(`AI Invalid Response: ${message}`, 502);
};

export default {
  AIProviderError,
  AITimeoutError,
  AIRateLimitError,
  AIConfigurationError,
  AIInvalidResponseError
};




