const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function assertLocalQaTarget(
  rawUrl: string,
  serviceRoleKey: string,
): URL {
  if (!rawUrl.trim()) {
    throw new Error("QA_SUPABASE_URL is required.");
  }

  if (!serviceRoleKey.trim()) {
    throw new Error("QA_SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error("QA_SUPABASE_URL must be a valid URL.");
  }

  if (target.protocol !== "http:") {
    throw new Error("Local QA seeding only accepts an http loopback URL.");
  }

  if (!LOCAL_HOSTS.has(target.hostname)) {
    throw new Error(
      `Refusing to seed non-local Supabase host: ${target.hostname || "unknown"}`,
    );
  }

  if (target.port !== "54321") {
    throw new Error(
      "Local QA seeding only accepts the Supabase CLI API port 54321.",
    );
  }

  return target;
}
