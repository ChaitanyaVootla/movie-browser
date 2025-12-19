/**
 * Admin configuration and utilities.
 *
 * Admin access is determined by email whitelist.
 * In production, this should be managed via environment variables
 * or a database-backed role system.
 */

/**
 * List of admin emails.
 * Override in production with ADMIN_EMAILS env var (comma-separated).
 */
const DEFAULT_ADMIN_EMAILS = ["speedblaze@gmail.com"];

function getAdminEmails(): string[] {
  const envEmails = process.env.ADMIN_EMAILS;
  if (envEmails) {
    return envEmails.split(",").map((email) => email.trim().toLowerCase());
  }
  return DEFAULT_ADMIN_EMAILS.map((email) => email.toLowerCase());
}

/**
 * Check if an email has admin privileges.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/**
 * Admin role type for type safety.
 */
export type UserRole = "user" | "admin";

/**
 * Get user role based on email.
 */
export function getUserRole(email: string | null | undefined): UserRole {
  return isAdminEmail(email) ? "admin" : "user";
}

