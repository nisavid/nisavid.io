/**
 * Errors.
 */

/**
 * An error that occurs when a value is invalid.
 */
export class ValidationError extends Error {
  /**
   * @param {string} message - The error message.
   * @param {unknown} value - The invalid value that caused the error.
   */
  constructor(message: string, value: unknown) {
    super(message);
    this.name = "ValidationError";
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }

  /**
   * The invalid value that caused the error.
   */
  value: unknown;
}
