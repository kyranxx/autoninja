import { describe, expect, it } from "vitest";
import { assertLocalQaTarget } from "../../scripts/qa/local-target";

describe("assertLocalQaTarget", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ])("accepts a Supabase CLI loopback URL: %s", (url) => {
    expect(assertLocalQaTarget(url, "local-service-role-key").port).toBe(
      "54321",
    );
  });

  it.each([
    "https://project.supabase.co",
    "https://127.0.0.1:54321",
    "http://127.0.0.1:54322",
    "http://192.168.1.20:54321",
  ])("refuses non-local or unexpected targets: %s", (url) => {
    expect(() => assertLocalQaTarget(url, "service-role-key")).toThrow();
  });

  it("requires a service-role key", () => {
    expect(() => assertLocalQaTarget("http://127.0.0.1:54321", "")).toThrow(
      "QA_SUPABASE_SERVICE_ROLE_KEY is required.",
    );
  });
});
