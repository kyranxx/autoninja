interface CspBuildOptions {
  isDev: boolean;
  enableGoogleOneTap: boolean;
  enableVercelLiveFeedback?: boolean;
  includeUpgradeInsecureRequests: boolean;
  publicSupabaseUrl?: string | null;
  posthogHost?: string | null;
}

const OPENSTREETMAP_TILE_SOURCES = [
  "https://tile.openstreetmap.org",
  "https://a.tile.openstreetmap.org",
  "https://b.tile.openstreetmap.org",
  "https://c.tile.openstreetmap.org",
];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function joinSources(values: string[]): string {
  return unique(values).join(" ");
}

function resolveSupabaseOrigin(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function resolvePosthogAssetOrigin(url: string | null | undefined): string | null {
  const origin = resolveSupabaseOrigin(url);
  if (!origin) {
    return null;
  }

  return origin.replace(".i.posthog.com", "-assets.i.posthog.com");
}

export function buildCspHeader({
  isDev,
  enableGoogleOneTap,
  enableVercelLiveFeedback = false,
  includeUpgradeInsecureRequests,
  publicSupabaseUrl,
  posthogHost,
}: CspBuildOptions): string {
  const resolvedSupabaseOrigin = resolveSupabaseOrigin(publicSupabaseUrl);
  const resolvedPosthogOrigin = resolveSupabaseOrigin(posthogHost);
  const resolvedPosthogAssetOrigin = resolvePosthogAssetOrigin(posthogHost);
  const supabaseImgSrc = [
    "https://*.supabase.co",
    ...(resolvedSupabaseOrigin ? [resolvedSupabaseOrigin] : []),
  ];
  const supabaseConnectSrc = [
    "https://*.supabase.co",
    "wss://*.supabase.co",
    ...(resolvedSupabaseOrigin ? [resolvedSupabaseOrigin] : []),
    ...(resolvedSupabaseOrigin
      ? [resolvedSupabaseOrigin.replace(/^https:/, "wss:")]
      : []),
  ];

  const scriptSrc = joinSources([
    "'self'",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    "https://*.algolia.net",
    "https://*.algolianet.com",
    "https://js.stripe.com",
    "https://www.googletagmanager.com",
    "https://www.clarity.ms",
    "https://scripts.clarity.ms",
    "https://c.bing.com",
    "https://challenges.cloudflare.com",
    ...(resolvedPosthogOrigin ? [resolvedPosthogOrigin] : []),
    ...(resolvedPosthogAssetOrigin ? [resolvedPosthogAssetOrigin] : []),
    ...(enableGoogleOneTap ? ["https://accounts.google.com"] : []),
    ...(enableVercelLiveFeedback ? ["https://vercel.live"] : []),
  ]);

  const styleSrc = joinSources([
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
    ...(enableGoogleOneTap ? ["https://accounts.google.com"] : []),
  ]);

  const imgSrc = joinSources([
    "'self'",
    "data:",
    "blob:",
    "https://imagedelivery.net",
    ...supabaseImgSrc,
    ...OPENSTREETMAP_TILE_SOURCES,
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://stats.g.doubleclick.net",
    "https://www.clarity.ms",
    "https://c.bing.com",
  ]);

  const fontSrc = joinSources(["'self'", "data:", "https://fonts.gstatic.com"]);

  const connectSrc = joinSources([
    "'self'",
    ...supabaseConnectSrc,
    "https://*.algolia.net",
    "https://*.algolianet.com",
    "https://api.stripe.com",
    "https://upload.imagedelivery.net",
    "https://*.upstash.io",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://stats.g.doubleclick.net",
    "https://www.clarity.ms",
    "https://y.clarity.ms",
    "https://c.bing.com",
    "https://challenges.cloudflare.com",
    ...OPENSTREETMAP_TILE_SOURCES,
    ...(resolvedPosthogOrigin ? [resolvedPosthogOrigin] : []),
    ...(resolvedPosthogAssetOrigin ? [resolvedPosthogAssetOrigin] : []),
    ...(enableGoogleOneTap ? ["https://accounts.google.com"] : []),
    ...(enableVercelLiveFeedback ? ["https://vercel.live"] : []),
  ]);

  const frameSrc = joinSources([
    "'self'",
    "https://js.stripe.com",
    "https://hooks.stripe.com",
    "https://challenges.cloudflare.com",
    ...(enableGoogleOneTap ? ["https://accounts.google.com"] : []),
  ]);

  const formAction = joinSources([
    "'self'",
    ...(enableGoogleOneTap ? ["https://accounts.google.com"] : []),
  ]);

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `img-src ${imgSrc}`,
    `font-src ${fontSrc}`,
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    "frame-ancestors 'self'",
    `form-action ${formAction}`,
    "base-uri 'self'",
    "object-src 'none'",
    includeUpgradeInsecureRequests ? "upgrade-insecure-requests" : null,
  ].filter((value): value is string => Boolean(value));

  return directives.join("; ");
}
