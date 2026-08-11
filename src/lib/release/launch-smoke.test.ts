import { describe, expect, it } from "vitest";
import {
  buildLaunchSmokeTargets,
  extractFirstListingPathFromSitemap,
} from "./launch-smoke";

describe("launch smoke target helpers", () => {
  it("includes launch smoke routes and a sitemap listing", () => {
    const targets = buildLaunchSmokeTargets({
      listingPath: "/auto/123-test-listing",
    });
    const endpoints = targets.map((target) => target.endpoint);

    expect(endpoints).toEqual([
      "/api/health",
      "/",
      "/vysledky",
      "/auth/login",
      "/site-map",
      "/sitemap.xml",
      "/robots.txt",
      "/llms.txt",
      "/platba/uspech?session_id=cs_test_release_gauntlet",
      "/auto/123-test-listing",
    ]);
    expect(targets.every((target) => target.method === "GET")).toBe(true);
    expect(targets.every((target) => target.expectedStatus === 200)).toBe(true);
  });

  it("records a failing listing target when sitemap has no listing", () => {
    const targets = buildLaunchSmokeTargets({ listingPath: null });
    const listingTarget = targets.at(-1);

    expect(listingTarget?.name).toBe("Real Listing From Sitemap");
    expect(listingTarget?.endpoint).toBeNull();
    expect(listingTarget?.missingReason).toMatch(/No \/auto\/ listing URL/u);
  });

  it("returns the first /auto/ path from a sitemap", () => {
    const sitemap = [
      "<urlset>",
      "<url><loc>https://www.autoninja.sk/vysledky</loc></url>",
      "<url><loc>https://www.autoninja.sk/auto/abc-123</loc></url>",
      "<url><loc>https://www.autoninja.sk/auto/def-456</loc></url>",
      "</urlset>",
    ].join("");

    expect(extractFirstListingPathFromSitemap(sitemap)).toBe("/auto/abc-123");
  });

  it("ignores invalid URLs and non-listing routes", () => {
    const sitemap = [
      "<urlset>",
      "<url><loc>not a url</loc></url>",
      "<url><loc>https://www.autoninja.sk/vysledky</loc></url>",
      "</urlset>",
    ].join("");

    expect(extractFirstListingPathFromSitemap(sitemap)).toBeNull();
  });
});
