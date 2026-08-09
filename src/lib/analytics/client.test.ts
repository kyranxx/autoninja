import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { identifyAnalyticsUser, trackAnalyticsEvent } from "@/lib/analytics/client";

describe("trackAnalyticsEvent", () => {
  const sendBeacon = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    delete (window as Window & { dataLayer?: unknown }).dataLayer;
    delete (window as Window & { gtag?: unknown }).gtag;
    delete (window as Window & { clarity?: unknown }).clarity;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes each accepted event through first-party ingestion once", () => {
    window.localStorage.setItem(
      "autoninja_cookie_consent",
      JSON.stringify({ analytics: true }),
    );

    const result = trackAnalyticsEvent("listing_viewed", {
      adId: "f6d65fa7-1f26-4932-94f4-5a5683238e97",
      source: "seo_city_route",
      position: 1,
    });

    expect(result).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith(
      "/api/analytics/events",
      expect.any(Blob),
    );
    const dataLayer = (window as Window & { dataLayer?: Array<Record<string, unknown>> })
      .dataLayer;
    expect(dataLayer).toBeDefined();
    expect(dataLayer).toHaveLength(1);
    expect(dataLayer?.[0]).toMatchObject({
      event: "listing_viewed",
      source: "seo_city_route",
      position: 1,
    });
  });

  it("returns false when consent is missing", () => {
    const result = trackAnalyticsEvent("listing_viewed", {
      adId: "f6d65fa7-1f26-4932-94f4-5a5683238e97",
      source: "seo_model_route",
      position: 2,
    });

    expect(result).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
    const dataLayer = (window as Window & { dataLayer?: Array<Record<string, unknown>> })
      .dataLayer;
    expect(dataLayer).toBeUndefined();
  });

  it("returns false for invalid payload and does not push", () => {
    window.localStorage.setItem(
      "autoninja_cookie_consent",
      JSON.stringify({ analytics: true }),
    );

    const result = trackAnalyticsEvent("listing_viewed", {
      adId: "not-a-uuid",
      source: "seo_model_route",
    } as never);

    expect(result).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
    const dataLayer = (window as Window & { dataLayer?: Array<Record<string, unknown>> })
      .dataLayer;
    expect(dataLayer).toBeUndefined();
  });

  it("sets and clears analytics identity for configured vendors", () => {
    const gtag = vi.fn();
    const clarity = vi.fn();
    (window as Window & { gtag?: typeof gtag }).gtag = gtag;
    (window as Window & { clarity?: typeof clarity }).clarity = clarity;
    window.localStorage.setItem(
      "autoninja_cookie_consent",
      JSON.stringify({ analytics: true }),
    );

    identifyAnalyticsUser("user-123");

    expect(gtag).toHaveBeenCalledWith("set", { user_id: "user-123" });
    expect(clarity).toHaveBeenCalledWith("identify", "user-123");

    identifyAnalyticsUser(null);

    expect(gtag).toHaveBeenCalledWith("set", { user_id: null });
  });
});
