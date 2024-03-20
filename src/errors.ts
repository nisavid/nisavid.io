/**
 * Errors.
 */

/**
 * An error that occurs when a value is invalid.
 */
export class ValidationError extends Error {
  /**
   * @param message - The error message.
   * @param value - The invalid value that caused the error.
   */
  constructor(message: string, value: any) {
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
  value: any;
}
