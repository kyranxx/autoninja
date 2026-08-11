"use client";

import { useEffect, useReducer } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_CHANGED_EVENT,
  DEFAULT_COOKIE_CONSENT,
  parseCookieConsent,
  type CookieConsent,
} from "@/lib/privacy/cookie-consent";

interface CookieBannerState {
  isVisible: boolean;
  showSettings: boolean;
  isReady: boolean;
  consent: CookieConsent;
}

type CookieBannerAction =
  | { type: "hydrate_saved"; consent: CookieConsent }
  | { type: "mark_ready" }
  | { type: "show_banner" }
  | { type: "open_settings" }
  | { type: "close_settings" }
  | { type: "set_analytics"; value: boolean }
  | { type: "set_marketing"; value: boolean }
  | { type: "save_consent"; consent: CookieConsent };

const initialState: CookieBannerState = {
  isVisible: false,
  showSettings: false,
  isReady: false,
  consent: DEFAULT_COOKIE_CONSENT,
};

function parseStoredConsent(value: string | null): CookieConsent | null {
  return parseCookieConsent(value);
}

function readStoredConsent(): CookieConsent | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredConsent(localStorage.getItem(COOKIE_CONSENT_KEY));
}

function cookieBannerReducer(
  state: CookieBannerState,
  action: CookieBannerAction,
): CookieBannerState {
  switch (action.type) {
    case "hydrate_saved":
      return {
        ...state,
        consent: action.consent,
        isVisible: false,
        showSettings: false,
        isReady: true,
      };
    case "mark_ready":
      return {
        ...state,
        isReady: true,
      };
    case "show_banner":
      return {
        ...state,
        isVisible: true,
      };
    case "open_settings":
      return {
        ...state,
        showSettings: true,
      };
    case "close_settings":
      return {
        ...state,
        showSettings: false,
      };
    case "set_analytics":
      return {
        ...state,
        consent: {
          ...state.consent,
          analytics: action.value,
        },
      };
    case "set_marketing":
      return {
        ...state,
        consent: {
          ...state.consent,
          marketing: action.value,
        },
      };
    case "save_consent":
      return {
        ...state,
        consent: action.consent,
        isVisible: false,
        showSettings: false,
      };
    default:
      return state;
  }
}

export default function CookieBanner() {
  const [state, dispatch] = useReducer(cookieBannerReducer, initialState);
  const t = useTranslations("cookies");
  const tCommon = useTranslations("common");

  useEffect(() => {
    const savedConsent = readStoredConsent();

    if (savedConsent) {
      dispatch({ type: "hydrate_saved", consent: savedConsent });
      return;
    }

    dispatch({ type: "mark_ready" });

    const timer = setTimeout(() => {
      dispatch({ type: "show_banner" });
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const saveConsent = (newConsent: CookieConsent) => {
    const consentWithTimestamp = { ...newConsent, timestamp: Date.now() };
    localStorage.setItem(
      COOKIE_CONSENT_KEY,
      JSON.stringify(consentWithTimestamp),
    );
    window.dispatchEvent(
      new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, {
        detail: consentWithTimestamp,
      }),
    );
    dispatch({ type: "save_consent", consent: consentWithTimestamp });
  };

  const acceptAll = () => {
    saveConsent({
      necessary: true,
      analytics: true,
      marketing: true,
      timestamp: 0,
    });
  };

  const acceptNecessary = () => {
    saveConsent({
      necessary: true,
      analytics: false,
      marketing: false,
      timestamp: 0,
    });
  };

  const savePreferences = () => {
    saveConsent(state.consent);
  };

  if (!state.isReady || !state.isVisible) return null;

  return (
    <aside
      aria-label={t("title")}
      className="fixed bottom-2 left-2 z-50 w-[calc(100vw-1rem)] max-w-96 sm:bottom-4 sm:left-4 sm:w-[min(92vw,24rem)]"
    >
      <div className="overflow-hidden rounded-xl border border-accent/20 bg-background shadow-2xl">
        {!state.showSettings ? (
          <div className="p-3 sm:p-4">
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-accent/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-accent-on-light">
                    Cookies
                  </span>
                  <h3 className="text-sm font-semibold text-primary">{t("title")}</h3>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-secondary sm:line-clamp-none">
                  {t("description")}{" "}
                  <Link
                    href="/ochrana-udajov"
                    className="text-brand-accent-on-light underline decoration-1 underline-offset-2"
                  >
                    {tCommon("learnMore")}
                  </Link>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  onClick={() => dispatch({ type: "open_settings" })}
                  className="col-span-2 min-h-9 rounded-lg px-3 py-2 text-xs font-medium text-secondary transition-colors hover:bg-surface hover:text-primary sm:col-span-1"
                >
                  {t("settings")}
                </button>
                <button
                  onClick={acceptNecessary}
                  className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface"
                >
                  {t("reject")}
                </button>
                <button
                  onClick={acceptAll}
                  className="min-h-10 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  {t("accept")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-primary">
                {t("settings")}
              </h3>
              <button
                onClick={() => dispatch({ type: "close_settings" })}
                className="text-secondary hover:text-primary"
                aria-label={t("closeSettingsAria")}
              >
                ×
              </button>
            </div>

            <div className="mb-5 space-y-3">
              <div className="flex items-start gap-3 rounded-lg bg-surface p-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-primary">
                      {t("necessary")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-secondary">
                    {t("necessaryDescription")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="mt-1 size-4 rounded accent-accent"
                />
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="flex-1">
                  <span className="font-medium text-primary">
                    {t("analytics")}
                  </span>
                  <p className="mt-1 text-xs text-secondary">
                    {t("analyticsDescription")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={state.consent.analytics}
                  onChange={(e) =>
                    dispatch({ type: "set_analytics", value: e.target.checked })
                  }
                  className="mt-1 size-4 rounded accent-accent cursor-pointer"
                />
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="flex-1">
                  <span className="font-medium text-primary">
                    {t("marketing")}
                  </span>
                  <p className="mt-1 text-xs text-secondary">
                    {t("marketingDescription")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={state.consent.marketing}
                  onChange={(e) =>
                    dispatch({ type: "set_marketing", value: e.target.checked })
                  }
                  className="mt-1 size-4 rounded accent-accent cursor-pointer"
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={acceptNecessary}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface"
              >
                {t("reject")}
              </button>
              <button
                onClick={savePreferences}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                {tCommon("save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
