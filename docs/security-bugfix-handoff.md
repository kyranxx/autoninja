# 🔒 Security Bugfix Handoff — AutoNinja

> **Status (11 August 2026): RESOLVED.** The current source fails closed when `CRON_SECRET` is missing, accepts only the shared trusted proxy IP headers, and no longer contains route-local client-IP fallbacks in inquiries or listing reports. The handoff below is retained as the original diagnosis and remediation record. Current verification passed TypeScript, lint/i18n checks, the production build, 698 unit tests, and linked Supabase schema lint.

> **Purpose:** This document gives another LLM / developer everything needed to fix **two confirmed security bugs** in the AutoNinja codebase. It contains: the exact bug, root cause, all affected files with current code, the exact replacement code, test updates, and verification steps.
>
> **Repo:** `C:\Users\User\Desktop\Projects\AutoNinja`
> **Stack:** Next.js 16 (App Router, `src/app`), TypeScript, Supabase, Upstash Redis rate limiting, Vitest, ESLint.
> **Verification commands (run from the repo root):**
> - `npm run typecheck`
> - `npm run lint`
> - `npm run test:unit`  (all Vitest unit tests)
> - Targeted: `npx vitest run src/lib/request-fingerprint.test.ts src/app/api/cron/cleanup-sold/route.test.ts`

---

## 🔴 PROBLEM 1 — Cron endpoints can run without authentication outside production

### Severity
**High.** Any non-production deployment (local tunnel, self-hosted staging, preview server) allows unauthenticated attackers to trigger all 5 scheduled cron jobs that mutate the database and send bulk emails.

### Impact
- `/api/cron/expire-ads` — expires ads, removes Algolia index records (large-scale mutation).
- `/api/cron/sync-algolia` — performs a full Algolia index replacement (`replaceAllObjects`).
- `/api/cron/cleanup-sold` — hides sold ads in the DB.
- `/api/cron/send-alerts` — emails ALL users with saved searches/saved ads (bulk email / spam abuse).
- `/api/cron/process-email-jobs` — sends queued transactional/password-reset/confirmation emails (spam).

### Root cause
Authorization depends on `NODE_ENV`. In non-production, the helper intentionally returns `null` (i.e. "allowed"). Authorization must **never** depend on the deployment environment, because:
- developers expose local dev servers via tunnels (ngrok/cloudflared) for phone testing;
- self-hosted/staging boxes often become reachable without being started with `NODE_ENV=production`.

> Nuance: On Vercel, `NODE_ENV` is always `"production"` (even for previews), so this is **not** exploitable on Vercel previews — but it IS exploitable everywhere else running the same code.

### Affected file (primary)
**`src/lib/cron/route-helpers.ts`** — current code (lines 7–32):

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { ADS_CACHE_TAGS } from "@/lib/cache/tags";
import { createAdminClient } from "@/lib/supabase/admin";

export function rejectWhenInvalidCronRequest(
  request: NextRequest,
): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron secret is not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;

  if (isAuthorized) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function createCronAdminClient() {
  return createAdminClient();
}

export function revalidateAdsCacheTags() {
  for (const tag of ADS_CACHE_TAGS) {
    revalidateTag(tag, "max");
  }
}
```

### 🔧 Fix — make the helper fail-closed in ALL environments
Replace the function body (keep `createCronAdminClient` and `revalidateAdsCacheTags` unchanged):

```ts
export function rejectWhenInvalidCronRequest(
  request: NextRequest,
): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Fail-closed in every environment: if the secret is missing, deny.
    return NextResponse.json(
      { error: "Cron secret is not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;

  if (isAuthorized) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

That is the **only** change needed: remove the `if (process.env.NODE_ENV !== "production") return null;` block so the secret check always runs.

### Cron routes that consume the helper (no changes needed, but confirm each still calls it)
- `src/app/api/cron/expire-ads/route.ts`
- `src/app/api/cron/sync-algolia/route.ts`
- `src/app/api/cron/cleanup-sold/route.ts`
- `src/app/api/cron/send-alerts/route.ts`
- `src/app/api/cron/process-email-jobs/route.ts`

Each already has `const cronError = rejectWhenInvalidCronRequest(request); if (cronError) return cronError;`.
There are existing route tests that assert the 401 path (e.g. `cleanup-sold/route.test.ts`, `expire-ads/route.test.ts`, `send-alerts/route.test.ts`, `process-email-jobs/route.test.ts`) — they mock this helper, so they keep passing.

### Test update recommendation (optional but good)
There is **no** dedicated unit test for `rejectWhenInvalidCronRequest`. Consider adding one:
`src/lib/cron/route-helpers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { rejectWhenInvalidCronRequest } from "./route-helpers";

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/test", { headers });
}

describe("rejectWhenInvalidCronRequest", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("returns 500 when CRON_SECRET is not configured (fail closed)", () => {
    delete process.env.CRON_SECRET;
    const res = rejectWhenInvalidCronRequest(makeRequest({}));
    expect(res?.status).toBe(500);
  });

  it("returns 401 when no credentials are provided", () => {
    process.env.CRON_SECRET = "test-secret";
    const res = rejectWhenInvalidCronRequest(makeRequest({}));
    expect(res?.status).toBe(401);
  });

  it("returns 401 when credentials are wrong", () => {
    process.env.CRON_SECRET = "test-secret";
    const res = rejectWhenInvalidCronRequest(
      makeRequest({ authorization: "Bearer wrong" }),
    );
    expect(res?.status).toBe(401);
  });

  it("returns null when Authorization Bearer matches", () => {
    process.env.CRON_SECRET = "test-secret";
    const res = rejectWhenInvalidCronRequest(
      makeRequest({ authorization: "Bearer test-secret" }),
    );
    expect(res).toBeNull();
  });

  it("returns null when x-cron-secret matches", () => {
    process.env.CRON_SECRET = "test-secret";
    const res = rejectWhenInvalidCronRequest(
      makeRequest({ "x-cron-secret": "test-secret" }),
    );
    expect(res).toBeNull();
  });
});
```

### ✅ Problem 1 done when
- The `NODE_ENV` bypass block is gone.
- `npm run typecheck` and `npm run lint` pass.
- `npm run test:unit` passes (including the new cron helper test if added).

---

## 🔴 PROBLEM 2 — Rate limiting can be bypassed by spoofing IP headers

### Severity
**High.** An attacker can set client-controlled IP headers (`cf-connecting-ip`, `x-real-ip`) on every request to get a fresh rate-limit bucket each time, bypassing all rate limits:
- Registration & password reset (account spam, email bombing)
- Contact form, inquiries, listing reports (spam)
- Dealer actions, image uploads (abuse)
- Proxy-level route rate limiting (uses the same helper)

### Root cause
Two separate issues:
1. `src/lib/request-fingerprint.ts` trusts `cf-connecting-ip` and `x-real-ip` **without verifying the request actually passed through Cloudflare**. These headers are only trustworthy when a proxy that overwrites them is in front. The codebase contains **no** Cloudflare proxy verification (no `cf-ray` check, no signature validation).
2. Two API routes (`inquiries` and `listing-reports`) have their **own duplicate `getClientIp`** functions that trust `x-client-ip` even though the shared helper's own test documents `x-client-ip` as untrusted.

Header trust table:
| Header | Set by | Trustworthy? |
|---|---|---|
| `x-vercel-forwarded-for` | Vercel edge | ✅ Yes (Vercel overwrites) |
| `x-forwarded-for` | Vercel edge | ✅ Yes on Vercel (overwritten) |
| `cf-connecting-ip` | Cloudflare **only if proxied** | ⚠️ Only if CF is actually in front |
| `x-real-ip` | anything | ❌ Client-controllable |
| `x-client-ip` | anything | ❌ Client-controllable |

### Affected files & current code

#### (a) `src/lib/request-fingerprint.ts` — the shared helper (primary fix)
Current code:
```ts
import { createHash } from "node:crypto";

const IP_HEADERS = [
  "cf-connecting-ip",
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
] as const;

function getFirstHeaderValue(
  headers: Headers,
  headerName: (typeof IP_HEADERS)[number],
): string | null {
  const rawValue = headers.get(headerName);
  if (!rawValue) {
    return null;
  }

  const firstValue = rawValue.split(",")[0]?.trim();
  return firstValue || null;
}

export function getClientIp(headers: Headers): string | null {
  for (const headerName of IP_HEADERS) {
    const value = getFirstHeaderValue(headers, headerName);
    if (value) {
      return value;
    }
  }

  return null;
}

export function createRequestFingerprint(headers: Headers): string {
  const ip = getClientIp(headers) ?? "unknown-ip";
  const rawFingerprint = `ip:${ip}`;
  return createHash("sha256").update(rawFingerprint).digest("hex").slice(0, 24);
}

export function createRateLimitIdentifier(
  namespace: string,
  headers: Headers,
): string {
  return `${namespace}:${createRequestFingerprint(headers)}`;
}
```

#### (b) `src/app/api/inquiries/route.ts` (lines 31–38) — duplicate, spoofable
```ts
function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-client-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}
```

#### (c) `src/app/api/listing-reports/route.ts` (lines 25–32) — duplicate, spoofable
```ts
function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-client-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}
```

### 🔧 Fix — pick ONE option depending on deployment topology

> ⚠️ **A decision is needed from the team:** Is Cloudflare in front of the app, or is it Vercel-only?
> - **No Cloudflare (Vercel-only):** use **Option A**.
> - **Cloudflare IS in front:** use **Option B**.

#### Option A — Vercel-native (recommended default, no Cloudflare)
Replace the `IP_HEADERS` array and `getClientIp` in `src/lib/request-fingerprint.ts`:
```ts
const TRUSTED_IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
] as const;

function getFirstHeaderValue(
  headers: Headers,
  headerName: (typeof TRUSTED_IP_HEADERS)[number],
): string | null {
  const rawValue = headers.get(headerName);
  if (!rawValue) {
    return null;
  }

  const firstValue = rawValue.split(",")[0]?.trim();
  return firstValue || null;
}

export function getClientIp(headers: Headers): string | null {
  for (const headerName of TRUSTED_IP_HEADERS) {
    const value = getFirstHeaderValue(headers, headerName);
    if (value) {
      return value;
    }
  }

  return null;
}
```
Keep `createRequestFingerprint` and `createRateLimitIdentifier` unchanged.

#### Option B — Cloudflare-aware (use only if Cloudflare proxies the domain)
Replace `getClientIp` in `src/lib/request-fingerprint.ts` (keep the existing `IP_HEADERS` const if desired, or restructure to the snippet below):
```ts
function getFirstHeaderValue(
  headers: Headers,
  headerName: string,
): string | null {
  const rawValue = headers.get(headerName);
  if (!rawValue) {
    return null;
  }

  const firstValue = rawValue.split(",")[0]?.trim();
  return firstValue || null;
}

export function getClientIp(headers: Headers): string | null {
  // Cloudflare always adds cf-ray on proxied requests; it cannot be forged
  // by the client unless the request truly came through Cloudflare.
  const isCloudflareProxied = headers.has("cf-ray");

  if (isCloudflareProxied) {
    const cfIp = getFirstHeaderValue(headers, "cf-connecting-ip");
    if (cfIp) return cfIp;
  }

  // Fall back to platform-set headers only.
  for (const headerName of ["x-vercel-forwarded-for", "x-forwarded-for"] as const) {
    const value = getFirstHeaderValue(headers, headerName);
    if (value) return value;
  }

  return null;
}
```

#### Then fix the two duplicate `getClientIp` functions
In **both** `src/app/api/inquiries/route.ts` and `src/app/api/listing-reports/route.ts`, **delete the local `getClientIp` function entirely** and import the safe one instead:

At the top of each file, add:
```ts
import { getClientIp } from "@/lib/request-fingerprint";
```

Then remove the local `function getClientIp(...) { ... }` block in each file.

In `inquiries/route.ts` the call site already uses `getClientIp(request)` (line 94), so after deleting the local duplicate and importing the shared one, it resolves to the safe implementation. Same for `listing-reports/route.ts`.

### Test updates required
**`src/lib/request-fingerprint.test.ts`** currently asserts the **buggy** behavior (it prefers `cf-connecting-ip` over `x-forwarded-for`). This test MUST be updated to match the new safe behavior, otherwise CI fails.

Current buggy test (lines 9–16):
```ts
it("prefers cf-connecting-ip for client IP extraction", () => {
  const headers = new Headers({
    "cf-connecting-ip": "198.51.100.44",
    "x-forwarded-for": "203.0.113.11",
  });

  expect(getClientIp(headers)).toBe("198.51.100.44");
});
```

**If Option A was chosen**, replace it with:
```ts
it("ignores client-controlled cf-connecting-ip when Cloudflare is not proxied", () => {
  const headers = new Headers({
    "cf-connecting-ip": "198.51.100.44",
    "x-forwarded-for": "203.0.113.11",
  });

  expect(getClientIp(headers)).toBe("203.0.113.11");
});

it("ignores x-real-ip and x-client-ip", () => {
  const headers = new Headers({
    "x-real-ip": "198.51.100.55",
    "x-client-ip": "198.51.100.66",
  });

  expect(getClientIp(headers)).toBeNull();
});
```

**If Option B was chosen**, replace it with:
```ts
it("uses cf-connecting-ip only when cf-ray proves Cloudflare proxy", () => {
  const headers = new Headers({
    "cf-ray": "abc123",
    "cf-connecting-ip": "198.51.100.44",
    "x-forwarded-for": "203.0.113.11",
  });

  expect(getClientIp(headers)).toBe("198.51.100.44");
});

it("ignores cf-connecting-ip when cf-ray is absent", () => {
  const headers = new Headers({
    "cf-connecting-ip": "198.51.100.44",
    "x-forwarded-for": "203.0.113.11",
  });

  expect(getClientIp(headers)).toBe("203.0.113.11");
});

it("ignores x-real-ip and x-client-ip", () => {
  const headers = new Headers({
    "x-real-ip": "198.51.100.55",
    "x-client-ip": "198.51.100.66",
  });

  expect(getClientIp(headers)).toBeNull();
});
```

Also update the existing test "uses first value from x-forwarded-for" — it stays valid under both options (keep as-is).

> Note: Some existing API route tests (e.g. `auth/register/route.test.ts`, `account/password/route.test.ts`, `stripe/checkout/route.rate-limit.test.ts`, `proxy.test.ts`) build requests with a `cf-connecting-ip` header and expect it to be used for the rate-limit identifier / fingerprint.
> - Under **Option A**, those tests will change behavior (the `cf-connecting-ip` value is ignored, falling back to the first trusted header or `unknown-ip`). Check each: if a test also sends an `x-forwarded-for` header, assertions usually still hold; if a test relies **only** on `cf-connecting-ip`, the expected identifier/fingerprint must be derived from `unknown-ip` instead. Run `npx vitest run` on the affected test files and update expectations to match the new, correct behavior.
> - Under **Option B**, those tests will change behavior too (no `cf-ray` header in tests → `cf-connecting-ip` ignored). Expect `unknown-ip`-based identifiers unless a `cf-ray` header is added to the test fixtures.

### ✅ Problem 2 done when
- `src/lib/request-fingerprint.ts` no longer trusts `cf-connecting-ip`/`x-real-ip` without verification (per chosen option).
- Both `x-client-ip` duplicate `getClientIp` functions in `inquiries/route.ts` and `listing-reports/route.ts` are removed and replaced with the shared safe import.
- `src/lib/request-fingerprint.test.ts` is updated to assert the safe behavior.
- `npm run typecheck`, `npm run lint`, and `npm run test:unit` all pass.

---

## 📋 Quick checklist for the fixing agent

| Step | File(s) | Change |
|---|---|---|
| 1 | `src/lib/cron/route-helpers.ts` | Remove `if (process.env.NODE_ENV !== "production") return null;` |
| 2 | `src/lib/request-fingerprint.ts` | Trust only Vercel headers (Option A) OR verify `cf-ray` (Option B) |
| 3 | `src/app/api/inquiries/route.ts` | Delete local `getClientIp`, import safe one from `@/lib/request-fingerprint` |
| 4 | `src/app/api/listing-reports/route.ts` | Delete local `getClientIp`, import safe one from `@/lib/request-fingerprint` |
| 5 | `src/lib/request-fingerprint.test.ts` | Update "prefers cf-connecting-ip" test to assert safe behavior |
| 6 | (optional) | Add `src/lib/cron/route-helpers.test.ts` |
| 7 | repo root | Run `npm run typecheck`, `npm run lint`, `npm run test:unit` |
