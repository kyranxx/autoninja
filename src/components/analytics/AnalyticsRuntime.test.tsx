import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  COOKIE_CONSENT_KEY,
} from "@/lib/privacy/cookie-consent";
import { AnalyticsRuntime } from "./AnalyticsRuntime";

const { resolveClarityProjectIdForHostMock } = vi.hoisted(() => ({
  resolveClarityProjectIdForHostMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/vysledky",
  useSearchParams: () => new URLSearchParams("sort=price"),
}));

vi.mock("@/lib/analytics/clarity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/clarity")>();
  return {
    ...actual,
    resolveClarityProjectIdForHost: resolveClarityProjectIdForHostMock,
  };
});

function grantAnalyticsConsent(marketing = false) {
  window.localStorage.setItem(
    COOKIE_CONSENT_KEY,
    JSON.stringify({
      necessary: true,
      analytics: true,
      marketing,
      timestamp: Date.now(),
    }),
  );
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT));
}

describe("AnalyticsRuntime", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    window.localStorage.clear();
    delete process.env.NEXT_PUBLIC_CLARITY_ID;
    delete process.env.NEXT_PUBLIC_CLARITY_ID_SK;
    delete process.env.NEXT_PUBLIC_CLARITY_ID_RO;
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete (window as Window & { clarity?: unknown }).clarity;
    delete (window as Window & { dataLayer?: unknown }).dataLayer;
    delete (window as Window & { gtag?: unknown }).gtag;
    resolveClarityProjectIdForHostMock.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not load Microsoft Clarity before analytics consent", () => {
    process.env.NEXT_PUBLIC_CLARITY_ID = "default123";
    resolveClarityProjectIdForHostMock.mockReturnValue("default123");

    render(<AnalyticsRuntime />);

    expect(document.querySelector('script[src^="https://www.clarity.ms/tag/"]')).toBeNull();
  });

  it("does not load Google Analytics before analytics consent", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-AUTONINJA";

    render(<AnalyticsRuntime />);

    expect(document.getElementById("ga4-script")).toBeNull();
  });

  it("loads Google Analytics and records the current App Router page after consent", async () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-AUTONINJA";

    render(<AnalyticsRuntime />);
    grantAnalyticsConsent();

    await waitFor(() => {
      expect(document.getElementById("ga4-script")).toHaveAttribute(
        "src",
        "https://www.googletagmanager.com/gtag/js?id=G-AUTONINJA",
      );
    });

    await waitFor(() => {
      const dataLayer = (window as Window & { dataLayer?: unknown[][] }).dataLayer;
      expect(dataLayer).toContainEqual([
        "event",
        "page_view",
        expect.objectContaining({
          page_path: "/vysledky?sort=price",
          send_to: "G-AUTONINJA",
        }),
      ]);
    });
  });

  it("loads Microsoft Clarity and sends consent v2 after analytics consent", async () => {
    process.env.NEXT_PUBLIC_CLARITY_ID = "default123";
    resolveClarityProjectIdForHostMock.mockReturnValue("default123");

    render(<AnalyticsRuntime />);
    grantAnalyticsConsent();

    await waitFor(() => {
      expect(
        document.getElementById("microsoft-clarity-script-default123"),
      ).toHaveAttribute("src", "https://www.clarity.ms/tag/default123");
    });

    const clarity = (window as Window & {
      clarity?: { q?: unknown[][] };
    }).clarity;

    expect(clarity?.q).toContainEqual([
      "consentv2",
      {
        ad_storage: "denied",
        analytics_storage: "granted",
      },
    ]);
    expect(resolveClarityProjectIdForHostMock).toHaveBeenCalledWith(
      window.location.host,
      {
        defaultId: "default123",
        byMarket: {
          SK: undefined,
          RO: undefined,
        },
      },
    );
  });

  it("queues the authenticated user id when Clarity starts after auth", async () => {
    const { setAnalyticsUserId } = await import("@/lib/analytics/events");
    setAnalyticsUserId("user-123");
    resolveClarityProjectIdForHostMock.mockReturnValue("default123");

    render(<AnalyticsRuntime />);
    grantAnalyticsConsent();

    await waitFor(() => {
      const clarity = (window as Window & { clarity?: { q?: unknown[][] } }).clarity;
      expect(clarity?.q).toContainEqual(["identify", "user-123"]);
    });

    setAnalyticsUserId(null);
  });
});
