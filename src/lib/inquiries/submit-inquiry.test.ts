import { describe, expect, it, vi } from "vitest";
import {
  normalizeInquiryMessage,
  submitInquiry,
  type InquiryInsertClient,
} from "./submit-inquiry";

function makeMockClient({
  insertError = null,
  inquiryId = "9d4c0a7a-7c2b-4e56-a10d-8b32cb608c86",
  conversationId = "f1a77b47-8bd3-4fd4-9b94-3a4f0cd8f619",
}: {
  insertError?: { message?: string } | null;
  inquiryId?: string;
  conversationId?: string;
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data: { id: inquiryId, conversation_id: conversationId },
    error: insertError,
  });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const client = { from: () => ({ insert }) } as InquiryInsertClient;

  return { client, insert, select, single };
}

describe("normalizeInquiryMessage", () => {
  it("trims and normalizes newlines", () => {
    expect(normalizeInquiryMessage("  ahoj\r\nsvet  ")).toBe("ahoj\nsvet");
  });
});

describe("submitInquiry", () => {
  it("returns validation error for an empty message", async () => {
    const { client, insert } = makeMockClient();

    const result = await submitInquiry(client, {
      conversationId: "thread-1",
      adId: "ad-1",
      senderId: "user-1",
      recipientId: "seller-1",
      message: "   ",
    });

    expect(result).toEqual({
      ok: false,
      error: "Správa nemoze byt prazdna.",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts a normalized message into the resolved thread", async () => {
    const { client, insert, select, single } = makeMockClient();

    const result = await submitInquiry(client, {
      conversationId: "thread-1",
      adId: "ad-1",
      senderId: "user-1",
      recipientId: "seller-1",
      message: "  Mám záujem  ",
      phone: "+421900000000",
    });

    expect(result).toEqual({
      ok: true,
      inquiryId: "9d4c0a7a-7c2b-4e56-a10d-8b32cb608c86",
      conversationId: "f1a77b47-8bd3-4fd4-9b94-3a4f0cd8f619",
    });
    expect(insert).toHaveBeenCalledWith({
      conversation_id: "thread-1",
      ad_id: "ad-1",
      sender_id: "user-1",
      recipient_id: "seller-1",
      message: "Mám záujem",
      phone: "+421900000000",
    });
    expect(select).toHaveBeenCalledWith("id,conversation_id");
    expect(single).toHaveBeenCalledTimes(1);
  });

  it("lets the database create the conversation atomically for a first message", async () => {
    const { client, insert } = makeMockClient();

    const result = await submitInquiry(client, {
      adId: "ad-1",
      senderId: "user-1",
      recipientId: "seller-1",
      message: "Mám záujem",
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      conversationId: "f1a77b47-8bd3-4fd4-9b94-3a4f0cd8f619",
    }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      conversation_id: null,
    }));
  });

  it("normalizes the database rate-limit error", async () => {
    const { client } = makeMockClient({
      insertError: { message: "Prilis vela odpovedi za kratky cas." },
    });

    const result = await submitInquiry(client, {
      conversationId: "thread-1",
      adId: "ad-1",
      senderId: "user-1",
      recipientId: "seller-1",
      message: "Mám záujem",
    });

    expect(result).toEqual({
      ok: false,
      error: "Príliš veľa správ za krátky čas. Skúste to znova o pár minút.",
    });
  });

  it("returns an ordinary database error", async () => {
    const { client } = makeMockClient({ insertError: { message: "insert failed" } });

    const result = await submitInquiry(client, {
      conversationId: "thread-1",
      adId: "ad-1",
      senderId: "user-1",
      recipientId: "seller-1",
      message: "Mám záujem",
    });

    expect(result).toEqual({ ok: false, error: "insert failed" });
  });
});
