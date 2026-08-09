import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "./turnstile";

describe("verifyTurnstileToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns validation error when token is empty", async () => {
    const result = await verifyTurnstileToken({ token: "   " });

    expect(result).toEqual({ ok: false, error: "Captcha token chyba." });
  });

  it("rejects tokens longer than Cloudflare's maximum before verification", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken({ token: "x".repeat(2049) });

    expect(result).toEqual({ ok: false, error: "Captcha token chyba." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns error when verification endpoint does not respond with ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false }),
      }),
    );

    const result = await verifyTurnstileToken({ token: "token-1" });

    expect(result).toEqual({
      ok: false,
      error: "Overenie captcha sa nepodarilo.",
    });
  });

  it("returns success when captcha verification succeeds", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutSignal);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        action: "inquiry_submit",
        hostname: "www.autoninja.sk",
      }),
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const result = await verifyTurnstileToken({
      token: "token-2",
      remoteIp: "127.0.0.1",
      action: "inquiry_submit",
      expectedHostname: "www.autoninja.sk",
    });

    expect(result).toEqual({ ok: true });
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body as string;
    expect(requestBody).toContain("secret=");
    expect(requestBody).toContain("response=token-2");
    expect(requestBody).toContain("remoteip=127.0.0.1");
    expect(requestBody).not.toContain("action=");
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(timeoutSignal);
  });

  it("accepts Cloudflare testing-key responses in local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          hostname: "example.com",
          metadata: { result_with_testing_key: true },
        }),
      }),
    );

    const result = await verifyTurnstileToken({
      token: "dummy-token",
      action: "inquiry_submit",
      expectedHostname: "localhost",
    });

    expect(result).toEqual({ ok: true });
  });

  it("accepts Cloudflare testing-key responses in Vercel Preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          hostname: "example.com",
          metadata: { result_with_testing_key: true },
        }),
      }),
    );

    const result = await verifyTurnstileToken({
      token: "dummy-token",
      action: "inquiry_submit",
      expectedHostname: "autoninja-preview.vercel.app",
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects Cloudflare testing keys in Vercel Production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken({
      token: "dummy-token",
      action: "inquiry_submit",
      expectedHostname: "www.autoninja.sk",
    });

    expect(result).toEqual({
      ok: false,
      error: "Captcha nie je správne nakonfigurovaná.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed in Vercel Production when successful responses omit action or hostname", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "real-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
        }),
      }),
    );

    const result = await verifyTurnstileToken({
      token: "real-token",
      action: "inquiry_submit",
      expectedHostname: "www.autoninja.sk",
    });

    expect(result).toEqual({
      ok: false,
      error: "Overenie captcha zlyhalo.",
    });
  });

  it("rejects a successful token with the wrong action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          action: "listing_report_submit",
          hostname: "www.autoninja.sk",
        }),
      }),
    );

    const result = await verifyTurnstileToken({
      token: "token-action",
      action: "inquiry_submit",
      expectedHostname: "www.autoninja.sk",
    });

    expect(result).toEqual({
      ok: false,
      error: "Overenie captcha zlyhalo.",
    });
  });

  it("rejects a successful token from the wrong hostname", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          action: "inquiry_submit",
          hostname: "evil.example",
        }),
      }),
    );

    const result = await verifyTurnstileToken({
      token: "token-host",
      action: "inquiry_submit",
      expectedHostname: "www.autoninja.sk",
    });

    expect(result).toEqual({
      ok: false,
      error: "Overenie captcha zlyhalo.",
    });
  });

  it("fails closed in production when TURNSTILE_SECRET_KEY is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken({ token: "token-3" });

    expect(result).toEqual({
      ok: false,
      error: "Captcha nie je správne nakonfigurovaná.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
