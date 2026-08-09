const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
const TURNSTILE_VERIFY_TIMEOUT_MS = 10_000;

type TurnstileApiResponse = {
  success: boolean;
  "error-codes"?: string[];
  action?: string;
  hostname?: string;
  metadata?: {
    result_with_testing_key?: boolean;
  };
};

type VerifyTurnstileTokenInput = {
  token: string;
  remoteIp?: string | null;
  action?: string | null;
  expectedHostname?: string | null;
};

type VerifyTurnstileTokenResult =
  | { ok: true }
  | { ok: false; error: string };

type ResolvedTurnstileSecret = {
  secret: string;
  isTestingSecret: boolean;
};

function isProductionRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv) {
    return vercelEnv === "production";
  }

  return process.env.NODE_ENV === "production";
}

function resolveTurnstileSecret(): ResolvedTurnstileSecret | null {
  const configured = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (configured) {
    if (configured === TURNSTILE_TEST_SECRET_KEY && isProductionRuntime()) {
      return null;
    }

    return {
      secret: configured,
      isTestingSecret: configured === TURNSTILE_TEST_SECRET_KEY,
    };
  }

  if (isProductionRuntime()) {
    return null;
  }

  return {
    secret: TURNSTILE_TEST_SECRET_KEY,
    isTestingSecret: true,
  };
}

function normalizeHostname(hostname: string | null | undefined): string | null {
  const value = hostname?.trim().toLowerCase();
  if (!value) {
    return null;
  }

  return value.split(":")[0] || null;
}

function responseFieldMatches({
  actual,
  expected,
  requireWhenMissing,
}: {
  actual: string | null | undefined;
  expected: string | null | undefined;
  requireWhenMissing: boolean;
}): boolean {
  const normalizedExpected = expected?.trim();
  if (!normalizedExpected) {
    return true;
  }

  const normalizedActual = actual?.trim();
  if (!normalizedActual) {
    return !requireWhenMissing;
  }

  return normalizedActual === normalizedExpected;
}

export async function verifyTurnstileToken(
  input: VerifyTurnstileTokenInput,
): Promise<VerifyTurnstileTokenResult> {
  const token = input.token.trim();
  if (!token || token.length > TURNSTILE_TOKEN_MAX_LENGTH) {
    return { ok: false, error: "Captcha token chyba." };
  }

  const resolvedSecret = resolveTurnstileSecret();
  if (!resolvedSecret) {
    return {
      ok: false,
      error: "Captcha nie je správne nakonfigurovaná.",
    };
  }

  const payload = new URLSearchParams({
    secret: resolvedSecret.secret,
    response: token,
  });

  if (input.remoteIp) {
    payload.set("remoteip", input.remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, error: "Overenie captcha sa nepodarilo." };
    }

    const body = (await response.json()) as TurnstileApiResponse;

    if (!body.success) {
      const details = Array.isArray(body["error-codes"])
        ? body["error-codes"].join(", ")
        : null;

      return {
        ok: false,
        error: details
          ? `Overenie captcha zlyhalo: ${details}`
          : "Overenie captcha zlyhalo.",
      };
    }

    const isTestingKeyResponse =
      resolvedSecret.isTestingSecret
      && body.metadata?.result_with_testing_key === true;
    if (isTestingKeyResponse && !isProductionRuntime()) {
      return { ok: true };
    }

    const requireResponseFields = isProductionRuntime();
    if (
      !responseFieldMatches({
        actual: body.action,
        expected: input.action,
        requireWhenMissing: requireResponseFields,
      }) ||
      !responseFieldMatches({
        actual: normalizeHostname(body.hostname),
        expected: normalizeHostname(input.expectedHostname),
        requireWhenMissing: requireResponseFields,
      })
    ) {
      return { ok: false, error: "Overenie captcha zlyhalo." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Overenie captcha sa nepodarilo." };
  }
}
