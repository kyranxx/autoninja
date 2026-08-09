import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const checkStrictRateLimitMock = vi.fn();
const createRateLimitIdentifierMock = vi.fn();
const getClientIpMock = vi.fn();
const rejectInvalidCsrfRequestMock = vi.fn();
const verifyTurnstileTokenMock = vi.fn();
const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const adsMaybeSingleMock = vi.fn();
const existingReportMaybeSingleMock = vi.fn();
const insertMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@/lib/ratelimit", () => ({
  checkStrictRateLimit: (...args: unknown[]) => checkStrictRateLimitMock(...args),
}));

vi.mock("@/lib/request-fingerprint", () => ({
  createRateLimitIdentifier: (...args: unknown[]) =>
    createRateLimitIdentifierMock(...args),
  getClientIp: (...args: unknown[]) => getClientIpMock(...args),
}));

vi.mock("@/lib/security/csrf", () => ({
  rejectInvalidCsrfRequest: (...args: unknown[]) =>
    rejectInvalidCsrfRequestMock(...args),
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: (...args: unknown[]) => verifyTurnstileTokenMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { POST } from "./route";

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/listing-reports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/listing-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    checkStrictRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    createRateLimitIdentifierMock.mockReturnValue("listing-report:test");
    getClientIpMock.mockReturnValue(null);
    rejectInvalidCsrfRequestMock.mockReturnValue(null);
    verifyTurnstileTokenMock.mockResolvedValue({ ok: true });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });

    adsMaybeSingleMock.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111", status: "active", seller_id: "seller-1" },
      error: null,
    });
    existingReportMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: null });

    createAdminClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === "ads") {
          const query = {
            eq: () => query,
            maybeSingle: () => adsMaybeSingleMock(),
          };
          return { select: () => query };
        }

        if (table === "listing_reports") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    maybeSingle: () => existingReportMaybeSingleMock(),
                  }),
                }),
              }),
            }),
            insert: (...args: unknown[]) => insertMock(...args),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: (...args: unknown[]) => getUserMock(...args),
      },
    });
  });

  it("rejects an oversized captcha token before verification", async () => {
    const response = await POST(
      createRequest({
        adId: "11111111-1111-4111-8111-111111111111",
        category: "fraud",
        details: "This listing looks suspicious and misleading.",
        captchaToken: "x".repeat(2049),
      }),
    );

    expect(response.status).toBe(400);
    expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });

  it("stores a report for an active ad", async () => {
    const response = await POST(
      createRequest({
        adId: "11111111-1111-4111-8111-111111111111",
        category: "fraud",
        details: "This listing looks suspicious and misleading.",
        captchaToken: "captcha-token",
      }),
    );

    expect(response.status).toBe(200);
    expect(verifyTurnstileTokenMock).toHaveBeenCalledWith({
      token: "captcha-token",
      remoteIp: null,
      action: "listing_report_submit",
      expectedHostname: "localhost",
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ad_id: "11111111-1111-4111-8111-111111111111",
        reporter_id: "user-1",
        category: "fraud",
      }),
    );
  });

  it("returns retry timing when the strict rate limit is exceeded", async () => {
    checkStrictRateLimitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(createRequest({}));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });

  it("rejects reporting your own ad", async () => {
    adsMaybeSingleMock.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111", status: "active", seller_id: "user-1" },
      error: null,
    });

    const response = await POST(
      createRequest({
        adId: "11111111-1111-4111-8111-111111111111",
        category: "fraud",
        details: "This listing looks suspicious and misleading.",
        captchaToken: "captcha-token",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Nemôžete nahlásiť vlastný inzerát.",
    });
  });

  it("returns duplicate success when the same reporter already has an open report", async () => {
    existingReportMaybeSingleMock.mockResolvedValue({
      data: { id: "report-1" },
      error: null,
    });

    const response = await POST(
      createRequest({
        adId: "11111111-1111-4111-8111-111111111111",
        category: "fraud",
        details: "This listing looks suspicious and misleading.",
        captchaToken: "captcha-token",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, duplicate: true });
    expect(insertMock).not.toHaveBeenCalled();
  });
});
