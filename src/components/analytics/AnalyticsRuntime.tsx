"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  COOKIE_CONSENT_KEY,
  parseCookieConsent,
  type CookieConsent,
} from "@/lib/privacy/cookie-consent";
import { getAnalyticsUserId } from "@/lib/analytics/events";
import {
  buildClarityConsentV2,
  resolveClarityProjectIdForHost,
} from "@/lib/analytics/clarity";

declare global {
  interface Window {
    clarity?: ClarityFunction;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type ClarityFunction = ((command: string, ...args: unknown[]) => void) & {
  q?: unknown[][];
};

function loadScript(src: string, id: string) {
  if (document.getElementById(id)) {
    return;
  }

  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function ensureClarityQueue(): ClarityFunction {
  if (window.clarity) {
    return window.clarity;
  }

  const clarityQueue = ((...args: unknown[]) => {
    clarityQueue.q = clarityQueue.q || [];
    clarityQueue.q.push(args);
  }) as ClarityFunction;

  window.clarity = clarityQueue;
  return clarityQueue;
}

function getMicrosoftClarityProjectId() {
  return resolveClarityProjectIdForHost(window.location.host, {
    defaultId: process.env.NEXT_PUBLIC_CLARITY_ID,
    byMarket: {
      SK: process.env.NEXT_PUBLIC_CLARITY_ID_SK,
      RO: process.env.NEXT_PUBLIC_CLARITY_ID_RO,
    },
  });
}

function getMicrosoftClarityScriptId(projectId: string) {
  return `microsoft-clarity-script-${projectId}`;
}

function initMicrosoftClarity(projectId: string) {
  ensureClarityQueue();
  loadScript(
    `https://www.clarity.ms/tag/${projectId}`,
    getMicrosoftClarityScriptId(projectId),
  );
}

function updateMicrosoftClarityConsent(consent: CookieConsent | null) {
  if (typeof window.clarity !== "function") return;

  window.clarity("consentv2", buildClarityConsentV2(consent));
}

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
}

function setConsentDefaults() {
  ensureGtag();
  window.gtag!("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted",
    personalization_storage: "denied",
    security_storage: "granted",
    wait_for_update: 500,
  });
}

function updateConsent(consent: CookieConsent) {
  if (typeof window.gtag !== "function") return;
  window.gtag("consent", "update", {
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.marketing ? "granted" : "denied",
    analytics_storage: consent.analytics ? "granted" : "denied",
    functionality_storage: "granted",
    personalization_storage: consent.analytics ? "granted" : "denied",
    security_storage: "granted",
  });
}

function initGoogleAnalytics(measurementId: string) {
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`, "ga4-script");

  const configOptions: Record<string, unknown> = {
    send_page_view: false,
  };

  const userId = getAnalyticsUserId();
  if (userId) {
    configOptions.user_id = userId;
  }

  window.gtag!("js", new Date());
  window.gtag!("config", measurementId, configOptions);
}

function GoogleAnalyticsPageView({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (typeof window.gtag !== "function") return;

    const pagePath = search ? `${pathname}?${search}` : pathname;
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: pagePath,
      page_title: document.title,
      send_to: measurementId,
    });
  }, [measurementId, pathname, search]);

  return null;
}

export function AnalyticsRuntime() {
  const analyticsConsentEnabledRef = useRef(false);
  const consentDefaultsSet = useRef(false);
  const [activeGaMeasurementId, setActiveGaMeasurementId] = useState<string | null>(null);

  useEffect(() => {
    if (!consentDefaultsSet.current && typeof window !== "undefined") {
      setConsentDefaults();
      consentDefaultsSet.current = true;
    }
  }, []);

  useEffect(() => {
    const applyAnalyticsConsent = (consent: CookieConsent | null) => {
      const enabled = Boolean(consent?.analytics);
      const wasEnabled = analyticsConsentEnabledRef.current;
      analyticsConsentEnabledRef.current = enabled;
      const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
      const clarityProjectId = getMicrosoftClarityProjectId();

      if (consent) {
        updateConsent(consent);
      }

      if (enabled && gaMeasurementId && !wasEnabled) {
        initGoogleAnalytics(gaMeasurementId);
      }
      setActiveGaMeasurementId(enabled && gaMeasurementId ? gaMeasurementId : null);

      if (enabled && clarityProjectId) {
        initMicrosoftClarity(clarityProjectId);
        const analyticsUserId = getAnalyticsUserId();
        if (analyticsUserId) {
          window.clarity?.("identify", analyticsUserId);
        }
      }

      updateMicrosoftClarityConsent(consent);
    };

    const syncConsent = () => {
      const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
      const consent = parseCookieConsent(stored);
      applyAnalyticsConsent(consent);
    };

    syncConsent();
    window.addEventListener("storage", syncConsent);
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncConsent);

    return () => {
      window.removeEventListener("storage", syncConsent);
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncConsent);
    };
  }, []);

  return activeGaMeasurementId ? (
    <Suspense fallback={null}>
      <GoogleAnalyticsPageView measurementId={activeGaMeasurementId} />
    </Suspense>
  ) : null;
}
