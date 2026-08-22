import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BRAND_URL } from "@/config/brand";
import {
  MARKET_DEFINITIONS,
  resolveMarketCodeFromHost,
} from "@/config/markets";
import {
  isWebVitalMetricName,
  normalizeMetricValue,
  normalizeRoutePath,
} from "@/lib/performance/slo";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/ratelimit";
import { createRateLimitIdentifier } from "@/lib/request-fingerprint";


const MAX_BODY_BYTES = 8_192;

const webVitalPayloadSchema = z
  .object({
    id: z.string().trim().min(1).max(128).optional(),
    name: z.string().trim(),
    value: z.number(),
    rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
    delta: z.number().optional(),
    navigationType: z.string().trim().max(64).optional(),
    route: z.string().trim().max(180).optional(),
    pathname: z.string().trim().max(180).optional(),
  })
  .passthrough();

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(): Set<string> {
  const candidates = [
    BRAND_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ];

  const allowed = new Set<string>();
  for (const market of MARKET_DEFINITIONS) {
    allowed.add(market.origin);
    for (const host of market.hosts) {
      allowed.add(`https://${host}`);
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const origin = normalizeOrigin(candidate);
    if (origin) allowed.add(origin);
  }

  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }

  return allowed;
}

export async function POST(request: NextRequest) {
  try {
    const rate = await checkRateLimit(
      createRateLimitIdentifier("web_vitals_ingest", request.headers),
    );
    if (!rate.success) {
      return new NextResponse(null, { status: 204 });
    }

    const requestOrigin = normalizeOrigin(request.headers.get("origin"));
    const allowedOrigins = getAllowedOrigins();
    const deploymentOrigin = normalizeOrigin(request.nextUrl.origin);
    if (deploymentOrigin) {
      allowedOrigins.add(deploymentOrigin);
    }

    if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const rawBody = await request.text();
    if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const parsed = webVitalPayloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const metricName = parsed.data.name;
    if (!isWebVitalMetricName(metricName)) {
      return new NextResponse(null, { status: 204 });
    }

    const metricValue = normalizeMetricValue(parsed.data.value);
    const route = normalizeRoutePath(parsed.data.route ?? parsed.data.pathname);
    if (metricValue === null || !route) {
      return new NextResponse(null, { status: 204 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return new NextResponse(null, { status: 204 });
    }

    const { error } = await supabase.from("web_vitals").insert({
      market_code: resolveMarketCodeFromHost(
        request.headers.get("x-forwarded-host") ??
          request.headers.get("host") ??
          request.nextUrl.host,
      ),
      metric_name: metricName,
      metric_value: metricValue,
      route,
      rating: parsed.data.rating || null,
      metric_id: parsed.data.id || null,
      metric_delta: normalizeMetricValue(parsed.data.delta),
      navigation_type: parsed.data.navigationType || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Failed to persist web-vital metric", error);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Unexpected web-vital ingestion failure", error);
    return new NextResponse(null, { status: 204 });
  }
}
