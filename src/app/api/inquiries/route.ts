import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  submitInquiry,
  type InquiryInsertClient,
} from "@/lib/inquiries/submit-inquiry";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { rejectInvalidCsrfRequest } from "@/lib/security/csrf";
import { checkStrictRateLimit } from "@/lib/ratelimit";
import {
  createRateLimitIdentifier,
  getClientIp,
} from "@/lib/request-fingerprint";
import { resolveMarketCodeFromHost } from "@/config/markets";


const SubmitInquirySchema = z.object({
  adId: z.string().uuid(),
  recipientId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
  captchaToken: z.string().min(1).max(2048),
});

const DeleteInquirySchema = z.object({
  inquiryId: z.string().uuid(),
});

const UpdateInquiryQualificationSchema = z.object({
  inquiryId: z.string().uuid(),
  isQualified: z.boolean(),
});

function getRequestHostname(request: NextRequest): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.hostname;
  return host.split(":")[0]?.toLowerCase() || null;
}

function getInquiryWriteRateLimitIdentifier(request: NextRequest): string {
  return createRateLimitIdentifier("inquiries_write", request.headers);
}

export async function POST(request: NextRequest) {
  const csrfError = rejectInvalidCsrfRequest(request);
  if (csrfError) {
    return csrfError;
  }

  const rate = await checkStrictRateLimit(getInquiryWriteRateLimitIdentifier(request));
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = SubmitInquirySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné údaje správy." }, { status: 400 });
  }

  const supabase = await createClient();
  const marketCode = resolveMarketCodeFromHost(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host,
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  if (adError || !ad) {
    return NextResponse.json({ error: "Inzerát sa nenašiel." }, { status: 404 });
  }

  const isAdSeller = ad.seller_id === user.id;
  const recipientId = parsed.data.recipientId || ad.seller_id;
  const isSelfDirected = recipientId === user.id;

  if (!recipientId) {
    return NextResponse.json(
      { error: "Nie je možné odoslať správu tomuto prijemcovi." },
      { status: 400 },
    );
  }

  if (!isAdSeller && recipientId !== ad.seller_id) {
    return NextResponse.json(
      { error: "Správu pre tento inzerát môžete odoslať iba predajcovi." },
      { status: 403 },
    );
  }

  if (isAdSeller && !isSelfDirected) {
    const { count, error: pairError } = await supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("ad_id", parsed.data.adId)
      .or(
        `sender_id.eq.${recipientId},recipient_id.eq.${recipientId}`,
      );

    if (pairError || !count) {
      return NextResponse.json(
        { error: "Na odpoveď je potrebná existujúca konverzácia." },
        { status: 400 },
      );
    }
  }

  const result = await submitInquiry(supabase as unknown as InquiryInsertClient, {
    adId: parsed.data.adId,
    senderId: user.id,
    recipientId,
    message: parsed.data.message,
    phone: null,
  });

  if (!result.ok) {
    const status = result.error.includes("Príliš veľa správ") ? 429 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { ok: true, inquiryId: result.inquiryId },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  const csrfError = rejectInvalidCsrfRequest(request);
  if (csrfError) {
    return csrfError;
  }

  const rate = await checkStrictRateLimit(getInquiryWriteRateLimitIdentifier(request));
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = DeleteInquirySchema.safeParse(query);

  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné ID správy." }, { status: 400 });
  }

  const supabase = await createClient();
  const marketCode = resolveMarketCodeFromHost(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host,
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inquiryForMarket } = await supabase
    .from("inquiries")
    .select("id, ads!inner(market_code)")
    .eq("id", parsed.data.inquiryId)
    .eq("ads.market_code", marketCode)
    .maybeSingle();

  if (!inquiryForMarket) {
    return NextResponse.json({ error: "Správa sa nenašla." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("inquiries")
    .delete()
    .eq("id", parsed.data.inquiryId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Správa sa nenašla." }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  const csrfError = rejectInvalidCsrfRequest(request);
  if (csrfError) {
    return csrfError;
  }

  const rate = await checkStrictRateLimit(getInquiryWriteRateLimitIdentifier(request));
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = UpdateInquiryQualificationSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné údaje dopytu." }, { status: 400 });
  }

  const supabase = await createClient();
  const marketCode = resolveMarketCodeFromHost(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host,
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: inquiry, error: inquiryError } = await supabase
    .from("inquiries")
    .select("id, ad_id, is_qualified, ads!inner(seller_id, market_code)")
    .eq("id", parsed.data.inquiryId)
    .eq("ads.market_code", marketCode)
    .maybeSingle();

  if (inquiryError || !inquiry) {
    return NextResponse.json({ error: "Dopyt sa nenašiel." }, { status: 404 });
  }

  const adValue = Array.isArray(inquiry.ads) ? inquiry.ads[0] : inquiry.ads;
  if (!adValue || adValue.seller_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const { data: updatedInquiry, error: updateError } = await supabase
    .from("inquiries")
    .update({
      is_qualified: parsed.data.isQualified,
      qualified_at: parsed.data.isQualified ? nowIso : null,
      qualified_by: parsed.data.isQualified ? user.id : null,
    })
    .eq("id", parsed.data.inquiryId)
    .select("id, ad_id, is_qualified")
    .maybeSingle();

  if (updateError || !updatedInquiry) {
    return NextResponse.json(
      { error: updateError?.message || "Nepodarilo sa upraviť dopyt." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      inquiryId: updatedInquiry.id,
      adId: updatedInquiry.ad_id,
      isQualified: updatedInquiry.is_qualified,
      wasQualifiedBefore: Boolean(inquiry.is_qualified),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
