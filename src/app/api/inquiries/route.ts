import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  submitInquiry,
  type InquiryInsertClient,
} from "@/lib/inquiries/submit-inquiry";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { rejectInvalidCsrfRequest } from "@/lib/security/csrf";
import { checkRateLimit, checkStrictRateLimit } from "@/lib/ratelimit";
import {
  createRateLimitIdentifier,
  getClientIp,
} from "@/lib/request-fingerprint";
import { resolveMarketCodeFromHost } from "@/config/markets";

const SubmitInquirySchema = z
  .object({
    adId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(2000),
    captchaToken: z.string().min(1).max(2048).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.adId) === Boolean(value.conversationId)) {
      context.addIssue({
        code: "custom",
        message: "Provide exactly one message destination.",
      });
    }
    if (value.adId && !value.captchaToken) {
      context.addIssue({
        code: "custom",
        message: "Captcha is required for a new inquiry.",
      });
    }
  });

const ArchiveConversationSchema = z.object({
  conversationId: z.string().uuid(),
});

const UpdateConversationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("read"),
    conversationId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("qualification"),
    conversationId: z.string().uuid(),
    isQualified: z.boolean(),
  }),
]);

type ConversationRecord = {
  id: string;
  ad_id: string;
  buyer_id: string;
  seller_id: string;
  is_qualified?: boolean;
};

function getRequestHostname(request: NextRequest): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.hostname;
  return host.split(":")[0]?.toLowerCase() || null;
}

function getMarketCode(request: NextRequest) {
  return resolveMarketCodeFromHost(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host,
  );
}

function getInquiryWriteRateLimitIdentifier(request: NextRequest): string {
  return createRateLimitIdentifier("inquiries_write", request.headers);
}

function rateLimitResponse(reset: number) {
  return NextResponse.json(
    { error: "Too many attempts. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
      },
    },
  );
}

function getConversationRecipient(conversation: ConversationRecord, userId: string) {
  if (conversation.buyer_id === userId) return conversation.seller_id;
  if (conversation.seller_id === userId) return conversation.buyer_id;
  return null;
}

async function findConversationForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  marketCode: string,
): Promise<ConversationRecord | null> {
  const { data } = await supabase
    .from("inquiry_conversations")
    .select("id, ad_id, buyer_id, seller_id, is_qualified, ads!inner(market_code)")
    .eq("id", conversationId)
    .eq("ads.market_code", marketCode)
    .maybeSingle();

  return data as ConversationRecord | null;
}

export async function POST(request: NextRequest) {
  const csrfError = rejectInvalidCsrfRequest(request);
  if (csrfError) return csrfError;

  const payload = await request.json().catch(() => null);
  const parsed = SubmitInquirySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné údaje správy." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isReply = Boolean(parsed.data.conversationId);
  const rate = isReply
    ? await checkRateLimit(`inquiry_reply:${user.id}`)
    : await checkStrictRateLimit(getInquiryWriteRateLimitIdentifier(request));
  if (!rate.success) return rateLimitResponse(rate.reset);

  const marketCode = getMarketCode(request);
  let conversation: ConversationRecord | null = null;
  let adId: string | null = null;
  let recipientId: string | null = null;

  if (parsed.data.conversationId) {
    conversation = await findConversationForUser(
      supabase,
      parsed.data.conversationId,
      marketCode,
    );
    recipientId = conversation
      ? getConversationRecipient(conversation, user.id)
      : null;
    adId = conversation?.ad_id ?? null;

    if (!conversation || !recipientId) {
      return NextResponse.json({ error: "Konverzácia sa nenašla." }, { status: 404 });
    }
  } else if (parsed.data.adId && parsed.data.captchaToken) {
    const captcha = await verifyTurnstileToken({
      token: parsed.data.captchaToken,
      remoteIp: getClientIp(request.headers),
      action: "inquiry_submit",
      expectedHostname: getRequestHostname(request),
    });
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 });
    }

    const { data: ad, error: adError } = await supabase
      .from("ads")
      .select("id, seller_id")
      .eq("id", parsed.data.adId)
      .eq("market_code", marketCode)
      .single();
    if (adError || !ad?.seller_id) {
      return NextResponse.json({ error: "Inzerát sa nenašiel." }, { status: 404 });
    }

    adId = ad.id;
    recipientId = ad.seller_id;
  }

  if (!adId || !recipientId) {
    return NextResponse.json({ error: "Neplatné údaje správy." }, { status: 400 });
  }

  const result = await submitInquiry(supabase as unknown as InquiryInsertClient, {
    conversationId: conversation?.id ?? null,
    adId,
    senderId: user.id,
    recipientId,
    message: parsed.data.message,
    phone: null,
  });
  if (!result.ok) {
    const status = result.error.includes("Príliš veľa") ? 429 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      inquiryId: result.conversationId,
      conversationId: result.conversationId,
      messageId: result.inquiryId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  const csrfError = rejectInvalidCsrfRequest(request);
  if (csrfError) return csrfError;

  const parsed = ArchiveConversationSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné ID konverzácie." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await checkStrictRateLimit(getInquiryWriteRateLimitIdentifier(request));
  if (!rate.success) return rateLimitResponse(rate.reset);

  const conversation = await findConversationForUser(
    supabase,
    parsed.data.conversationId,
    getMarketCode(request),
  );
  if (!conversation || !getConversationRecipient(conversation, user.id)) {
    return NextResponse.json({ error: "Konverzácia sa nenašla." }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Messaging service is unavailable." }, { status: 503 });
  }

  const now = new Date().toISOString();
  const archivePatch =
    conversation.buyer_id === user.id && conversation.seller_id === user.id
      ? { buyer_archived_at: now, seller_archived_at: now }
      : conversation.buyer_id === user.id
        ? { buyer_archived_at: now }
        : { seller_archived_at: now };
  const { error } = await admin
    .from("inquiry_conversations")
    .update(archivePatch)
    .eq("id", conversation.id);
  if (error) {
    return NextResponse.json({ error: "Konverzáciu sa nepodarilo archivovať." }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, conversationId: conversation.id },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  const csrfError = rejectInvalidCsrfRequest(request);
  if (csrfError) return csrfError;

  const payload = await request.json().catch(() => null);
  const parsed = UpdateConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné údaje konverzácie." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await checkRateLimit(`inquiry_update:${user.id}`);
  if (!rate.success) return rateLimitResponse(rate.reset);

  const conversation = await findConversationForUser(
    supabase,
    parsed.data.conversationId,
    getMarketCode(request),
  );
  if (!conversation || !getConversationRecipient(conversation, user.id)) {
    return NextResponse.json({ error: "Konverzácia sa nenašla." }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Messaging service is unavailable." }, { status: 503 });
  }

  if (parsed.data.action === "read") {
    const { error } = await admin
      .from("inquiries")
      .update({ is_read: true })
      .eq("conversation_id", conversation.id)
      .eq("recipient_id", user.id)
      .eq("is_read", false);
    if (error) {
      return NextResponse.json({ error: "Správy sa nepodarilo označiť ako prečítané." }, { status: 400 });
    }

    return NextResponse.json(
      { ok: true, conversationId: conversation.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (conversation.seller_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: updatedConversation, error } = await admin
    .from("inquiry_conversations")
    .update({
      is_qualified: parsed.data.isQualified,
      qualified_at: parsed.data.isQualified ? now : null,
      qualified_by: parsed.data.isQualified ? user.id : null,
    })
    .eq("id", conversation.id)
    .select("id, ad_id, is_qualified")
    .maybeSingle();
  if (error || !updatedConversation) {
    return NextResponse.json(
      { error: "Nepodarilo sa upraviť dopyt." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      conversationId: updatedConversation.id,
      inquiryId: updatedConversation.id,
      adId: updatedConversation.ad_id,
      isQualified: updatedConversation.is_qualified,
      wasQualifiedBefore: Boolean(conversation.is_qualified),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
