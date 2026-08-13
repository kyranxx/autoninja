import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLocale, getMessages, getTimeZone, getTranslations } from "next-intl/server";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";
import { JsonLd } from "@/components/JsonLd";
import Script from "next/script";
import { BRAND_THEME } from "@/lib/theme/brand";
import { assertRuntimeEnvConfigured } from "@/lib/env";
import AppProviders from "./providers";
import { AnalyticsRuntime } from "@/components/analytics";
import { isSiteIndexingEnabled } from "@/lib/seo/crawl-policy";
import { getRequestMarketConfig } from "@/lib/market/request";
import { buildRootMetadata } from "@/lib/seo/root-metadata";
import { resolveGoogleOneTapConfig } from "@/lib/auth/google-one-tap-config";

assertRuntimeEnvConfigured("app");

const barlow = Barlow({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ab-sans",
  display: "optional",
  weight: ["400", "600", "800"],
  preload: false,
  adjustFontFallback: true,
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ab-display",
  display: "optional",
  weight: ["600", "800"],
  preload: false,
  adjustFontFallback: true,
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_THEME.primaryForeground },
    { media: "(prefers-color-scheme: dark)", color: BRAND_THEME.primary },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export async function generateMetadata(): Promise<Metadata> {
  return buildRootMetadata(await getRequestMarketConfig(), isSiteIndexingEnabled());
}

function resolveDnsPrefetchOrigins(): string[] {
  const origins = new Set<string>(["https://imagedelivery.net"]);

  const algoliaAppId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID?.trim().toLowerCase();
  if (algoliaAppId && /^[a-z0-9]+$/.test(algoliaAppId)) {
    origins.add(`https://${algoliaAppId}-dsn.algolia.net`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      origins.add(new URL(supabaseUrl).origin);
    } catch {
      // Ignore malformed env in local/dev; app can still render safely.
    }
  }

  return [...origins];
}

interface RootDocumentProps {
  children: React.ReactNode;
  dnsPrefetchOrigins: string[];
  appThemeVars: CSSProperties;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const dnsPrefetchOrigins = resolveDnsPrefetchOrigins();
  const appThemeVars = {
    "--color-border-focus": BRAND_THEME.primary,
    "--color-primary": BRAND_THEME.primary,
    "--color-primary-hover": BRAND_THEME.primaryHover,
    "--color-primary-foreground": BRAND_THEME.primaryForeground,
    "--color-accent": BRAND_THEME.accent,
    "--color-accent-hover": BRAND_THEME.accentHover,
    "--color-accent-foreground": BRAND_THEME.accentForeground,
    "--color-accent-subtle": BRAND_THEME.accentSubtle,
    "--color-accent-text": BRAND_THEME.accentText,
    "--color-accent-text-hover": BRAND_THEME.accentTextHover,
    "--color-digital": BRAND_THEME.primary,
  } as CSSProperties;

  return (
    <RootDocument
      dnsPrefetchOrigins={dnsPrefetchOrigins}
      appThemeVars={appThemeVars}
    >
      {children}
    </RootDocument>
  );
}

async function RootDocument({
  children,
  dnsPrefetchOrigins,
  appThemeVars,
}: RootDocumentProps) {
  const [locale, messages, timeZone, tLayout] = await Promise.all([
    getLocale(),
    getMessages(),
    getTimeZone(),
    getTranslations("layout"),
  ]);
  const market = await getRequestMarketConfig();
  const googleOneTap = resolveGoogleOneTapConfig(market.code);

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${barlow.variable} ${barlowSemiCondensed.variable}`}
    >
      <head>
        <Script id="zod-jitless-csp" strategy="beforeInteractive">
          {`
(function () {
  var config = globalThis.__zod_globalConfig || {};
  config.jitless = true;
  globalThis.__zod_globalConfig = config;
})();`}
        </Script>

        {process.env.NODE_ENV === "development" && (
          <Script id="dev-sanitize-injected-attrs" strategy="beforeInteractive">
            {`
(function () {
  // Some browser extensions / security software injects attributes like:
  // - bis_register=...
  // - bis_skin_checked="1"
  // - __processed_<uuid>__="true"
  // - style="caret-color: transparent;" on form fields
  // These mutate the server-rendered HTML before React hydrates, triggering noisy
  // hydration mismatch errors in development. Strip only these known injected
  // attributes/styles before hydration so real app hydration issues remain visible.
  var REMOVE_EXACT = { bis_register: true, bis_skin_checked: true };
  var REMOVE_PREFIXES = ["bis_", "__processed_"];

  function shouldRemove(name) {
    if (REMOVE_EXACT[name]) return true;
    for (var i = 0; i < REMOVE_PREFIXES.length; i++) {
      if (name.indexOf(REMOVE_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function shouldRemoveInjectedStyle(el) {
    if (!el || !el.tagName || !el.getAttribute) return false;
    var tagName = String(el.tagName).toLowerCase();
    if (tagName !== "input" && tagName !== "textarea") return false;
    var style = (el.getAttribute("style") || "").replace(/\\s+/g, " ").trim().toLowerCase();
    return style === "caret-color: transparent;" || style === "caret-color: transparent";
  }

  function cleanElement(el) {
    if (!el || !el.getAttributeNames) return;
    var names = el.getAttributeNames();
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (shouldRemove(n)) {
        try {
          el.removeAttribute(n);
        } catch (e) {
          // ignore
        }
      }
    }
    if (shouldRemoveInjectedStyle(el)) {
      try {
        el.removeAttribute("style");
      } catch (e) {
        // ignore
      }
    }
  }

  function cleanTree(root) {
    try {
      if (!root) return;
      cleanElement(root);
      if (!root.querySelectorAll) return;
      var all = root.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) cleanElement(all[i]);
    } catch (e) {
      // ignore
    }
  }

  cleanTree(document.documentElement);

  try {
    var obs = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "attributes" && m.attributeName) {
          if (
            shouldRemove(m.attributeName) ||
            (m.attributeName === "style" && shouldRemoveInjectedStyle(m.target))
          ) {
            try {
              m.target.removeAttribute(m.attributeName);
            } catch (e) {
              // ignore
            }
          }
          continue;
        }
        if (m.type === "childList" && m.addedNodes) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node && node.nodeType === 1) cleanTree(node);
          }
        }
      }
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
    });

    // Disconnect after initial app boot to avoid doing extra work during dev.
    setTimeout(function () {
      try {
        obs.disconnect();
      } catch (e) {
        // ignore
      }
    }, 5000);
  } catch (e) {
    // ignore
  }
})();`}
          </Script>
        )}

        {dnsPrefetchOrigins.map((origin) => (
          <link key={`dns-prefetch-${origin}`} rel="dns-prefetch" href={origin} />
        ))}
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className="font-sans antialiased min-h-screen bg-white">
        <JsonLd market={market} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-text-primary focus:text-white focus:text-sm focus:font-medium focus:rounded-md"
        >
          {tLayout("skipToContent")}
        </a>
        <AppProviders
          googleOneTapClientId={googleOneTap.clientId}
          googleOneTapEnabled={googleOneTap.enabled}
          locale={locale}
          marketCode={market.code}
          messages={messages}
          timeZone={timeZone}
        >
          <AnalyticsRuntime />
          <div style={appThemeVars} className="min-h-screen">
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
