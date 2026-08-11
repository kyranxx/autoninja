type InquiryAdRow = {
  id: string;
  brand: string | null;
  model: string | null;
  photos_json: string[] | null;
  seller_id: string | null;
  status: string | null;
};

export type InquiryMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type InquiryConversationRow = {
  id: string;
  ad_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_archived_at: string | null;
  seller_archived_at: string | null;
  is_qualified: boolean;
  qualified_at: string | null;
  created_at: string;
  last_message_at: string;
  ads: InquiryAdRow | null;
  inquiries: InquiryMessageRow[];
};

export type InquiryDirection = "incoming" | "outgoing";

export type InquiryMessage = {
  id: string;
  direction: InquiryDirection;
  senderName: string;
  body: string;
  createdAt: string;
  isRead: boolean;
};

export type InquiryConversation = {
  id: string;
  adId: string;
  buyerId: string;
  sellerId: string;
  counterpartyId: string;
  counterpartyName: string;
  carTitle: string;
  carPhoto: string;
  listingStatus: string;
  lastMessage: string;
  lastMessageTime: string;
  lastDirection: InquiryDirection;
  unread: number;
  isArchived: boolean;
  isQualified: boolean;
  qualifiedAt: string | null;
  canQualify: boolean;
  messages: InquiryMessage[];
};

const FALLBACK_CAR_PHOTO = "/placeholder-car.jpg";
const FALLBACK_CAR_TITLE = "Inzerát";
const INCOMING_LABEL = "Záujemca";
const OUTGOING_LABEL = "Predajca";

type InquiryConversationCopy = {
  fallbackCarTitle?: string;
  incomingLabel?: string;
  outgoingLabel?: string;
  userLabel?: string;
};

function parseDate(input: string): number {
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : 0;
}
function getCarTitle(ad: InquiryAdRow | null, fallbackCarTitle = FALLBACK_CAR_TITLE): string {
  if (!ad) return fallbackCarTitle;
  const brand = ad.brand?.trim() || "";
  const model = ad.model?.trim() || "";
  const combined = `${brand} ${model}`.trim();
  return combined || fallbackCarTitle;
}

function getCarPhoto(ad: InquiryAdRow | null): string {
  if (!ad?.photos_json || ad.photos_json.length === 0) return FALLBACK_CAR_PHOTO;
  const photo = ad.photos_json[0]?.trim();
  return photo || FALLBACK_CAR_PHOTO;
}

function getDisplayName(
  profileNames: Record<string, string>,
  profileId: string | null,
  fallback: string,
): string {
  if (!profileId) return fallback;
  const value = profileNames[profileId];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

export function getInquiryDirection(
  message: Pick<InquiryMessageRow, "sender_id">,
  currentUserId: string,
): InquiryDirection {
  return message.sender_id === currentUserId ? "outgoing" : "incoming";
}

export function mapInquiryThreadsToConversations(
  threads: InquiryConversationRow[],
  currentUserId: string,
  profileNames: Record<string, string> = {},
  copy: InquiryConversationCopy = {},
): InquiryConversation[] {
  const fallbackCarTitle = copy.fallbackCarTitle ?? FALLBACK_CAR_TITLE;
  const incomingLabel = copy.incomingLabel ?? INCOMING_LABEL;
  const outgoingLabel = copy.outgoingLabel ?? OUTGOING_LABEL;
  const userLabel = copy.userLabel ?? incomingLabel;

  return threads
    .map((thread) => {
      const isSeller = thread.seller_id === currentUserId;
      const isSelfThread = thread.buyer_id === thread.seller_id;
      const counterpartyId = isSeller ? thread.buyer_id : thread.seller_id;
      const counterpartyName = getDisplayName(
        profileNames,
        counterpartyId,
        isSelfThread ? userLabel : isSeller ? incomingLabel : outgoingLabel,
      );
      const messages = [...thread.inquiries]
        .sort((left, right) => parseDate(left.created_at) - parseDate(right.created_at))
        .map((message) => {
          const direction = getInquiryDirection(message, currentUserId);
          return {
            id: message.id,
            direction,
            senderName: getDisplayName(
              profileNames,
              message.sender_id,
              direction === "incoming" ? incomingLabel : userLabel,
            ),
            body: message.message,
            createdAt: message.created_at,
            isRead: message.is_read,
          } satisfies InquiryMessage;
        });
      const lastMessage = messages.at(-1);

      return {
        id: thread.id,
        adId: thread.ad_id,
        buyerId: thread.buyer_id,
        sellerId: thread.seller_id,
        counterpartyId,
        counterpartyName,
        carTitle: getCarTitle(thread.ads, fallbackCarTitle),
        carPhoto: getCarPhoto(thread.ads),
        listingStatus: thread.ads?.status || "unknown",
        lastMessage: lastMessage?.body || "",
        lastMessageTime: lastMessage?.createdAt || thread.last_message_at,
        lastDirection: lastMessage?.direction || "outgoing",
        unread: messages.filter(
          (message) => message.direction === "incoming" && !message.isRead,
        ).length,
        isArchived: Boolean(
          isSeller ? thread.seller_archived_at : thread.buyer_archived_at,
        ),
        isQualified: Boolean(thread.is_qualified),
        qualifiedAt: thread.qualified_at || null,
        canQualify: isSeller && !isSelfThread,
        messages,
      } satisfies InquiryConversation;
    })
    .filter((conversation) => !conversation.isArchived)
    .sort(
      (left, right) =>
        parseDate(right.lastMessageTime) - parseDate(left.lastMessageTime),
    );
}
