/**
 * PostgreSQL Error Utilities
 *
 * Type guards and helper functions for safe error handling with `catch (error: unknown)`.
 */

/**
 * Type guard to check if an error is a Prisma error with a code property.
 * Used for safe error handling with `catch (error: unknown)`.
 *
 * Common Prisma error codes:
 * - P2022: Column does not exist (schema out of sync)
 * - P2002: Unique constraint violation
 * - P2025: Record not found
 */
export function isPrismaError(error: unknown): error is { code: string; message?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

/**
 * Get error message from unknown error type.
 * Safely extracts message from Error instances or converts to string.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}
