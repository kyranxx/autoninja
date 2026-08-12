import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateAnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsEventPayload,
} from "@/lib/analytics/events";

const GA_MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";

function createGaClientId(): string {
  const randomPart = crypto.getRandomValues(new Uint32Array(1))[0];
  const timestampPart = Math.floor(Date.now() / 1000);

  return `${randomPart}.${timestampPart}`;
}

async function forwardToMeasurementProtocol(
  name: string,
  payload: Record<string, unknown>,
  userId?: string,
) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const apiSecret = process.env.GA_MEASUREMENT_PROTOCOL_API_SECRET?.trim();

  if (!measurementId || !apiSecret) return;

  try {
    const body = JSON.stringify({
      client_id: createGaClientId(),
      ...(userId ? { user_id: userId } : {}),
      events: [
        {
          name,
          params: payload,
        },
      ],
    });

    await fetch(
      `${GA_MP_ENDPOINT}?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        cache: "no-store",
      },
    );
  } catch {
    // Best-effort forwarding; do not block the caller.
  }
}

export async function recordServerAnalyticsEvent<Name extends AnalyticsEventName>(
  name: Name,
  payload: AnalyticsEventPayload<Name>,
  userId?: string,
): Promise<boolean> {
  const validated = validateAnalyticsEvent(name, payload);
  if (!validated.success) {
    console.error("Invalid server analytics payload", name, validated.error.flatten());
    return false;
  }

  const admin = createAdminClient();
  if (!admin) {
    console.warn("Server analytics skipped because admin client is unavailable.");
    return false;
  }

  const { error } = await admin.from("analytics_events").insert({
    event_name: name,
    payload: validated.data,
    page_path: null,
    page_url: null,
    page_title: null,
    referrer: null,
  });

  if (error) {
    console.error("Server analytics event insert failed:", error);
    return false;
  }

  void forwardToMeasurementProtocol(name, validated.data as Record<string, unknown>, userId);

  return true;
}
