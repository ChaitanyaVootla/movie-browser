/**
 * Actor-capture for the generic trigger-based audit log.
 *
 * The `audit.if_modified()` Postgres trigger (postgres/init/05-audit.sql) reads
 * the per-transaction GUC `audit.actor_id` to attribute each audited row change
 * to a user. That GUC is connection/transaction-scoped, so it MUST be set INSIDE
 * the same transaction as the mutation — `auditedTransaction` does exactly that.
 *
 * A mutation that wants actor attribution should run its writes inside
 * `auditedTransaction(actorId, (tx) => ...)`. Any audited write performed
 * OUTSIDE this wrapper still gets audited — the trigger simply records a NULL
 * actor (it degrades gracefully; an unset GUC is read as empty → NULL).
 *
 * `SET LOCAL` scopes the setting to the current transaction and auto-resets on
 * commit/rollback, so there is no risk of the actor leaking across pooled
 * connections.
 *
 * See .claude/rules/audit-log.md for the full pattern.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

/**
 * Transaction client surface passed to the callback (Prisma's interactive-tx
 * client: the full delegate API minus the lifecycle methods).
 */
export type AuditTx = Prisma.TransactionClient;

/**
 * Runs `fn` inside a Prisma interactive transaction with the audit actor set,
 * so every audited row change made through `tx` is attributed to `actorId`.
 *
 * @param actorId  The PG user id performing the mutation. Pass `null` to run an
 *                 audited transaction with no attributed actor (rare; prefer a
 *                 real id). The value is bound as a parameter, never interpolated.
 * @param fn       Callback receiving the transaction client. Do all audited
 *                 writes through this `tx`.
 */
export async function auditedTransaction<T>(
  actorId: number | null,
  fn: (tx: AuditTx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // SET LOCAL cannot take a bind parameter directly, so set the GUC via
    // set_config(name, value, is_local=true) which CAN be parameterized safely.
    // actorId is sent as a parameter (never string-interpolated). NULL actor →
    // empty string → the trigger reads it as NULL (graceful degrade).
    await tx.$executeRaw`SELECT set_config('audit.actor_id', ${
      actorId === null ? "" : String(actorId)
    }, true)`;
    return fn(tx);
  });
}
