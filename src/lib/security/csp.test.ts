import { describe, expect, it } from "vitest";
import { buildCspHeader } from "@/lib/security/csp";

describe("buildCspHeader", () => {
  it("includes core directives in production mode", () => {
    const csp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
    });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src");
    expect(csp).toContain("frame-src");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("accounts.google.com");
  });

  it("allows Cloudflare Images direct creator uploads", () => {
    const csp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
    });

    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://upload.imagedelivery.net");
  });

  it("allows the Microsoft Clarity script delivery host", () => {
    const csp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
    });

    expect(csp).toContain("script-src");
    expect(csp).toContain("https://scripts.clarity.ms");
  });

  it("allows the observed Microsoft Clarity collector only for connections", () => {
    const csp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
    });

    expect(csp).toMatch(/connect-src [^;]*https:\/\/y\.clarity\.ms/);
    expect(csp).not.toMatch(/script-src [^;]*https:\/\/y\.clarity\.ms/);
  });

  it("allows Google Analytics transport pixels and connections", () => {
    const csp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
    });

    expect(csp).toMatch(/img-src [^;]*https:\/\/www\.googletagmanager\.com/);
    expect(csp).toMatch(/img-src [^;]*https:\/\/www\.google-analytics\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/www\.googletagmanager\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/www\.google-analytics\.com/);
  });

  it("enables Google One Tap origins only when explicitly enabled", () => {
    const withoutGoogle = buildCspHeader({
      isDev: true,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: false,
      publicSupabaseUrl: null,
    });
    const withGoogle = buildCspHeader({
      isDev: true,
      enableGoogleOneTap: true,
      includeUpgradeInsecureRequests: false,
      publicSupabaseUrl: null,
    });

    expect(withoutGoogle).not.toContain("https://accounts.google.com");
    expect(withGoogle).toContain("https://accounts.google.com");
    expect(withGoogle).toMatch(
      /style-src [^;]*https:\/\/accounts\.google\.com/,
    );
  });

  it("allows a branded Supabase domain in img and connect sources", () => {
    const csp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: "https://auth.autoninja.sk",
    });

    expect(csp).toContain("img-src");
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://auth.autoninja.sk");
    expect(csp).toContain("wss://auth.autoninja.sk");
  });

  it("allows OpenStreetMap tile hosts for both image and fetch requests", () => {
    const csp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
    });

    expect(csp).toContain("img-src");
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://tile.openstreetmap.org");
    expect(csp).toContain("https://a.tile.openstreetmap.org");
    expect(csp).toContain("https://b.tile.openstreetmap.org");
    expect(csp).toContain("https://c.tile.openstreetmap.org");
  });

  it("allows PostHog asset fetches in both script and connect sources", () => {
    const csp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
      posthogHost: "https://us.i.posthog.com",
    });

    expect(csp).toContain("script-src");
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://us.i.posthog.com");
    expect(csp).toContain("https://us-assets.i.posthog.com");
  });

  it("allows Vercel live feedback only when preview feedback is enabled", () => {
    const productionCsp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      enableVercelLiveFeedback: false,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
    });
    const previewCsp = buildCspHeader({
      isDev: false,
      enableGoogleOneTap: false,
      enableVercelLiveFeedback: true,
      includeUpgradeInsecureRequests: true,
      publicSupabaseUrl: null,
    });

    expect(productionCsp).not.toContain("https://vercel.live");
    expect(previewCsp).toContain("script-src");
    expect(previewCsp).toContain("connect-src");
    expect(previewCsp).toContain("https://vercel.live");
  });
});
