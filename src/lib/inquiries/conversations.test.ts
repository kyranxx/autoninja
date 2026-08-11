import { describe, expect, it } from "vitest";
import {
  getInquiryDirection,
  mapInquiryThreadsToConversations,
  type InquiryConversationRow,
} from "./conversations";

const baseThread: InquiryConversationRow = {
  id: "thread-1",
  ad_id: "ad-1",
  buyer_id: "buyer-1",
  seller_id: "seller-1",
  buyer_archived_at: null,
  seller_archived_at: null,
  is_qualified: false,
  qualified_at: null,
  created_at: "2026-02-24T09:00:00.000Z",
  last_message_at: "2026-02-24T11:00:00.000Z",
  ads: {
    id: "ad-1",
    brand: "Škoda",
    model: "Octavia",
    photos_json: ["/car-1.jpg"],
    seller_id: "seller-1",
    status: "active",
  },
  inquiries: [],
};

describe("getInquiryDirection", () => {
  it("uses the signed-in user as the direction source", () => {
    const message = { sender_id: "buyer-1" };

    expect(getInquiryDirection(message, "buyer-1")).toBe("outgoing");
    expect(getInquiryDirection(message, "seller-1")).toBe("incoming");
  });
});

describe("mapInquiryThreadsToConversations", () => {
  it("groups the complete chronological history into one conversation", () => {
    const conversations = mapInquiryThreadsToConversations(
      [
        {
          ...baseThread,
          is_qualified: true,
          qualified_at: "2026-02-24T10:30:00.000Z",
          inquiries: [
            {
              id: "message-2",
              sender_id: "seller-1",
              recipient_id: "buyer-1",
              message: "Áno, je dostupné.",
              is_read: false,
              created_at: "2026-02-24T11:00:00.000Z",
            },
            {
              id: "message-1",
              sender_id: "buyer-1",
              recipient_id: "seller-1",
              message: "Je auto dostupné?",
              is_read: false,
              created_at: "2026-02-24T09:00:00.000Z",
            },
          ],
        },
      ],
      "seller-1",
      {
        "buyer-1": "Jana P",
        "seller-1": "Auto Dom",
      },
    );

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: "thread-1",
      counterpartyName: "Jana P",
      carTitle: "Škoda Octavia",
      listingStatus: "active",
      unread: 1,
      lastMessage: "Áno, je dostupné.",
      lastDirection: "outgoing",
      isQualified: true,
      canQualify: true,
    });
    expect(conversations[0].messages.map((message) => message.id)).toEqual([
      "message-1",
      "message-2",
    ]);
  });

  it("sorts threads by latest message and hides only the current user's archive", () => {
    const conversations = mapInquiryThreadsToConversations(
      [
        {
          ...baseThread,
          id: "archived-for-buyer",
          buyer_archived_at: "2026-02-24T12:00:00.000Z",
        },
        {
          ...baseThread,
          id: "visible-to-buyer",
          ad_id: "ad-2",
          seller_archived_at: "2026-02-24T12:00:00.000Z",
          last_message_at: "2026-02-25T12:00:00.000Z",
        },
      ],
      "buyer-1",
    );

    expect(conversations.map((conversation) => conversation.id)).toEqual([
      "visible-to-buyer",
    ]);
  });

  it("uses fallbacks and disables lead qualification for a self-test thread", () => {
    const conversations = mapInquiryThreadsToConversations(
      [
        {
          ...baseThread,
          buyer_id: "seller-1",
          ads: null,
          inquiries: [
            {
              id: "message-1",
              sender_id: "seller-1",
              recipient_id: "seller-1",
              message: "Test",
              is_read: false,
              created_at: "2026-02-24T09:00:00.000Z",
            },
          ],
        },
      ],
      "seller-1",
      {},
      {
        fallbackCarTitle: "Anunț",
        incomingLabel: "Cumpărător",
        outgoingLabel: "Vânzător",
        userLabel: "Tu",
      },
    );

    expect(conversations[0].carTitle).toBe("Anunț");
    expect(conversations[0].carPhoto).toBe("/placeholder-car.jpg");
    expect(conversations[0].counterpartyName).toBe("Tu");
    expect(conversations[0].canQualify).toBe(false);
  });
});
