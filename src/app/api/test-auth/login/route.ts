import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { TEST_AUTH_ENABLED } from "@/lib/auth.config";

/**
 * LOCAL-ONLY test-auth login route for Playwright E2E.
 *
 * SECURITY: Gated by the SAME triple-gate as the credentials provider —
 * TEST_AUTH_ENABLED is true ONLY when NODE_ENV !== "production" AND
 * ENABLE_TEST_AUTH === "true" (auth.config.ts also CRASHES boot if the flag is
 * ever set in production). When the gate is off this route returns 404, so it
 * is indistinguishable from a non-existent endpoint in prod. Production never
 * sets ENABLE_TEST_AUTH — do NOT add it to any deploy/prod config.
 *
 * One-call recipe for Playwright (a single POST, no CSRF dance):
 *
 *   const ctx = await browser.newContext();
 *   const res = await ctx.request.post("http://localhost:3000/api/test-auth/login");
 *   // res.ok() === true; the authjs.session-token cookie is now in `ctx`.
 *   const page = await ctx.newPage();   // every request is authenticated.
 *
 * `signIn("test-auth", { redirect: false })` runs the provider's authorize()
 * (which upserts the PG users row for googleId `test-local-user`) and writes
 * the session cookie onto the response via next/headers. We return JSON so the
 * test can assert success without following a redirect.
 */

function gateOff(): NextResponse {
  // 404 (not 403) so the endpoint is invisible when the gate is off.
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(): Promise<NextResponse> {
  if (!TEST_AUTH_ENABLED) return gateOff();

  try {
    await signIn("test-auth", { redirect: false });
    return NextResponse.json({
      ok: true,
      user: { email: "test@local.dev", googleId: "test-local-user" },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Allow GET too, for trivial manual/browser-based login in dev.
export async function GET(): Promise<NextResponse> {
  return POST();
}
