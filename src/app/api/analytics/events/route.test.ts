import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { checkRateLimitMock, createAdminClientMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import { POST } from "./route";

describe("POST /api/analytics/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    checkRateLimitMock.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
  });

  it("persists first-party analytics in the dedicated table with the host-derived market", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    createAdminClientMock.mockReturnValue({ from });

    const response = await POST(
      new NextRequest("https://autoninja.ro/api/analytics/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "autoninja.ro",
        },
        body: JSON.stringify({
          name: "listing_viewed",
          payload: {
            adId: "f6d65fa7-1f26-4932-94f4-5a5683238e97",
            source: "direct",
          },
          context: {
            pagePath: "/auto/example",
            distinctId: "browser-id",
            marketCode: "SK",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("analytics_events");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "listing_viewed",
        market_code: "RO",
        distinct_id: "browser-id",
        page_path: "/auto/example",
      }),
    );
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });
});
