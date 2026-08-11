import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rejectCsrf: vi.fn(),
  checkStrictRateLimit: vi.fn(),
  checkRateLimit: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getUser: vi.fn(),
  verifyTurnstile: vi.fn(),
  submitInquiry: vi.fn(),
  adSingle: vi.fn(),
  conversationMaybeSingle: vi.fn(),
  adminConversationUpdate: vi.fn(),
  adminInquiryUpdate: vi.fn(),
  adminUpdateMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/security/csrf", () => ({
  rejectInvalidCsrfRequest: (...args: unknown[]) => mocks.rejectCsrf(...args),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkStrictRateLimit: (...args: unknown[]) => mocks.checkStrictRateLimit(...args),
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: (...args: unknown[]) => mocks.verifyTurnstile(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock("@/lib/inquiries/submit-inquiry", () => ({
  submitInquiry: (...args: unknown[]) => mocks.submitInquiry(...args),
}));

import { DELETE, PATCH, POST } from "./route";

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const SELLER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const AD_ID = "44444444-4444-4444-8444-444444444444";
const CONVERSATION_ID = "55555555-5555-4555-8555-555555555555";
const MESSAGE_ID = "66666666-6666-4666-8666-666666666666";

function jsonRequest(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/inquiries", {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

function createAdminMutation(result: { error: unknown } = { error: null }) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: (...args: unknown[]) => mocks.adminUpdateMaybeSingle(...args),
    then: (
      resolve: (value: { error: unknown }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe("/api/inquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const allowedRate = {
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    };

    mocks.rejectCsrf.mockReturnValue(null);
    mocks.checkStrictRateLimit.mockResolvedValue(allowedRate);
    mocks.checkRateLimit.mockResolvedValue({ ...allowedRate, limit: 100 });
    mocks.getUser.mockResolvedValue({ data: { user: { id: BUYER_ID } } });
    mocks.verifyTurnstile.mockResolvedValue({ ok: true });
    mocks.submitInquiry.mockResolvedValue({
      ok: true,
      inquiryId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
    });
    mocks.adSingle.mockResolvedValue({
      data: { id: AD_ID, seller_id: SELLER_ID },
      error: null,
    });
    mocks.conversationMaybeSingle.mockResolvedValue({
      data: {
        id: CONVERSATION_ID,
        ad_id: AD_ID,
        buyer_id: BUYER_ID,
        seller_id: SELLER_ID,
        is_qualified: false,
      },
      error: null,
    });
    mocks.adminUpdateMaybeSingle.mockResolvedValue({
      data: { id: CONVERSATION_ID, ad_id: AD_ID, is_qualified: true },
      error: null,
    });

    mocks.createClient.mockResolvedValue({
      auth: { getUser: (...args: unknown[]) => mocks.getUser(...args) },
      from: (table: string) => {
        if (table === "ads") {
          const query = { eq: vi.fn(() => query), single: () => mocks.adSingle() };
          return { select: () => query };
        }

        if (table === "inquiry_conversations") {
          const selectQuery = {
            eq: vi.fn(() => selectQuery),
            maybeSingle: () => mocks.conversationMaybeSingle(),
          };
          return { select: () => selectQuery };
        }

        return {};
      },
    });

    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => ({
        update: (payload: unknown) => {
          if (table === "inquiry_conversations") {
            mocks.adminConversationUpdate(payload);
          } else {
            mocks.adminInquiryUpdate(payload);
          }
          return createAdminMutation();
        },
      }),
    });
  });

  describe("POST", () => {
    it("rejects an oversized captcha token before authentication", async () => {
      const response = await POST(
        jsonRequest("POST", {
          adId: AD_ID,
          message: "Mám záujem o auto.",
          captchaToken: "x".repeat(2049),
        }),
      );

      expect(response.status).toBe(400);
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    });

    it("requires authentication before CAPTCHA or database work", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: null } });

      const response = await POST(
        jsonRequest("POST", {
          adId: AD_ID,
          message: "Mám záujem o auto.",
          captchaToken: "captcha-token",
        }),
      );

      expect(response.status).toBe(401);
      expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
      expect(mocks.submitInquiry).not.toHaveBeenCalled();
    });

    it("verifies CAPTCHA for a new inquiry", async () => {
      mocks.verifyTurnstile.mockResolvedValue({ ok: false, error: "Captcha failed" });

      const response = await POST(
        jsonRequest("POST", {
          adId: AD_ID,
          message: "Mám záujem o auto.",
          captchaToken: "bad-token",
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Captcha failed" });
      expect(mocks.adSingle).not.toHaveBeenCalled();
    });

    it("sends a new buyer inquiry into the listing thread", async () => {
      const response = await POST(
        jsonRequest("POST", {
          adId: AD_ID,
          message: "  Mám záujem o auto.  ",
          captchaToken: "captcha-token",
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        inquiryId: CONVERSATION_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      });
      expect(mocks.verifyTurnstile).toHaveBeenCalledWith({
        token: "captcha-token",
        remoteIp: "203.0.113.10",
        action: "inquiry_submit",
        expectedHostname: "localhost",
      });
      expect(mocks.submitInquiry).toHaveBeenCalledWith(expect.anything(), {
        conversationId: null,
        adId: AD_ID,
        senderId: BUYER_ID,
        recipientId: SELLER_ID,
        message: "Mám záujem o auto.",
        phone: null,
      });
    });

    it("rejects an attempt to override the listing recipient", async () => {
      const response = await POST(
        jsonRequest("POST", {
          adId: AD_ID,
          recipientId: OTHER_USER_ID,
          message: "Mám záujem.",
          captchaToken: "captcha-token",
        }),
      );

      expect(response.status).toBe(400);
      expect(mocks.submitInquiry).not.toHaveBeenCalled();
    });

    it("allows a seller self-test inquiry without weakening recipient ownership", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: SELLER_ID } } });

      const response = await POST(
        jsonRequest("POST", {
          adId: AD_ID,
          message: "Moja testovacia správa.",
          captchaToken: "captcha-token",
        }),
      );

      expect(response.status).toBe(200);
      expect(mocks.submitInquiry).toHaveBeenCalledWith(expect.anything(), {
        conversationId: null,
        adId: AD_ID,
        senderId: SELLER_ID,
        recipientId: SELLER_ID,
        message: "Moja testovacia správa.",
        phone: null,
      });
    });

    it("sends an established reply without another CAPTCHA", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: SELLER_ID } } });

      const response = await POST(
        jsonRequest("POST", {
          conversationId: CONVERSATION_ID,
          message: "Áno, vozidlo je dostupné.",
        }),
      );

      expect(response.status).toBe(200);
      expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
      expect(mocks.checkRateLimit).toHaveBeenCalledWith(`inquiry_reply:${SELLER_ID}`);
      expect(mocks.submitInquiry).toHaveBeenCalledWith(expect.anything(), {
        conversationId: CONVERSATION_ID,
        adId: AD_ID,
        senderId: SELLER_ID,
        recipientId: BUYER_ID,
        message: "Áno, vozidlo je dostupné.",
        phone: null,
      });
    });
  });

  it("marks a thread as qualified only for its seller", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: SELLER_ID } } });

    const response = await PATCH(
      jsonRequest("PATCH", {
        action: "qualification",
        conversationId: CONVERSATION_ID,
        isQualified: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.adminConversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ is_qualified: true, qualified_by: SELLER_ID }),
    );
  });

  it("rejects qualification by the buyer", async () => {
    const response = await PATCH(
      jsonRequest("PATCH", {
        action: "qualification",
        conversationId: CONVERSATION_ID,
        isQualified: true,
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.adminConversationUpdate).not.toHaveBeenCalled();
  });

  it("marks all incoming messages in a thread as read", async () => {
    const response = await PATCH(
      jsonRequest("PATCH", {
        action: "read",
        conversationId: CONVERSATION_ID,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.adminInquiryUpdate).toHaveBeenCalledWith({ is_read: true });
  });

  it("archives only the signed-in participant's side", async () => {
    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/inquiries?conversationId=${CONVERSATION_ID}`,
        { method: "DELETE" },
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.adminConversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ buyer_archived_at: expect.any(String) }),
    );
    expect(mocks.adminConversationUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ seller_archived_at: expect.any(String) }),
    );
  });
});
