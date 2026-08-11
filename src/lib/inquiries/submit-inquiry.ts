type InquiryInsertRow = {
  conversation_id: string | null;
  ad_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  phone: string | null;
};

type SubmitInquiryInput = {
  conversationId?: string | null;
  adId: string;
  senderId: string;
  recipientId: string;
  message: string;
  phone?: string | null;
};

type SubmitInquiryResult =
  | { ok: true; inquiryId: string; conversationId: string }
  | { ok: false; error: string };

type SupabaseInsertRowResult = {
  data: { id: string; conversation_id: string } | null;
  error: { message?: string } | null;
};

export interface InquiryInsertClient {
  from(table: "inquiries"): {
    insert(payload: InquiryInsertRow): {
      select(columns: "id,conversation_id"): {
        single(): PromiseLike<SupabaseInsertRowResult>;
      };
    };
  };
}

const DEFAULT_SUBMIT_ERROR = "Nepodarilo sa odoslať dopyt.";

export function normalizeInquiryMessage(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\u3000/g, " ").trim();
}

export async function submitInquiry(
  client: InquiryInsertClient,
  input: SubmitInquiryInput,
): Promise<SubmitInquiryResult> {
  const message = normalizeInquiryMessage(input.message);

  if (!message) {
    return { ok: false, error: "Správa nemoze byt prazdna." };
  }

  const { data, error } = await client
    .from("inquiries")
    .insert({
      conversation_id: input.conversationId ?? null,
      ad_id: input.adId,
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      message,
      phone: input.phone ?? null,
    })
    .select("id,conversation_id")
    .single();

  if (error) {
    if (error.message?.includes("Prilis vela")) {
      return {
        ok: false,
        error: "Príliš veľa správ za krátky čas. Skúste to znova o pár minút.",
      };
    }
    return { ok: false, error: error.message || DEFAULT_SUBMIT_ERROR };
  }

  if (!data?.id || !data.conversation_id) {
    return { ok: false, error: DEFAULT_SUBMIT_ERROR };
  }

  return {
    ok: true,
    inquiryId: data.id,
    conversationId: data.conversation_id,
  };
}
