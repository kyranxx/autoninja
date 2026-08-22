import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidAnalyticsEventName, validateAnalyticsEvent } from "@/lib/analytics/events";
import { checkRateLimit } from "@/lib/ratelimit";
import { createRateLimitIdentifier } from "@/lib/request-fingerprint";
import { resolveMarketCodeFromHost } from "@/config/markets";

const analyticsContextSchema = z
  .object({
    pagePath: z.string().trim().min(1).max(160).optional(),
    pageUrl: z.string().trim().min(1).max(500).optional(),
    pageTitle: z.string().trim().min(1).max(180).nullable().optional(),
    referrer: z.string().trim().min(1).max(500).nullable().optional(),
    distinctId: z.string().trim().min(1).max(120).optional(),
    userId: z.string().trim().min(1).max(120).nullable().optional(),
    marketCode: z.enum(["SK", "RO"]).optional(),
  })
  .optional();

const analyticsEventRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
  context: analyticsContextSchema,
});

async function forwardEventToPosthog(input: {
  name: string;
  payload: Record<string, unknown>;
  context?: z.infer<typeof analyticsContextSchema>;
}) {
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();

  if (!posthogHost || !posthogKey) {
    return;
  }

  const distinctId = input.context?.userId ?? input.context?.distinctId ?? crypto.randomUUID();
  const response = await fetch(`${posthogHost.replace(/\/$/, "")}/e/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: posthogKey,
      event: input.name,
      properties: {
        distinct_id: distinctId,
        ...input.payload,
        pagePath: input.context?.pagePath ?? null,
        pageUrl: input.context?.pageUrl ?? null,
        pageTitle: input.context?.pageTitle ?? null,
        referrer: input.context?.referrer ?? null,
        userId: input.context?.userId ?? null,
        marketCode: input.context?.marketCode ?? null,
        source: "autoninja_first_party_ingest",
        // Events are forwarded by Vercel, whose edge IP is not the visitor's.
        // Market is derived from the verified request host instead.
        $geoip_disable: true,
      },
      timestamp: new Date().toISOString(),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(`PostHog forward failed: ${response.status} ${responseText}`.trim());
  }
}

export async function POST(request: NextRequest) {
  const rate = await checkRateLimit(
    createRateLimitIdentifier("analytics_events", request.headers),
  );
  if (!rate.success) {
    return NextResponse.json(
      { accepted: false, error: "too_many_requests" },
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

  let parsedBody: z.infer<typeof analyticsEventRequestSchema>;

  try {
    const json = await request.json();
    const bodyResult = analyticsEventRequestSchema.safeParse(json);

    if (!bodyResult.success) {
      return NextResponse.json({ error: "invalid_analytics_request" }, { status: 400 });
    }

    parsedBody = bodyResult.data;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidAnalyticsEventName(parsedBody.name)) {
    return NextResponse.json({ error: "unknown_event_name" }, { status: 400 });
  }

  const payloadValidation = validateAnalyticsEvent(parsedBody.name, parsedBody.payload);
  if (!payloadValidation.success) {
    return NextResponse.json({ error: "invalid_event_payload" }, { status: 400 });
  }

  const marketCode = resolveMarketCodeFromHost(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.host,
  );
  const analyticsContext = {
    ...(parsedBody.context ?? {}),
    marketCode,
  };

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ accepted: false, degraded: true }, { status: 202 });
  }

  const { error } = await admin.from("analytics_events").insert({
    event_name: parsedBody.name,
    payload: payloadValidation.data,
    page_path: parsedBody.context?.pagePath ?? null,
    page_url: parsedBody.context?.pageUrl ?? null,
    page_title: parsedBody.context?.pageTitle ?? null,
    referrer: parsedBody.context?.referrer ?? null,
    market_code: marketCode,
    distinct_id: parsedBody.context?.distinctId ?? null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Analytics event insert failed:", error);
    return NextResponse.json({ accepted: false }, { status: 500 });
  }

  try {
    await forwardEventToPosthog({
      name: parsedBody.name,
      payload: payloadValidation.data,
      context: analyticsContext,
    });
  } catch (posthogError) {
    console.error("Analytics event PostHog forward failed:", posthogError);
  }

  return NextResponse.json({ accepted: true });
}
