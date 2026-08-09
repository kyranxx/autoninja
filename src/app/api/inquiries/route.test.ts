import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rejectInvalidCsrfRequestMock = vi.fn();
const checkStrictRateLimitMock = vi.fn();
const createClientMock = vi.fn();
const getUserMock = vi.fn();
const verifyTurnstileTokenMock = vi.fn();
const submitInquiryMock = vi.fn();
const adSingleMock = vi.fn();
const inquiryMaybeSingleMock = vi.fn();
const updateMaybeSingleMock = vi.fn();

vi.mock("@/lib/security/csrf", () => ({
  rejectInvalidCsrfRequest: (...args: unknown[]) =>
    rejectInvalidCsrfRequestMock(...args),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkStrictRateLimit: (...args: unknown[]) => checkStrictRateLimitMock(...args),
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: (...args: unknown[]) =>
    verifyTurnstileTokenMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/inquiries/submit-inquiry", () => ({
  submitInquiry: (...args: unknown[]) => submitInquiryMock(...args),
}));

import { PATCH, POST } from "./route";

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const AD_ID = "44444444-4444-4444-8444-444444444444";
const INQUIRY_ID = "55555555-5555-4555-8555-555555555555";

function createPostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/inquiries", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

function createPatchRequest(inquiryId: string, isQualified: boolean) {
  return new NextRequest("http://localhost/api/inquiries", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ inquiryId, isQualified }),
  });
}

describe("/api/inquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    rejectInvalidCsrfRequestMock.mockReturnValue(null);
    checkStrictRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } } });
    verifyTurnstileTokenMock.mockResolvedValue({ ok: true });
    submitInquiryMock.mockResolvedValue({
      ok: true,
      inquiryId: INQUIRY_ID,
    });
    adSingleMock.mockResolvedValue({
      data: {
        id: AD_ID,
        seller_id: SELLER_ID,
      },
      error: null,
    });
    inquiryMaybeSingleMock.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        ad_id: "22222222-2222-4222-8222-222222222222",
        is_qualified: false,
        ads: { seller_id: SELLER_ID },
      },
      error: null,
    });
    updateMaybeSingleMock.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        ad_id: "22222222-2222-4222-8222-222222222222",
        is_qualified: true,
      },
      error: null,
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: (...args: unknown[]) => getUserMock(...args),
      },
      from: (table: string) => {
        if (table === "ads") {
          const query = {
            eq: () => query,
            single: () => adSingleMock(),
          };
          return { select: () => query };
        }

        const selectQuery = {
          eq: () => selectQuery,
          or: () => Promise.resolve({ count: 0, error: null }),
          maybeSingle: () => inquiryMaybeSingleMock(),
        };
        const mutationQuery = {
          eq: () => mutationQuery,
          select: () => mutationQuery,
          maybeSingle: () => updateMaybeSingleMock(),
        };

        return {
          select: () => selectQuery,
          update: () => mutationQuery,
          delete: () => mutationQuery,
        };
      },
    });
  });

  describe("POST /api/inquiries", () => {
    it("rejects an oversized captcha token before auth or verification", async () => {
      const response = await POST(
        createPostRequest({
          adId: AD_ID,
          message: "Mam zaujem o auto.",
          captchaToken: "x".repeat(2049),
        }),
      );

      expect(response.status).toBe(400);
      expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
      expect(getUserMock).not.toHaveBeenCalled();
    });

    it("requires an authenticated buyer before captcha or insert work", async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });

      const response = await POST(
        createPostRequest({
          adId: AD_ID,
          message: "Mam zaujem o auto.",
          captchaToken: "captcha-token",
        }),
      );
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload).toEqual({ error: "Unauthorized" });
      expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
      expect(submitInquiryMock).not.toHaveBeenCalled();
    });

    it("rejects invalid captcha before loading the ad", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } } });
      verifyTurnstileTokenMock.mockResolvedValue({
        ok: false,
        error: "Captcha failed",
      });

      const response = await POST(
        createPostRequest({
          adId: AD_ID,
          message: "Mam zaujem o auto.",
          captchaToken: "bad-token",
        }),
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload).toEqual({ error: "Captcha failed" });
      expect(adSingleMock).not.toHaveBeenCalled();
      expect(submitInquiryMock).not.toHaveBeenCalled();
    });

    it("sends buyer inquiry to the ad seller", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } } });

      const response = await POST(
        createPostRequest({
          adId: AD_ID,
          message: "  Mam zaujem o auto.  ",
          captchaToken: "captcha-token",
        }),
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toEqual({ ok: true, inquiryId: INQUIRY_ID });
      expect(verifyTurnstileTokenMock).toHaveBeenCalledWith({
        token: "captcha-token",
        remoteIp: "203.0.113.10",
        action: "inquiry_submit",
        expectedHostname: "localhost",
      });
      expect(submitInquiryMock).toHaveBeenCalledWith(
        expect.anything(),
        {
          adId: AD_ID,
          senderId: BUYER_ID,
          recipientId: SELLER_ID,
          message: "Mam zaujem o auto.",
          phone: null,
        },
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("rejects buyer recipient override away from the ad seller", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } } });

      const response = await POST(
        createPostRequest({
          adId: AD_ID,
          recipientId: OTHER_USER_ID,
          message: "Mam zaujem o auto.",
          captchaToken: "captcha-token",
        }),
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload).toEqual({
        error: "Správu pre tento inzerát môžete odoslať iba predajcovi.",
      });
      expect(submitInquiryMock).not.toHaveBeenCalled();
    });

    it("allows the ad seller to send a message to themselves", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: SELLER_ID } } });

      const response = await POST(
        createPostRequest({
          adId: AD_ID,
          message: "Moja poznámka.",
          captchaToken: "captcha-token",
        }),
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toEqual({ ok: true, inquiryId: INQUIRY_ID });
      expect(submitInquiryMock).toHaveBeenCalledWith(
        expect.anything(),
        {
          adId: AD_ID,
          senderId: SELLER_ID,
          recipientId: SELLER_ID,
          message: "Moja poznámka.",
          phone: null,
        },
      );
    });

    it("returns not found when the ad cannot be loaded", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: BUYER_ID } } });
      adSingleMock.mockResolvedValue({ data: null, error: { message: "missing" } });

      const response = await POST(
        createPostRequest({
          adId: AD_ID,
          message: "Mam zaujem o auto.",
          captchaToken: "captcha-token",
        }),
      );
      const payload = await response.json();

      expect(response.status).toBe(404);
      expect(payload).toEqual({ error: "Inzerát sa nenašiel." });
      expect(submitInquiryMock).not.toHaveBeenCalled();
    });
  });

  it("marks an inquiry as qualified for the ad seller", async () => {
    const response = await PATCH(
      createPatchRequest("11111111-1111-4111-8111-111111111111", true),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      inquiryId: "11111111-1111-4111-8111-111111111111",
      adId: "22222222-2222-4222-8222-222222222222",
      isQualified: true,
      wasQualifiedBefore: false,
    });
  });

  it("rejects qualification update when current user does not own the ad", async () => {
    inquiryMaybeSingleMock.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        ad_id: "22222222-2222-4222-8222-222222222222",
        is_qualified: false,
        ads: { seller_id: OTHER_USER_ID },
      },
      error: null,
    });

    const response = await PATCH(
      createPatchRequest("11111111-1111-4111-8111-111111111111", true),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: "Forbidden" });
  });
});
