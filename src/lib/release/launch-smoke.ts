export type LaunchSmokeTarget = {
  name: string;
  endpoint: string | null;
  method: "GET";
  expectedStatus: 200;
  missingReason?: string;
};

const STATIC_LAUNCH_TARGETS: LaunchSmokeTarget[] = [
  { name: "Health Check", endpoint: "/api/health", method: "GET", expectedStatus: 200 },
  { name: "Homepage", endpoint: "/", method: "GET", expectedStatus: 200 },
  { name: "Search Results", endpoint: "/vysledky", method: "GET", expectedStatus: 200 },
  { name: "Login Page", endpoint: "/auth/login", method: "GET", expectedStatus: 200 },
  { name: "HTML Sitemap", endpoint: "/site-map", method: "GET", expectedStatus: 200 },
  { name: "XML Sitemap", endpoint: "/sitemap.xml", method: "GET", expectedStatus: 200 },
  { name: "Robots Policy", endpoint: "/robots.txt", method: "GET", expectedStatus: 200 },
  { name: "LLMs Text", endpoint: "/llms.txt", method: "GET", expectedStatus: 200 },
  {
    name: "Payment Success Shell",
    endpoint: "/platba/uspech?session_id=cs_test_release_gauntlet",
    method: "GET",
    expectedStatus: 200,
  },
];

export function buildLaunchSmokeTargets({
  listingPath,
}: {
  listingPath: string | null;
}): LaunchSmokeTarget[] {
  return [
    ...STATIC_LAUNCH_TARGETS,
    {
      name: "Real Listing From Sitemap",
      endpoint: listingPath,
      method: "GET",
      expectedStatus: 200,
      missingReason: listingPath
        ? undefined
        : "No /auto/ listing URL found in /sitemap.xml.",
    },
  ];
}

export function extractFirstListingPathFromSitemap(sitemapXml: string): string | null {
  const locPattern = /<loc>\s*([^<]+?)\s*<\/loc>/giu;

  for (const match of sitemapXml.matchAll(locPattern)) {
    const rawLoc = decodeSitemapLoc(match[1] ?? "");
    const listingPath = extractListingPath(rawLoc);

    if (listingPath) {
      return listingPath;
    }
  }

  return null;
}

function decodeSitemapLoc(value: string): string {
  return value
    .trim()
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
}

function extractListingPath(value: string): string | null {
  try {
    const url = new URL(value, "https://www.autoninja.sk");

    if (!url.pathname.startsWith("/auto/")) {
      return null;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
