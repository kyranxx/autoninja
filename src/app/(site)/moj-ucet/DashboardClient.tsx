"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  type KeyboardEvent,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import Image from "next/image";
import { formatCurrency } from "@/config/vat";
import { createClient } from "@/lib/supabase/client";
import { useLocale, useTranslations } from "next-intl";
import { optimizeCloudflareImage } from "@/lib/image-optimizer";
import { toast } from "sonner";
import { buildAdPath } from "@/lib/cars/ad-path";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { createCsrfHeaders } from "@/lib/security/client-csrf";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { CREATE_LISTING_ROUTE } from "@/lib/routes";
import {
  mapInquiriesToConversations,
  type InquiryRow,
} from "@/lib/inquiries/conversations";
import {
  PlusIcon,
  EyeIcon,
  MessageIcon,
  ClockIcon,
  HeartIcon,
  CarIcon,
  XIcon,
} from "@/components/ui/Icons";
import TurnstileCaptcha from "@/components/security/TurnstileCaptcha";
import {
  AdsIcon,
  SavedIcon,
  MessagesIcon,
  SettingsIcon,
} from "@/components/ui/DashboardIcons";
import { useMarket, useMarketCode } from "@/context/MarketContext";

const EmbeddedAdWizard = dynamic(() => import("../pridat-inzerat/AdWizardClient"), {
  ssr: false,
});

interface DashboardClientProps {
  vinDecodingEnabled?: boolean;
  initialSearchParams?: string;
  initialTab?: string | null;
  submitted?: string | null;
  updated?: string | null;
}

type DealerMetaState = {
  hasDealer: boolean;
  name: string | null;
};

// Type definitions for ads
interface UserAd {
  id: string;
  brand?: string;
  model?: string;
  year: number;
  price_eur: number;
  mileage_km?: number;
  description?: string;
  fuel?: string;
  transmission?: string;
  location_city?: string;
  created_at?: string | null;
  status: string;
  moderation_rejection_note?: string | null;
  views?: number;
  views_count?: number;
  inquiries?: number;
  expires_at: string | null;
  is_top_ad: boolean;
  is_highlighted?: boolean;
  photo?: string;
  photos_json?: string[];
  brands?: { name: string };
  models?: { name: string };
}

type MyAdsTabUiState = {
  deleteAd: UserAd | null;
  deleteLoading: boolean;
};

const initialMyAdsTabUiState: MyAdsTabUiState = {
  deleteAd: null,
  deleteLoading: false,
};

function myAdsTabUiReducer(
  state: MyAdsTabUiState,
  patch: Partial<MyAdsTabUiState>,
): MyAdsTabUiState {
  return { ...state, ...patch };
}

interface SavedAd {
  id: string;
  year: number;
  price_eur: number;
  status: string;
  mileage_km?: number;
  location_city?: string;
  fuel?: string;
  photos_json?: string[];
  brands?: { name: string };
  models?: { name: string };
}

type SavedTabCacheEntry = {
  key: string;
  savedAds: SavedAd[];
  preferences: Record<string, SavedAdAlertPreference>;
  alertsSupported: boolean;
};

const SAVED_TAB_CACHE = new Map<string, SavedTabCacheEntry>();

function sortAdsActiveFirst(ads: UserAd[]): UserAd[] {
  return ads.toSorted(
    (left, right) =>
      Number(right.status === "active") - Number(left.status === "active"),
  );
}

async function loadPricingSummaryConfig(): Promise<{
  prolong?: string;
  premium?: string;
  top?: string;
} | null> {
  const response = await fetch("/api/pricing/config", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | {
        summary?: {
          prolong?: string;
          premium?: string;
          top?: string;
        };
      }
    | null;

  return response.ok ? (payload?.summary ?? null) : null;
}

function buildSavedTabCacheKey(userId: string, adIds: string[]): string {
  const sortedIds = adIds.toSorted();
  return `${userId}:${sortedIds.join(",")}`;
}

interface SavedAdAlertPreference {
  ad_id: string;
  notify_price_drop: boolean;
  notify_status_change: boolean;
  notify_similar: boolean;
  notify_email: boolean;
  notify_push: boolean;
  paused: boolean;
  baseline_price_eur: number | null;
  baseline_status: string | null;
}

const TABS_CONFIG = [
  { id: "ads", labelKey: "myAds", Icon: AdsIcon },
  { id: "create", labelKey: "addListingTab", Icon: PlusIcon },
  { id: "saved", labelKey: "savedCars", Icon: SavedIcon },
  { id: "messages", labelKey: "messages", Icon: MessagesIcon },
  { id: "settings", labelKey: "settings", Icon: SettingsIcon },
];

type MessageConversation = ReturnType<typeof mapInquiriesToConversations>[number];

type MessagesTabCacheEntry = {
  conversations: MessageConversation[];
  activeConversation: string | null;
};

const MESSAGES_TAB_CACHE = new Map<string, MessagesTabCacheEntry>();

function getLocaleTag(locale: string): string {
  return locale;
}

function getAccountInlineCopy(locale: string) {
  const isRo = locale.toLowerCase().startsWith("ro");
  return isRo
    ? {
        myAccountKicker: "Contul meu",
        freeListingBanner: "Anunț acum gratuit. Premium {premium}. Exclusive {top}.",
        submittedForApproval: "Anunțul a fost trimis pentru aprobare.",
        listingSaved: "Anunțul a fost salvat.",
        wholeMarket: "România",
        backTo: "Înapoi la",
        adId: "ID anunț",
        replyPlaceholder: "Scrieți răspunsul...",
        confirmCaptcha: "Confirmați captcha înainte de trimitere.",
        enterToSend: "Enter trimite mesajul, Shift+Enter adaugă un rând nou.",
        captchaEnablesSend: "Trimiterea se activează după confirmarea captcha.",
        sending: "Se trimite...",
        reply: "Răspunde",
        deleting: "Se șterge...",
        deleteMessage: "Șterge mesajul",
        confirmDeleteMessage: "Sigur doriți să ștergeți acest mesaj?",
        cannotReply: "Nu se poate trimite răspuns pentru acest mesaj.",
        messagesLoadFailed: "Mesajele nu au putut fi încărcate.",
        fallbackCarTitle: "Anunț",
        incomingLabel: "Cumpărător",
        outgoingLabel: "Vânzător",
        replyFailed: "Răspunsul nu a putut fi trimis.",
        replySent: "Răspunsul a fost trimis.",
        deleteFailed: "Mesajul nu a putut fi șters.",
        messageDeleted: "Mesajul a fost șters.",
        leadUpdateFailed: "Calitatea leadului nu a putut fi modificată.",
      }
    : {
        myAccountKicker: "Môj účet",
        freeListingBanner: "Inzerát teraz zdarma. Premium {premium}. Exclusive {top}.",
        submittedForApproval: "Inzerát bol odoslaný na schválenie.",
        listingSaved: "Inzerát bol uložený.",
        wholeMarket: "Slovensko",
        backTo: "Späť na",
        adId: "ID inzerátu",
        replyPlaceholder: "Napíšte odpoveď...",
        confirmCaptcha: "Pred odoslaním potvrďte captcha.",
        enterToSend: "Enter odošle správu, Shift+Enter vloží nový riadok.",
        captchaEnablesSend: "Odoslanie sa aktivuje po potvrdení captcha.",
        sending: "Odosielanie...",
        reply: "Odpovedať",
        deleting: "Mažem...",
        deleteMessage: "Vymazať správu",
        confirmDeleteMessage: "Naozaj chcete vymazať túto správu?",
        cannotReply: "Nie je možné odoslať odpoveď pre túto správu.",
        messagesLoadFailed: "Nepodarilo sa načítať správy.",
        fallbackCarTitle: "Inzerát",
        incomingLabel: "Záujemca",
        outgoingLabel: "Predajca",
        replyFailed: "Nepodarilo sa odoslať odpoveď.",
        replySent: "Odpoveď bola odoslaná.",
        deleteFailed: "Nepodarilo sa vymazať správu.",
        messageDeleted: "Správa bola vymazaná.",
        leadUpdateFailed: "Nepodarilo sa upraviť kvalitu leadu.",
      };
}

function DashboardLoadingState() {
  return (
    <main className="pt-24 pb-16 min-h-screen flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="size-16 rounded-full bg-surface" />
        <div className="h-4 w-32 rounded bg-surface" />
      </div>
    </main>
  );
}

function DashboardAuthRequired({
  title,
  loginLabel,
}: {
  title: string;
  loginLabel: string;
}) {
  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="mx-auto max-w-lg px-4 text-center">
        <h1 className="text-2xl font-semibold text-primary mb-4">{title}</h1>
        <Link
          href="/auth/login"
          className="inline-flex px-6 py-3 rounded-full bg-accent text-white font-semibold"
        >
          {loginLabel}
        </Link>
      </div>
    </main>
  );
}

export default function DashboardClient(props: DashboardClientProps) {
  return useDashboardClientView(props);
}

function useDashboardClientView({
  vinDecodingEnabled = false,
  initialSearchParams = "",
  initialTab = null,
  submitted = null,
  updated = null,
}: DashboardClientProps) {
  const { user, profile, loading, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations("dashboard");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const marketCode = useMarketCode();
  const inlineCopy = useMemo(() => getAccountInlineCopy(locale), [locale]);

  const identityData = user?.identities?.[0]?.identity_data as
    | Record<string, unknown>
    | undefined;

  const avatarUrl =
    (typeof user?.user_metadata?.avatar_url === "string"
      ? (user.user_metadata.avatar_url as string)
      : undefined) ||
    (typeof user?.user_metadata?.picture === "string"
      ? (user.user_metadata.picture as string)
      : undefined) ||
    (identityData && typeof identityData.avatar_url === "string"
      ? (identityData.avatar_url as string)
      : undefined) ||
    (identityData && typeof identityData.picture === "string"
      ? (identityData.picture as string)
      : undefined) ||
    profile?.avatar_url;

  const userInitial =
    profile?.full_name?.charAt(0)?.toUpperCase() ||
    user?.email?.charAt(0)?.toUpperCase() ||
    "U";
  const [avatarErrorUrl, setAvatarErrorUrl] = useState<string | null>(null);

  // URL state management
  const { replace } = useRouter();
  const pathname = usePathname();
  const tabParam = initialTab;
  const isValidTabParam = tabParam
    ? TABS_CONFIG.some((tab) => tab.id === tabParam)
    : false;
  const activeTab = isValidTabParam && tabParam ? tabParam : "ads";
  const [dealerMeta, updateDealerMeta] = useReducer(
    (_state: DealerMetaState, nextState: DealerMetaState) => nextState,
    {
      hasDealer: false,
      name: null,
    },
  );
  const [pricingSummary, setPricingSummary] = useState({
    prolong: "Zadarmo / 28 dní",
    premium: "4,99 € / 28 dní",
    top: "9,99 € / 28 dní",
  });

  const [adsState, setAdsState] = useState<{
    savedCarIds: Set<string>;
    userAds: UserAd[];
    adsLoading: boolean;
    hasLoadedAds: boolean;
    hasLoadedSaved: boolean;
  }>({
    savedCarIds: new Set(),
    userAds: [],
    adsLoading: true,
    hasLoadedAds: false,
    hasLoadedSaved: false,
  });

  const loadUserAds = useCallback(async () => {
    if (!user) return;
    setAdsState((prev) => ({ ...prev, adsLoading: true }));
    try {
      const { data, error } = await supabase
        .from("ads")
        .select(
          `
                    id, 
                    year, 
                    price_eur, 
                    mileage_km, 
                    description,
                    fuel,
                    transmission,
                    location_city,
                    status,
                    moderation_rejection_note,
                    views_count,
                    is_top_ad,
                    is_highlighted,
                    expires_at,
                    created_at,
                    photos_json,
                    brands(name),
                    models(name)
                `,
        )
        .eq("seller_id", user.id)
        .eq("market_code", marketCode)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setAdsState((prev) => ({
          ...prev,
          userAds: sortAdsActiveFirst(data as unknown as UserAd[]),
        }));
      }
    } catch (err) {
      console.error("Error loading user ads:", err);
    } finally {
      setAdsState((prev) => ({ ...prev, adsLoading: false }));
    }
  }, [marketCode, user, supabase]);

  const loadSavedCars = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("saved_ads")
        .select("ad_id, ads!inner(market_code)")
        .eq("user_id", user.id)
        .eq("ads.market_code", marketCode);

      if (!error && data) {
        setAdsState((prev) => ({
          ...prev,
          savedCarIds: new Set(data.map((d) => d.ad_id)),
        }));
      }
    } catch (err) {
      console.error("Error loading saved cars:", err);
    }
  }, [marketCode, user, supabase]);

  useEffect(() => {
    // When the user changes, reset lazy-load flags so tabs load for the new account.
    setAdsState({
      savedCarIds: new Set(),
      userAds: [],
      adsLoading: true,
      hasLoadedAds: false,
      hasLoadedSaved: false,
    });
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadDealerMeta() {
      if (!user) {
        updateDealerMeta({ hasDealer: false, name: null });
        return;
      }

      try {
        const { data, error } = await supabase
          .from("dealers")
          .select("id, name")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (error || !data) {
          updateDealerMeta({ hasDealer: false, name: null });
          return;
        }

        updateDealerMeta({
          hasDealer: true,
          name: typeof data.name === "string" ? data.name : null,
        });
      } catch (error) {
        if (!cancelled) {
          console.error("Error loading dealer meta:", error);
          updateDealerMeta({ hasDealer: false, name: null });
        }
      }
    }

    void loadDealerMeta();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadPricingSummary() {
      try {
        const summary = await loadPricingSummaryConfig();

        if (!cancelled && summary) {
          setPricingSummary({
            prolong: summary.prolong || "Zadarmo / 28 dní",
            premium: summary.premium || "4,99 € / 28 dní",
            top: summary.top || "9,99 € / 28 dní",
          });
        }
      } catch {
        // Keep default summary.
      }
    }

    void loadPricingSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    if (activeTab === "ads" && !adsState.hasLoadedAds) {
      loadUserAds().finally(() =>
        setAdsState((prev) => ({ ...prev, hasLoadedAds: true })),
      );
    }

    if (activeTab === "saved" && !adsState.hasLoadedSaved) {
      loadSavedCars().finally(() =>
        setAdsState((prev) => ({ ...prev, hasLoadedSaved: true })),
      );
    }
  }, [
    user,
    activeTab,
    adsState.hasLoadedAds,
    adsState.hasLoadedSaved,
    loadUserAds,
    loadSavedCars,
    marketCode,
  ]);

  const handleUnsaveCar = useCallback(
    async (adId: string) => {
      if (!user) return;
      try {
        const { error } = await supabase
          .from("saved_ads")
          .delete()
          .eq("user_id", user.id)
          .eq("ad_id", adId);

        if (error) throw error;

        setAdsState((prev) => {
          const newSet = new Set(prev.savedCarIds);
          newSet.delete(adId);
          return { ...prev, savedCarIds: newSet };
        });
      } catch (err) {
        console.error("Error removing saved car:", err);
        toast.error(tErrors("generic"));
      }
    },
    [user, supabase, tErrors],
  );

  const handleSignOutWithRedirect = async () => {
    await signOut();
  };

  useEffect(() => {
    if (!submitted && !updated) {
      return;
    }

    if (submitted === "1") {
      toast.success(inlineCopy.submittedForApproval);
    }
    if (updated === "1") {
      toast.success(inlineCopy.listingSaved);
    }

    const params = new URLSearchParams(initialSearchParams);
    params.delete("submitted");
    params.delete("updated");
    replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [initialSearchParams, inlineCopy, pathname, replace, submitted, updated]);

  // Sync URL with state
  const handleTabChange = useCallback((tabId: string) => {
    if (tabId === activeTab && tabParam === tabId) {
      return;
    }

    const params = new URLSearchParams(initialSearchParams);
    params.set("tab", tabId);
    replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [activeTab, initialSearchParams, pathname, replace, tabParam]);

  if (loading) return <DashboardLoadingState />;

  if (!user) {
    return (
      <DashboardAuthRequired
        title={tAuth("loginRequired")}
        loginLabel={tCommon("login")}
      />
    );
  }

  return (
    <main className="market-page pb-16 pt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <DashboardHeader
          avatarUrl={avatarUrl ?? undefined}
          avatarErrorUrl={avatarErrorUrl}
          onAvatarError={setAvatarErrorUrl}
          avatarAlt={profile?.full_name || user.email || t("user")}
          userInitial={userInitial}
          dealerMeta={dealerMeta}
          myAccountKicker={inlineCopy.myAccountKicker}
          dashboardHeading={t("dashboardHeading")}
          dealerDashboardAvailableLabel={t("dealerDashboardAvailable")}
          dealerDashboardLabel={t("dealerDashboard")}
          addListingLabel={tCommon("addListing")}
        />

        <DashboardTabNav
          activeTab={activeTab}
          pricingSummary={pricingSummary}
          freeListingBanner={inlineCopy.freeListingBanner}
          onTabChange={handleTabChange}
          getLabel={(labelKey) => t(labelKey) || labelKey}
        />

        <section className={activeTab === "create" ? "" : "min-w-0"}>
          {activeTab === "ads" && (
            <MyAdsTab
              ads={adsState.userAds}
              isLoading={adsState.adsLoading}
              onRefresh={loadUserAds}
            />
          )}
          {activeTab === "create" && (
            <CreateListingTab vinDecodingEnabled={vinDecodingEnabled} />
          )}
          {activeTab === "saved" && (
            <SavedTab savedCarIds={adsState.savedCarIds} onUnsave={handleUnsaveCar} />
          )}
          {activeTab === "messages" && <MessagesTab />}
          {activeTab === "settings" && (
            <SettingsTab
              profile={profile}
              signOut={handleSignOutWithRedirect}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardHeader({
  avatarUrl,
  avatarErrorUrl,
  onAvatarError,
  avatarAlt,
  userInitial,
  dealerMeta,
  myAccountKicker,
  dashboardHeading,
  dealerDashboardAvailableLabel,
  dealerDashboardLabel,
  addListingLabel,
}: {
  avatarUrl?: string;
  avatarErrorUrl: string | null;
  onAvatarError: (url: string | null) => void;
  avatarAlt: string;
  userInitial: string;
  dealerMeta: DealerMetaState;
  myAccountKicker: string;
  dashboardHeading: string;
  dealerDashboardAvailableLabel: string;
  dealerDashboardLabel: string;
  addListingLabel: string;
}) {
  return (
    <div className="market-panel mb-4 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-center gap-4">
        <div className="relative flex size-14 items-center justify-center overflow-hidden rounded-xl border border-primary/12 bg-primary/5 text-xl font-bold text-primary sm:size-16">
          {avatarUrl && avatarErrorUrl !== avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={avatarAlt}
              fill
              sizes="64px"
              className="object-cover"
              onError={() => onAvatarError(avatarUrl)}
            />
          ) : (
            userInitial
          )}
        </div>
        <div>
          <p className="market-kicker">{myAccountKicker}</p>
          <h1 className="mt-1 !text-3xl font-display font-semibold text-text-primary sm:!text-4xl">
            {dashboardHeading}
          </h1>
          {dealerMeta.hasDealer ? (
            <p className="mt-1 text-sm text-secondary">
              {dealerMeta.name
                ? `${dealerMeta.name} • ${dealerDashboardAvailableLabel}`
                : dealerDashboardAvailableLabel}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {dealerMeta.hasDealer ? (
          <Link
            href="/dealer"
            className="market-action-secondary inline-flex items-center gap-2 px-5 py-3 text-sm"
          >
            {dealerDashboardLabel}
          </Link>
        ) : null}
        <Link
          href={CREATE_LISTING_ROUTE}
          className="market-action-primary hidden items-center gap-2 px-6 py-3 text-sm sm:inline-flex"
        >
          <PlusIcon className="size-5" />
          {addListingLabel}
        </Link>
      </div>
    </div>
  );
}

function DashboardTabNav({
  activeTab,
  pricingSummary,
  freeListingBanner,
  onTabChange,
  getLabel,
}: {
  activeTab: string;
  pricingSummary: { premium: string; top: string };
  freeListingBanner: string;
  onTabChange: (tabId: string) => void;
  getLabel: (labelKey: (typeof TABS_CONFIG)[number]["labelKey"]) => string;
}) {
  return (
    <div className="market-panel mb-5 p-2">
      <div className="mb-2 rounded-xl border border-accent/15 bg-accent/5 px-4 py-3 text-sm text-primary sm:hidden">
        {freeListingBanner
          .replace("{premium}", pricingSummary.premium)
          .replace("{top}", pricingSummary.top)}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
        {TABS_CONFIG.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all sm:justify-start ${
              activeTab === tab.id
                ? "border-transparent bg-primary text-white shadow-sm"
                : "border-border bg-background text-primary hover:bg-background-muted"
            }`}
          >
            <tab.Icon className="size-5" />
            {getLabel(tab.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

// My Ads Tab
type MyAdsTabProps = {
  ads: UserAd[];
  isLoading: boolean;
  onRefresh: () => void;
};

function MyAdsTab(props: MyAdsTabProps) {
  return useMyAdsTabView(props);
}

function useMyAdsTabView({
  ads,
  isLoading,
  onRefresh,
}: MyAdsTabProps) {
  const [myAdsUiState, updateMyAdsUiState] = useReducer(
    myAdsTabUiReducer,
    initialMyAdsTabUiState,
  );
  const {
    deleteAd,
    deleteLoading,
  } = myAdsUiState;
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const localeTag = getLocaleTag(locale);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return { label: t("active"), class: "bg-success text-white" };
      case "sold":
        return { label: t("sold"), class: "bg-secondary text-white" };
      case "expired":
        return { label: t("expired"), class: "bg-error text-white" };
      case "pending":
        return { label: t("pending"), class: "bg-warning text-primary" };
      case "rejected":
        return { label: t("rejected"), class: "bg-error/15 text-error" };
      default:
        return { label: status, class: "bg-background-muted text-primary" };
    }
  };

  const getDaysRemaining = (dateStr: string | null) => {
    if (!dateStr) return null;
    const days = Math.ceil(
      (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    return days > 0 ? days : 0;
  };

  const closeDeleteAd = () => {
    if (deleteLoading) return;
    updateMyAdsUiState({ deleteAd: null });
  };

  const handleDeleteAd = async () => {
    if (!deleteAd) return;

    updateMyAdsUiState({ deleteLoading: true });
    try {
      const response = await fetch(`/api/account/ads?id=${encodeURIComponent(deleteAd.id)}`, {
        method: "DELETE",
        headers: createCsrfHeaders(),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        toast.error(payload?.error || tErrors("generic"));
        return;
      }

      trackAnalyticsEvent("listing_deleted", {
        adId: deleteAd.id,
        deletedVia: "dashboard",
      });
      toast.success(t("listingDeleted"));
      updateMyAdsUiState({ deleteAd: null });
      onRefresh();
    } catch (error) {
      console.error("Error deleting ad:", error);
      toast.error(tErrors("generic"));
    } finally {
      updateMyAdsUiState({ deleteLoading: false });
    }
  };

  // Helper to get brand/model name from nested objects or direct properties
  const getBrandName = (ad: UserAd) =>
    ad.brands?.name || ad.brand || t("unknown");
  const getModelName = (ad: UserAd) => ad.models?.name || ad.model || "";
  const getPhoto = (ad: UserAd) => {
    if (ad.photo) {
      return optimizeCloudflareImage(ad.photo, {
        width: 384,
        height: 288,
        fit: "cover",
        quality: 82,
        format: "auto",
      });
    }
    if (ad.photos_json && ad.photos_json.length > 0) {
      return optimizeCloudflareImage(ad.photos_json[0], {
        width: 384,
        height: 288,
        fit: "cover",
        quality: 82,
        format: "auto",
      });
    }
    return "/placeholder-car.jpg";
  };
  const getViews = (ad: UserAd) => ad.views || ad.views_count || 0;
  const getInquiries = (ad: UserAd) => ad.inquiries || 0;
  const formatMileage = (value: number | undefined) =>
    typeof value === "number" ? `${value.toLocaleString(localeTag)} km` : t("notProvided");
  const formatCreatedAt = (value: string | null | undefined) => {
    if (!value) return t("notProvided");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("notProvided");
    return date.toLocaleDateString(localeTag);
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          "myads-skeleton-1",
          "myads-skeleton-2",
          "myads-skeleton-3",
          "myads-skeleton-4",
          "myads-skeleton-5",
        ].map(
          (skeletonKey) => (
          <div
            key={skeletonKey}
            className="market-card animate-pulse space-y-3 bg-background p-4"
          >
            <div className="h-40 rounded-xl bg-surface" />
            <div className="space-y-3">
              <div className="h-5 bg-surface rounded w-1/2" />
              <div className="h-4 bg-surface rounded w-1/3" />
              <div className="h-4 bg-surface rounded w-3/4" />
            </div>
          </div>
          ),
        )}
      </div>
    );
  }

  return (
    <div>
      {ads.length === 0 ? (
        <div className="market-panel mx-auto max-w-xl p-8 text-center sm:p-10">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-primary/12 bg-primary/5 text-primary">
            <CarIcon className="size-8" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-primary">
            {t("noAdsYet")}
          </h3>
          <p className="text-secondary mb-4">{t("addFirstAd")}</p>
          <Link
            href={CREATE_LISTING_ROUTE}
            className="market-action-primary inline-flex items-center gap-2 px-6 py-3 text-sm"
          >
            <PlusIcon className="size-5" />
            {t("addFirstListing")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {ads.map((ad, index) => {
            const status = getStatusBadge(ad.status);
            const daysRemaining = getDaysRemaining(ad.expires_at);
            const adPath = buildAdPath({
              id: ad.id,
              brand: getBrandName(ad),
              model: getModelName(ad),
              year: ad.year,
            });

            return (
              <article
                key={ad.id}
                className="market-card overflow-hidden bg-background"
              >
                <Link
                  href={adPath}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <div className="relative aspect-[16/10]">
                    <Image
                      src={getPhoto(ad)}
                      alt={`${getBrandName(ad)} ${getModelName(ad)}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 20vw"
                      priority={index === 0}
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                    {ad.is_top_ad && (
                      <span className="absolute left-2 top-2 rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                        Exclusive
                      </span>
                    )}
                    {ad.is_highlighted && (
                      <span className="absolute left-2 top-10 rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-primary">
                        Premium
                      </span>
                    )}
                    <span
                      className={`absolute right-2 top-2 rounded-md px-2 py-1 text-xs font-medium ${status.class}`}
                    >
                      {status.label}
                    </span>
                  </div>
                </Link>

                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-primary">
                      <Link
                        href={adPath}
                        className="rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                      >
                        {getBrandName(ad)} {getModelName(ad)}
                      </Link>
                    </h3>
                    <p className="mt-1 text-base font-semibold text-primary">
                      {formatCurrency(ad.price_eur)}
                    </p>
                  </div>

                  {ad.status === "rejected" && ad.moderation_rejection_note ? (
                    <div className="rounded-xl border border-error/20 bg-error/5 p-3 text-sm">
                      <p className="font-semibold text-error">Dôvod zamietnutia</p>
                      <p className="mt-1 text-text-secondary">{ad.moderation_rejection_note}</p>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-primary/80">
                    <span>{ad.year || t("notProvided")}</span>
                    <span>{formatMileage(ad.mileage_km)}</span>
                    <span className="capitalize">{ad.fuel || t("notProvided")}</span>
                    <span className="capitalize">{ad.transmission || t("notProvided")}</span>
                    <span>{ad.location_city || t("notProvided")}</span>
                    <span>{formatCreatedAt(ad.created_at)}</span>
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm text-primary/75">
                    <span className="flex items-center gap-1 rounded-full bg-background-muted px-2 py-1">
                      <EyeIcon className="size-4" />
                      {getViews(ad)}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-background-muted px-2 py-1">
                      <MessageIcon className="size-4" />
                      {getInquiries(ad)}
                    </span>
                    {daysRemaining !== null && (
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-1 ${
                          daysRemaining <= 3
                            ? "bg-error text-white"
                            : "bg-background-muted text-primary/75"
                        }`}
                      >
                        <ClockIcon className="size-4" />
                        {daysRemaining} {t("days")}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href={`/upravit-inzerat/${ad.id}`}
                      className="market-action-secondary min-h-11 px-4 py-2 text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {tCommon("edit")}
                    </Link>
                    <button
                      type="button"
                      data-testid={`listing-delete-${ad.id}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updateMyAdsUiState({ deleteAd: ad });
                      }}
                      className="market-action-secondary min-h-11 px-4 py-2 text-sm border-error/40 bg-error/5 text-error hover:bg-error/10"
                    >
                      {t("deleteListing")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <DeleteAdModal
        isOpen={!!deleteAd}
        isDeleting={deleteLoading}
        title={t("deleteListingTitle")}
        description={t("deleteListingDescription")}
        cancelLabel={tCommon("cancel")}
        deleteLabel={t("deleteListing")}
        deletingLabel={t("deletingListing")}
        onClose={closeDeleteAd}
        onConfirm={handleDeleteAd}
      />
    </div>
  );
}

function DeleteAdModal({
  isOpen,
  isDeleting,
  title,
  description,
  cancelLabel,
  deleteLabel,
  deletingLabel,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  isDeleting: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  deleteLabel: string;
  deletingLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
        aria-label={cancelLabel}
        disabled={isDeleting}
      />
      <div className="relative z-[121] w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl sm:p-6">
        <h3 className="text-lg font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-sm text-secondary">{description}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="market-action-secondary min-h-10 px-4 py-2 text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="listing-delete-confirm"
            onClick={onConfirm}
            disabled={isDeleting}
            className="market-action-primary min-h-10 bg-error px-4 py-2 text-sm text-white hover:bg-error/90 disabled:opacity-50"
          >
            {isDeleting ? deletingLabel : deleteLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateListingTab({
  vinDecodingEnabled = false,
}: {
  vinDecodingEnabled?: boolean;
}) {
  return (
    <section>
      <EmbeddedAdWizard embedded vinDecodingEnabled={vinDecodingEnabled} />
    </section>
  );
}

function SavedAlertCheckbox({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const descriptionId = `${id}-description`;

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-background-muted/60 px-3 py-3 transition-colors hover:border-primary/25 has-[:focus-visible]:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/25"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-primary">{title}</span>
        <span id={descriptionId} className="mt-0.5 block text-xs leading-5 text-secondary">
          {description}
        </span>
      </span>
      <input
        id={id}
        name={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 rounded border border-border-strong accent-accent disabled:opacity-70"
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

// Saved Tab (functional with persistent state)
type SavedTabProps = {
  savedCarIds: Set<string>;
  onUnsave: (id: string) => void;
};

function SavedTab({
  savedCarIds,
  onUnsave,
}: SavedTabProps) {
  return useSavedTabView({ savedCarIds, onUnsave });
}

function useSavedTabView({
  savedCarIds,
  onUnsave,
}: SavedTabProps) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const savedAdIds = useMemo(() => Array.from(savedCarIds), [savedCarIds]);
  const cacheKey = useMemo(
    () => (user ? buildSavedTabCacheKey(user.id, savedAdIds) : null),
    [savedAdIds, user],
  );
  const cachedState = cacheKey ? SAVED_TAB_CACHE.get(cacheKey) : null;
  const [savedState, setSavedState] = useState<{
    savedAds: SavedAd[];
    preferences: Record<string, SavedAdAlertPreference>;
    isLoading: boolean;
    alertsSupported: boolean;
    isBulkUpdating: boolean;
    updatingAdId: string | null;
  }>(() => ({
    savedAds: cachedState?.savedAds || [],
    preferences: cachedState?.preferences || {},
    isLoading: !cachedState,
    alertsSupported: cachedState?.alertsSupported ?? true,
    isBulkUpdating: false,
    updatingAdId: null,
  }));
  const t = useTranslations("dashboard");
  const tFuel = useTranslations("fuel");
  const locale = useLocale();
  const localeTag = getLocaleTag(locale);
  const inlineCopy = useMemo(() => getAccountInlineCopy(locale), [locale]);

  const createDefaultPreference = useCallback(
    (ad: SavedAd): SavedAdAlertPreference => ({
      ad_id: ad.id,
      notify_price_drop: true,
      notify_status_change: true,
      notify_similar: false,
      notify_email: true,
      notify_push: false,
      paused: false,
      baseline_price_eur: ad.price_eur || null,
      baseline_status: ad.status || null,
    }),
    [],
  );

  const loadSavedAds = useCallback(async () => {
    if (!user || !cacheKey) return;

    if (savedAdIds.length === 0) {
      SAVED_TAB_CACHE.set(cacheKey, {
        key: cacheKey,
        savedAds: [],
        preferences: {},
        alertsSupported: true,
      });
      setSavedState((prev) => ({
        ...prev,
        savedAds: [],
        preferences: {},
        isLoading: false,
      }));
      return;
    }

    const cached = SAVED_TAB_CACHE.get(cacheKey);
    setSavedState((prev) => ({
      ...prev,
      isLoading: !cached,
    }));

    try {
      const { data: adsData, error: adsError } = await supabase
        .from("ads")
        .select(
          `
            id,
            year,
            price_eur,
            mileage_km,
            location_city,
            fuel,
            status,
            photos_json,
            brands(name),
            models(name)
          `,
        )
        .in("id", savedAdIds);

      if (adsError) {
        throw adsError;
      }

      const nextSavedAds = ((adsData || []) as unknown as SavedAd[]).sort(
        (a, b) => (b.year || 0) - (a.year || 0),
      );

      let alertsSupported = true;
      const preferencesByAdId: Record<string, SavedAdAlertPreference> = {};

      const { data: preferenceData, error: preferenceError } = await supabase
        .from("saved_ad_alert_preferences")
        .select(
          `
            ad_id,
            notify_price_drop,
            notify_status_change,
            notify_similar,
            notify_email,
            notify_push,
            paused,
            baseline_price_eur,
            baseline_status
          `,
        )
        .eq("user_id", user.id)
        .in("ad_id", savedAdIds);

      if (preferenceError) {
        alertsSupported = false;
      } else {
        for (const preference of (preferenceData || []) as SavedAdAlertPreference[]) {
          preferencesByAdId[preference.ad_id] = preference;
        }
      }

      const missingDefaults: SavedAdAlertPreference[] = [];
      for (const ad of nextSavedAds) {
        if (!preferencesByAdId[ad.id]) {
          const fallback = createDefaultPreference(ad);
          preferencesByAdId[ad.id] = fallback;
          missingDefaults.push(fallback);
        }
      }

      if (alertsSupported && missingDefaults.length > 0) {
        await supabase.from("saved_ad_alert_preferences").upsert(
          missingDefaults.map((item) => ({
            user_id: user.id,
            ad_id: item.ad_id,
            notify_price_drop: item.notify_price_drop,
            notify_status_change: item.notify_status_change,
            notify_similar: item.notify_similar,
            notify_email: item.notify_email,
            notify_push: item.notify_push,
            paused: item.paused,
            baseline_price_eur: item.baseline_price_eur,
            baseline_status: item.baseline_status,
          })),
          { onConflict: "user_id,ad_id" },
        );
      }

      setSavedState((prev) => ({
        ...prev,
        savedAds: nextSavedAds,
        preferences: preferencesByAdId,
        isLoading: false,
        alertsSupported,
      }));
      SAVED_TAB_CACHE.set(cacheKey, {
        key: cacheKey,
        savedAds: nextSavedAds,
        preferences: preferencesByAdId,
        alertsSupported,
      });
    } catch (err) {
      console.error("Error loading saved ads:", err);
      setSavedState((prev) => ({
        ...prev,
        savedAds: [],
        preferences: {},
        isLoading: false,
      }));
    }
  }, [cacheKey, createDefaultPreference, savedAdIds, supabase, user]);

  useEffect(() => {
    if (!cacheKey) return;
    const cached = SAVED_TAB_CACHE.get(cacheKey);
    if (!cached) return;

    setSavedState((prev) => ({
      ...prev,
      savedAds: cached.savedAds,
      preferences: cached.preferences,
      alertsSupported: cached.alertsSupported,
      isLoading: false,
    }));
  }, [cacheKey]);

  useEffect(() => {
    void loadSavedAds();
  }, [loadSavedAds]);

  const getBrandName = (ad: SavedAd) => ad.brands?.name || t("unknown");
  const getModelName = (ad: SavedAd) => ad.models?.name || "";
  const getPhoto = (ad: SavedAd) => {
    if (ad.photos_json && ad.photos_json.length > 0) {
      return optimizeCloudflareImage(ad.photos_json[0], {
        width: 640,
        height: 400,
        fit: "cover",
        quality: 82,
        format: "auto",
      });
    }
    return "/placeholder-car.jpg";
  };
  const getFuelLabel = (fuel: string) => {
    const labels: Record<string, string> = {
      petrol: tFuel("petrol"),
      diesel: tFuel("diesel"),
      electric: tFuel("electric"),
      hybrid: tFuel("hybrid"),
      lpg: tFuel("lpg"),
      cng: tFuel("cng"),
    };
    return labels[fuel] || fuel;
  };

  const getStatusLabel = useCallback(
    (status: string) => {
      switch (status) {
        case "active":
          return t("active");
        case "sold":
          return t("sold");
        case "expired":
          return t("expired");
        case "pending":
          return t("pending");
        case "rejected":
          return t("rejected");
        default:
          return status || t("unknown");
      }
    },
    [t],
  );

  const updatePreference = useCallback(
    async (adId: string, patch: Partial<SavedAdAlertPreference>) => {
      if (!user || !savedState.alertsSupported) return;

      const current = savedState.preferences[adId];
      if (!current) return;

      const optimistic = { ...current, ...patch };
      setSavedState((prev) => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          [adId]: optimistic,
        },
        updatingAdId: adId,
      }));

      const { error } = await supabase
        .from("saved_ad_alert_preferences")
        .update({
          notify_price_drop: optimistic.notify_price_drop,
          notify_status_change: optimistic.notify_status_change,
          notify_similar: optimistic.notify_similar,
          notify_email: optimistic.notify_email,
          notify_push: optimistic.notify_push,
          paused: optimistic.paused,
        })
        .eq("user_id", user.id)
        .eq("ad_id", adId);

      if (error) {
        console.error("Error updating alert preference:", error);
        setSavedState((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            [adId]: current,
          },
        }));
      }

      setSavedState((prev) => ({
        ...prev,
        updatingAdId: prev.updatingAdId === adId ? null : prev.updatingAdId,
      }));
    },
    [savedState.alertsSupported, savedState.preferences, supabase, user],
  );

  const applyPreferenceToAll = useCallback(
    async (patch: Partial<SavedAdAlertPreference>) => {
      if (!user || !savedState.alertsSupported || savedState.savedAds.length === 0) return;

      const previousPreferences = savedState.preferences;
      const adIds = savedState.savedAds.map((ad) => ad.id);
      const nextPreferences = { ...previousPreferences };

      for (const adId of adIds) {
        const current = nextPreferences[adId];
        if (!current) continue;
        nextPreferences[adId] = { ...current, ...patch };
      }

      setSavedState((prev) => ({
        ...prev,
        preferences: nextPreferences,
        isBulkUpdating: true,
      }));

      const { error } = await supabase
        .from("saved_ad_alert_preferences")
        .update({
          notify_price_drop: patch.notify_price_drop,
          notify_status_change: patch.notify_status_change,
          notify_similar: patch.notify_similar,
          notify_email: patch.notify_email,
          notify_push: patch.notify_push,
          paused: patch.paused,
        })
        .eq("user_id", user.id)
        .in("ad_id", adIds);

      if (error) {
        console.error("Error applying bulk alert preference update:", error);
        setSavedState((prev) => ({
          ...prev,
          preferences: previousPreferences,
        }));
      }

      setSavedState((prev) => ({
        ...prev,
        isBulkUpdating: false,
      }));
    },
    [savedState.alertsSupported, savedState.preferences, savedState.savedAds, supabase, user],
  );

  const handleUnsaveClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    onUnsave(id);
  };

  const derivedSavedAds = useMemo(() => {
    return savedState.savedAds.map((ad) => {
      const preference = savedState.preferences[ad.id] || createDefaultPreference(ad);
      return { ad, preference };
    });
  }, [createDefaultPreference, savedState.preferences, savedState.savedAds]);

  if (savedState.isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {["saved-skeleton-1", "saved-skeleton-2", "saved-skeleton-3"].map(
          (skeletonKey) => (
            <div
              key={skeletonKey}
              className="market-card animate-pulse overflow-hidden"
            >
              <div className="aspect-[16/10] bg-surface" />
              <div className="p-4 space-y-3">
                <div className="h-5 bg-surface rounded w-3/4" />
                <div className="h-4 bg-surface rounded w-1/2" />
                <div className="h-6 bg-surface rounded w-1/3" />
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  if (savedState.savedAds.length === 0) {
    return (
      <div className="market-panel mx-auto max-w-xl p-8 text-center sm:p-10">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-primary/12 bg-primary/5 text-primary">
          <HeartIcon className="size-8" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-primary">{t("savedAds")}</h3>
        <p className="text-secondary mb-4">{t("clickHeartToSave")}</p>
        <Link
          href="/vysledky"
          className="market-action-primary inline-flex px-6 py-3 text-sm"
        >
          {t("browseCars")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-primary/10 bg-primary/5 p-4 sm:p-5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold text-primary">{t("savedAds")}</h3>
            <span className="rounded-full bg-background px-3 py-1 text-sm font-semibold text-primary">
              {savedState.savedAds.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-secondary">{t("savedAlertsDescription")}</p>
        </div>

        {!savedState.alertsSupported && (
          <p className="mt-4 text-sm text-warning">{t("alertsUnavailable")}</p>
        )}

        <div className="mt-5 border-t border-primary/10 pt-4">
          <h4 className="text-sm font-semibold text-primary">{t("bulkAlertsTitle")}</h4>
          <p className="mt-1 text-xs text-secondary">{t("bulkAlertsDescription")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                void applyPreferenceToAll({ paused: true });
              }}
              disabled={!savedState.alertsSupported || savedState.isBulkUpdating}
              className="market-action-secondary min-h-11 px-4 py-2 text-sm disabled:opacity-50"
            >
              {t("pauseAllAlerts")}
            </button>
            <button
              type="button"
              onClick={() => {
                void applyPreferenceToAll({ paused: false });
              }}
              disabled={!savedState.alertsSupported || savedState.isBulkUpdating}
              className="market-action-primary min-h-11 px-4 py-2 text-sm disabled:opacity-50"
            >
              {t("resumeAllAlerts")}
            </button>
          </div>
        </div>

        {savedState.isBulkUpdating && (
          <p className="mt-3 text-xs text-tertiary">{t("updatingAlerts")}</p>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {derivedSavedAds.map(({ ad, preference }) => (
            <div
              key={ad.id}
              className="market-card overflow-hidden bg-background"
            >
              <Link
                href={buildAdPath({
                  id: ad.id,
                  brand: getBrandName(ad),
                  model: getModelName(ad),
                  year: ad.year,
                })}
                className="relative block aspect-[16/10]"
              >
                <Image
                  src={getPhoto(ad)}
                  alt={`${getBrandName(ad)} ${getModelName(ad)}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </Link>
              <div className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Link
                    href={buildAdPath({
                      id: ad.id,
                      brand: getBrandName(ad),
                      model: getModelName(ad),
                      year: ad.year,
                    })}
                    className="font-semibold text-primary transition-colors hover:text-accent"
                  >
                    {getBrandName(ad)} {getModelName(ad)}
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => handleUnsaveClick(e, ad.id)}
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-error/35 bg-error/5 px-3.5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40 sm:w-auto"
                    title={t("removeFromSaved")}
                  >
                    <XIcon className="size-4" aria-hidden="true" />
                    {t("removeFromSaved")}
                  </button>
                </div>
                <p className="mt-2 text-sm text-secondary">
                  {[ad.year, ad.mileage_km ? `${ad.mileage_km.toLocaleString(localeTag)} km` : null, ad.location_city || inlineCopy.wholeMarket]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xl font-bold text-accent">
                    {ad.price_eur?.toLocaleString(localeTag)} EUR
                  </span>
                  <span className="inline-flex items-center rounded-full bg-background-muted px-2 py-0.5 text-xs font-medium text-secondary">
                    {getStatusLabel(ad.status)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-tertiary">{getFuelLabel(ad.fuel || "")}</p>

                <div className="mt-4 rounded-xl border border-border-strong bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {t("alertSettings")}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        preference.paused
                          ? "bg-warning/10 text-warning"
                          : "bg-success/10 text-success"
                      }`}
                    >
                      {preference.paused ? t("alertsPaused") : t("active")}
                    </span>
                  </div>
                   <p className="mt-1 text-[11px] text-secondary">
                     {t("baselineAtSave")}: {preference.baseline_price_eur?.toLocaleString(localeTag) || ad.price_eur?.toLocaleString(localeTag)} EUR
                   </p>
                   <div className="mt-3 space-y-2">
                     <SavedAlertCheckbox
                       id={`saved-alert-price-drop-${ad.id}`}
                       title={t("notifyOnPriceDrop")}
                       description={t("notifyOnPriceDropHelp")}
                       checked={preference.notify_price_drop}
                       disabled={!savedState.alertsSupported || savedState.isBulkUpdating || savedState.updatingAdId === ad.id}
                       onChange={(checked) => {
                         void updatePreference(ad.id, { notify_price_drop: checked });
                       }}
                     />
                     <SavedAlertCheckbox
                       id={`saved-alert-status-change-${ad.id}`}
                       title={t("notifyOnStatusChange")}
                       description={t("notifyOnStatusChangeHelp")}
                       checked={preference.notify_status_change}
                       disabled={!savedState.alertsSupported || savedState.isBulkUpdating || savedState.updatingAdId === ad.id}
                       onChange={(checked) => {
                         void updatePreference(ad.id, { notify_status_change: checked });
                       }}
                     />
                     <SavedAlertCheckbox
                       id={`saved-alert-email-${ad.id}`}
                       title={t("notifyByEmail")}
                       description={t("notifyByEmailHelp")}
                       checked={preference.notify_email}
                       disabled={!savedState.alertsSupported || savedState.isBulkUpdating || savedState.updatingAdId === ad.id}
                       onChange={(checked) => {
                         void updatePreference(ad.id, { notify_email: checked });
                       }}
                     />
                     <SavedAlertCheckbox
                       id={`saved-alert-pause-${ad.id}`}
                       title={t("pauseThisAlert")}
                       description={t("pauseThisAlertHelp")}
                       checked={preference.paused}
                       disabled={!savedState.alertsSupported || savedState.isBulkUpdating || savedState.updatingAdId === ad.id}
                       onChange={(checked) => {
                         void updatePreference(ad.id, { paused: checked });
                       }}
                     />
                   </div>
                 </div>
               </div>
              </div>
          ))}
      </div>
    </div>
  );
}
// Messages Tab (functional)
type MessagesTabState = {
  conversations: MessageConversation[];
  activeConversation: string | null;
  isLoading: boolean;
  error: string;
};

type MessagesTabStateAction =
  | MessagesTabState
  | ((current: MessagesTabState) => MessagesTabState);

type MessagesTabUiState = {
  replyMessage: string;
  replyCaptchaToken: string | null;
  captchaInstanceKey: number;
  isSendingReply: boolean;
  isDeletingMessage: boolean;
  isUpdatingQualification: boolean;
  isMobileConversationOpen: boolean;
};

function messagesTabStateReducer(
  state: MessagesTabState,
  action: MessagesTabStateAction,
): MessagesTabState {
  return typeof action === "function" ? action(state) : action;
}

function messagesTabUiReducer(
  state: MessagesTabUiState,
  patch: Partial<MessagesTabUiState> | ((current: MessagesTabUiState) => MessagesTabUiState),
): MessagesTabUiState {
  return typeof patch === "function" ? patch(state) : { ...state, ...patch };
}

function normalizeInquiryRows(data: unknown): InquiryRow[] {
  if (!Array.isArray(data)) return [];

  return data.map((entry) => {
    const row = entry as InquiryRow & { ads?: InquiryRow["ads"] | InquiryRow["ads"][] };
    const adValue = Array.isArray(row.ads) ? (row.ads[0] ?? null) : (row.ads ?? null);
    return { ...row, ads: adValue };
  });
}

function mapProfileNames(data: unknown): Record<string, string> {
  if (!Array.isArray(data)) return {};
  const result: Record<string, string> = {};

  for (const entry of data) {
    const row = entry as { id?: string; full_name?: string | null };
    if (typeof row.id !== "string") continue;
    result[row.id] =
      typeof row.full_name === "string" && row.full_name.trim().length > 0
        ? row.full_name.trim()
        : "Používateľ";
  }

  return result;
}

function MessagesTab() {
  return useMessagesTabView();
}

function useMessagesTabView() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const localeTag = getLocaleTag(locale);
  const inlineCopy = useMemo(() => getAccountInlineCopy(locale), [locale]);
  const userId = user?.id ?? null;
  const cachedMessages = userId ? MESSAGES_TAB_CACHE.get(userId) : null;
  const [messagesState, updateMessagesState] = useReducer(
    messagesTabStateReducer,
    {
      conversations: cachedMessages?.conversations || [],
      activeConversation:
        cachedMessages?.activeConversation || (cachedMessages?.conversations[0]?.id ?? null),
      isLoading: !cachedMessages,
      error: "",
    },
  );
  const [reloadToken, requestMessagesReload] = useReducer((value: number) => value + 1, 0);
  const [messageUiState, updateMessageUiState] = useReducer(messagesTabUiReducer, {
    replyMessage: "",
    replyCaptchaToken: null,
    captchaInstanceKey: 0,
    isSendingReply: false,
    isDeletingMessage: false,
    isUpdatingQualification: false,
    isMobileConversationOpen: false,
  });
  const {
    replyMessage,
    replyCaptchaToken,
    captchaInstanceKey,
    isSendingReply,
    isDeletingMessage,
    isUpdatingQualification,
    isMobileConversationOpen,
  } = messageUiState;

  useEffect(() => {
    if (!userId) {
      updateMessagesState({
        conversations: [],
        activeConversation: null,
        isLoading: false,
        error: "",
      });
      return;
    }

    const cached = MESSAGES_TAB_CACHE.get(userId);
    if (!cached) {
      updateMessagesState({
        conversations: [],
        activeConversation: null,
        isLoading: true,
        error: "",
      });
      return;
    }

    updateMessagesState({
      conversations: cached.conversations,
      activeConversation:
        cached.activeConversation || (cached.conversations[0]?.id ?? null),
      isLoading: false,
      error: "",
    });
  }, [userId]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString(localeTag, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    if (diffDays === 1) return t("yesterday");
    return date.toLocaleDateString(localeTag);
  };

  useEffect(() => {
    let isCancelled = false;

    const run = async () => {
      if (!userId) {
        if (isCancelled) return;
        updateMessagesState({
          conversations: [],
          activeConversation: null,
          isLoading: false,
          error: "",
        });
        return;
      }

      if (!isCancelled) {
        updateMessagesState((prev) => ({
          ...prev,
          isLoading: prev.conversations.length === 0,
          error: "",
        }));
      }

      if (isCancelled) return;

      const { data, error } = await supabase
        .from("inquiries")
        .select(
          "id, sender_id, recipient_id, message, is_read, is_qualified, qualified_at, created_at, ads(id, brand, model, photos_json, seller_id)",
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (!isCancelled) {
        if (error) {
          updateMessagesState((prev) => ({
            ...prev,
            isLoading: false,
            error: error.message || inlineCopy.messagesLoadFailed,
          }));
        } else {
          const inquiryRows = normalizeInquiryRows(data);
          const userIdSet = new Set<string>();
          for (const row of inquiryRows) {
            if (row.sender_id) {
              userIdSet.add(row.sender_id);
            }
            if (row.recipient_id) {
              userIdSet.add(row.recipient_id);
            }
          }
          const userIds = Array.from(userIdSet);

          let profileNames: Record<string, string> = {};
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from("public_profiles")
              .select("id, full_name")
              .in("id", userIds);
            if (!isCancelled) {
              profileNames = mapProfileNames(profiles);
            }
          }

          if (!isCancelled) {
            const conversations = mapInquiriesToConversations(
              inquiryRows,
              userId,
              profileNames,
              {
                fallbackCarTitle: inlineCopy.fallbackCarTitle,
                incomingLabel: inlineCopy.incomingLabel,
                outgoingLabel: inlineCopy.outgoingLabel,
              },
            );

            updateMessagesState((prev) => {
              const hasActiveSelection =
                !!prev.activeConversation &&
                conversations.some((conv) => conv.id === prev.activeConversation);

              return {
                conversations,
                activeConversation: hasActiveSelection
                  ? prev.activeConversation
                  : (conversations[0]?.id ?? null),
                isLoading: false,
                error: "",
              };
            });
          }
        }
      }
    };

    queueMicrotask(() => {
      void run();
    });

    return () => {
      isCancelled = true;
    };
  }, [inlineCopy, supabase, userId, reloadToken]);

  const activeConversation = messagesState.activeConversation
    ? messagesState.conversations.find(
        (conv) => conv.id === messagesState.activeConversation,
      ) || null
    : null;

  useEffect(() => {
    if (!userId) return;
    MESSAGES_TAB_CACHE.set(userId, {
      conversations: messagesState.conversations,
      activeConversation: messagesState.activeConversation,
    });
  }, [userId, messagesState.activeConversation, messagesState.conversations]);

  useEffect(() => {
    if (!activeConversation) {
      updateMessageUiState({ isMobileConversationOpen: false });
    }
  }, [activeConversation]);

  useEffect(() => {
    updateMessageUiState((current) => ({
      ...current,
      replyMessage: "",
      replyCaptchaToken: null,
      captchaInstanceKey: current.captchaInstanceKey + 1,
    }));
  }, [messagesState.activeConversation]);

  const markConversationRead = useCallback(
    async (conversationId: string, unread: number) => {
      if (unread === 0) return;

      updateMessagesState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((conv) =>
          conv.id === conversationId ? { ...conv, unread: 0 } : conv,
        ),
      }));

      await supabase.from("inquiries").update({ is_read: true }).eq("id", conversationId);
    },
    [supabase],
  );

  const sendReply = useCallback(async () => {
    if (!activeConversation?.adId || !activeConversation.counterpartyId) {
      toast.error(inlineCopy.cannotReply);
      return;
    }

    if (!replyMessage.trim()) {
      return;
    }

    if (!replyCaptchaToken) {
      toast.error(inlineCopy.confirmCaptcha);
      return;
    }

    updateMessageUiState({ isSendingReply: true });
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: activeConversation.adId,
          recipientId: activeConversation.counterpartyId,
          message: replyMessage,
          captchaToken: replyCaptchaToken,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        toast.error(payload?.error || inlineCopy.replyFailed);
        return;
      }

      toast.success(inlineCopy.replySent);
      updateMessageUiState((current) => ({
        ...current,
        replyMessage: "",
      }));
      requestMessagesReload();
    } catch {
      toast.error(inlineCopy.replyFailed);
    } finally {
      updateMessageUiState((current) => ({
        ...current,
        replyCaptchaToken: null,
        captchaInstanceKey: current.captchaInstanceKey + 1,
        isSendingReply: false,
      }));
    }
  }, [activeConversation, inlineCopy, replyCaptchaToken, replyMessage]);

  const handleDeleteMessage = useCallback(async () => {
    if (!activeConversation?.inquiryId) return;

    const confirmed = window.confirm(inlineCopy.confirmDeleteMessage);
    if (!confirmed) return;

    updateMessageUiState({ isDeletingMessage: true });
    try {
      const response = await fetch(
        `/api/inquiries?inquiryId=${encodeURIComponent(activeConversation.inquiryId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        toast.error(payload?.error || inlineCopy.deleteFailed);
        return;
      }

      toast.success(inlineCopy.messageDeleted);
      requestMessagesReload();
    } catch {
      toast.error(inlineCopy.deleteFailed);
    } finally {
      updateMessageUiState({ isDeletingMessage: false });
    }
  }, [activeConversation, inlineCopy]);

  const handleQualificationToggle = useCallback(async () => {
    if (!activeConversation?.inquiryId || !activeConversation.adId) return;
    if (!activeConversation.canQualify) return;

    updateMessageUiState({ isUpdatingQualification: true });
    try {
      const nextQualified = !activeConversation.isQualified;
      const response = await fetch("/api/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: activeConversation.inquiryId,
          isQualified: nextQualified,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            inquiryId?: string;
            adId?: string;
            isQualified?: boolean;
            wasQualifiedBefore?: boolean;
          }
        | null;

      if (!response.ok) {
        toast.error(payload?.error || inlineCopy.leadUpdateFailed);
        return;
      }

      const resolvedQualified = Boolean(payload?.isQualified);
      updateMessagesState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((conversation) =>
          conversation.id === activeConversation.inquiryId
            ? {
                ...conversation,
                isQualified: resolvedQualified,
                qualifiedAt: resolvedQualified ? new Date().toISOString() : null,
              }
            : conversation,
        ),
      }));

      if (resolvedQualified) {
        if (!payload?.wasQualifiedBefore) {
          trackAnalyticsEvent("lead_qualified", {
            leadId: activeConversation.inquiryId,
            adId: activeConversation.adId,
            qualificationMethod: "seller_dashboard_manual",
          });
        }
        toast.success(t("leadQualifiedSuccess"));
      } else {
        toast.success(t("leadQualificationRemoved"));
      }
    } catch {
      toast.error(inlineCopy.leadUpdateFailed);
    } finally {
      updateMessageUiState({ isUpdatingQualification: false });
    }
  }, [activeConversation, inlineCopy, t]);

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSendingReply && replyMessage.trim() && replyCaptchaToken) {
        void sendReply();
      }
    }
  };

  if (messagesState.isLoading) {
    return (
      <div className="space-y-3">
        {["messages-skeleton-1", "messages-skeleton-2", "messages-skeleton-3"].map(
          (key) => (
            <div
              key={key}
              className="h-20 rounded-xl border border-border bg-background-muted animate-pulse"
            />
          ),
        )}
      </div>
    );
  }

  if (messagesState.error) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-center">
        <p className="text-sm text-error mb-4">{messagesState.error}</p>
        <button
          type="button"
          onClick={() => {
            requestMessagesReload();
          }}
          className="market-action-primary px-5 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (messagesState.conversations.length === 0) {
    return (
      <div className="market-panel mx-auto max-w-xl p-8 text-center sm:p-10">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-primary/12 bg-primary/5 text-primary">
          <MessageIcon className="size-8" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-primary">
          {t("noMessages")}
        </h3>
        <p className="text-secondary">{t("messagesWillAppear")}</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-3">
      <div
        className={`${isMobileConversationOpen ? "hidden lg:block" : "block"} lg:col-span-1 min-w-0 space-y-2`}
      >
        <h3 className="text-lg font-semibold text-primary mb-4">
          {t("conversations")}
        </h3>
        {messagesState.conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => {
              updateMessagesState((prev) => ({
                ...prev,
                activeConversation: conversation.id,
              }));
              updateMessageUiState({ isMobileConversationOpen: true });
              void markConversationRead(conversation.id, conversation.unread);
            }}
            className={`w-full max-w-full overflow-hidden rounded-xl border p-4 text-left transition-all ${
              messagesState.activeConversation === conversation.id
                ? "border-accent bg-accent/5"
                : "border-border hover:border-accent/30"
            }`}
          >
            <div className="flex min-w-0 gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg">
                <Image
                  src={optimizeCloudflareImage(conversation.carPhoto, {
                    width: 96,
                    height: 96,
                    fit: "cover",
                    quality: 80,
                    format: "auto",
                  })}
                  alt={conversation.carTitle}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-primary">
                    {conversation.counterpartyName}
                  </span>
                  <span className="text-xs text-tertiary shrink-0">
                    {formatTime(conversation.lastMessageTime)}
                  </span>
                </div>
                <p className="text-sm text-secondary truncate">
                  {conversation.carTitle}
                </p>
                <p className="text-xs text-tertiary truncate mt-0.5">
                  ID: {conversation.adReference}
                </p>
                <p className="text-sm text-tertiary truncate mt-1">
                  {conversation.lastMessage}
                </p>
              </div>
              {conversation.unread > 0 && (
                <span className="size-5 rounded-full bg-accent text-white text-xs flex items-center justify-center shrink-0">
                  {conversation.unread}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className={`${isMobileConversationOpen ? "block" : "hidden lg:block"} lg:col-span-2 min-w-0`}>
        {activeConversation ? (
          <div className="market-card flex h-full min-w-0 flex-col overflow-hidden">
            <div className="p-4 border-b border-border">
              <button
                type="button"
                onClick={() => updateMessageUiState({ isMobileConversationOpen: false })}
                className="market-action-secondary mb-3 inline-flex min-h-10 items-center px-3 py-1 text-xs lg:hidden"
              >
                {inlineCopy.backTo} {t("conversations")}
              </button>
              <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={optimizeCloudflareImage(activeConversation.carPhoto, {
                      width: 96,
                      height: 96,
                      fit: "cover",
                      quality: 80,
                      format: "auto",
                    })}
                    alt={activeConversation.carTitle}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-primary">
                    {activeConversation.counterpartyName}
                  </p>
                  <p className="break-words text-sm text-secondary">
                    {activeConversation.carTitle}
                  </p>
                  <p className="text-xs text-tertiary mt-1 break-all">
                    {inlineCopy.adId}: {activeConversation.adReference}
                  </p>
                </div>
                {activeConversation.direction === "incoming" && (
                  <span className="ml-auto shrink-0 rounded-md bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                    {t("yourAd")}
                  </span>
                )}
                {activeConversation.isQualified && (
                  <span className="shrink-0 rounded-md bg-success/10 px-3 py-1 text-xs font-medium text-success">
                    {t("qualifiedLead")}
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 p-4 overflow-y-auto min-h-[300px] bg-surface/30">
              <div
                className={`flex ${
                  activeConversation.direction === "incoming"
                    ? "justify-start"
                    : "justify-end"
                }`}
              >
                <div
                  className={`max-w-full p-3 rounded-2xl sm:max-w-[80%] ${
                    activeConversation.direction === "incoming"
                      ? "bg-surface text-primary"
                      : "bg-accent text-white"
                  }`}
                >
                  <p className="text-xs uppercase tracking-wide font-semibold mb-1 opacity-80 break-words">
                    {activeConversation.senderName}
                  </p>
                  <p className="text-sm break-words">{activeConversation.lastMessage}</p>
                  <p
                    className={`text-xs mt-1 ${
                      activeConversation.direction === "incoming"
                        ? "text-tertiary"
                        : "text-white/70"
                    }`}
                  >
                    {formatTime(activeConversation.lastMessageTime)}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 p-4 border-t border-border bg-background-muted/60 space-y-3">
              <textarea
                id="dashboard-reply-message"
                name="dashboard-reply-message"
                rows={3}
                value={replyMessage}
                onChange={(event) => updateMessageUiState({ replyMessage: event.target.value })}
                onKeyDown={handleReplyKeyDown}
                placeholder={inlineCopy.replyPlaceholder}
                className="input w-full resize-none"
              />
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="mb-2 text-xs text-secondary">
                  {inlineCopy.confirmCaptcha}
                </p>
                <TurnstileCaptcha
                  key={`dashboard-reply-${captchaInstanceKey}`}
                  onTokenChange={(token) => updateMessageUiState({ replyCaptchaToken: token })}
                  action="inquiry_submit"
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-secondary">
                    {inlineCopy.enterToSend}
                  </p>
                  {activeConversation.canQualify ? (
                    <p className="mt-1 text-xs text-secondary">
                      {activeConversation.isQualified
                        ? t("leadQualifiedHelp")
                        : t("leadNotQualifiedHelp")}
                    </p>
                  ) : null}
                  {!replyCaptchaToken ? (
                    <p className="mt-1 text-xs text-accent">
                      {inlineCopy.captchaEnablesSend}
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  {activeConversation.canQualify ? (
                    <button
                      type="button"
                      onClick={() => void handleQualificationToggle()}
                      disabled={isUpdatingQualification}
                    className={`market-action-secondary w-full px-4 py-2 text-sm disabled:opacity-50 sm:w-auto ${
                        activeConversation.isQualified
                          ? "border border-success/30 text-success hover:bg-success/5"
                          : "border border-border text-primary hover:bg-background"
                      }`}
                    >
                      {isUpdatingQualification
                        ? t("saving")
                        : activeConversation.isQualified
                          ? t("removeLeadQualification")
                          : t("markLeadQualified")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void sendReply()}
                    disabled={isSendingReply || !replyMessage.trim() || !replyCaptchaToken}
                    className="market-action-primary w-full px-4 py-2 text-sm disabled:opacity-50 sm:w-auto"
                  >
                    {isSendingReply ? inlineCopy.sending : inlineCopy.reply}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteMessage()}
                    disabled={isDeletingMessage}
                    className="market-action-secondary w-full border-error/30 px-4 py-2 text-sm text-error hover:bg-error/5 disabled:opacity-50 sm:w-auto"
                  >
                    {isDeletingMessage ? inlineCopy.deleting : inlineCopy.deleteMessage}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="market-card flex h-full items-center justify-center p-12">
            <div className="text-center">
              <MessageIcon className="size-12 mx-auto text-tertiary mb-4" />
              <p className="text-secondary">{t("selectConversation")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
type SettingsProfile = {
  full_name?: string | null;
  phone?: string | null;
  notify_moderation_email?: boolean;
} | null;

type SettingsStatusMessage = {
  type: "success" | "error";
  text: string;
};

type SettingsTabState = {
  phone: string;
  isSaving: boolean;
  saveMessage: SettingsStatusMessage | null;
  newPassword: string;
  confirmPassword: string;
  isUpdatingPassword: boolean;
  passwordMessage: SettingsStatusMessage | null;
  deleteConfirm: string;
  isDeletingAccount: boolean;
  deleteMessage: SettingsStatusMessage | null;
};

type SettingsTabAction =
  | { type: "setPhone"; value: string }
  | { type: "setIsSaving"; value: boolean }
  | { type: "setSaveMessage"; value: SettingsStatusMessage | null }
  | { type: "setNewPassword"; value: string }
  | { type: "setConfirmPassword"; value: string }
  | { type: "setIsUpdatingPassword"; value: boolean }
  | { type: "setPasswordMessage"; value: SettingsStatusMessage | null }
  | { type: "setDeleteConfirm"; value: string }
  | { type: "setIsDeletingAccount"; value: boolean }
  | { type: "setDeleteMessage"; value: SettingsStatusMessage | null };

const REQUEST_TIMEOUT_MS = 15000;

function normalizePhoneNumber(raw: string, countryCode: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const hasPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (hasPlus) return `+${digitsOnly}`;
  if (digitsOnly.startsWith(countryCode)) return `+${digitsOnly}`;
  if (digitsOnly.startsWith("0") && digitsOnly.length >= 9) {
    return `+${countryCode}${digitsOnly.slice(1)}`;
  }
  if (digitsOnly.length === 9) return `+${countryCode}${digitsOnly}`;

  return trimmed;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function settingsTabReducer(
  state: SettingsTabState,
  action: SettingsTabAction,
): SettingsTabState {
  switch (action.type) {
    case "setPhone":
      return { ...state, phone: action.value };
    case "setIsSaving":
      return { ...state, isSaving: action.value };
    case "setSaveMessage":
      return { ...state, saveMessage: action.value };
    case "setNewPassword":
      return { ...state, newPassword: action.value };
    case "setConfirmPassword":
      return { ...state, confirmPassword: action.value };
    case "setIsUpdatingPassword":
      return { ...state, isUpdatingPassword: action.value };
    case "setPasswordMessage":
      return { ...state, passwordMessage: action.value };
    case "setDeleteConfirm":
      return { ...state, deleteConfirm: action.value };
    case "setIsDeletingAccount":
      return { ...state, isDeletingAccount: action.value };
    case "setDeleteMessage":
      return { ...state, deleteMessage: action.value };
    default:
      return state;
  }
}

function createInitialSettingsTabState(profile: SettingsProfile): SettingsTabState {
  return {
    phone: profile?.phone || "",
    isSaving: false,
    saveMessage: null,
    newPassword: "",
    confirmPassword: "",
    isUpdatingPassword: false,
    passwordMessage: null,
    deleteConfirm: "",
    isDeletingAccount: false,
    deleteMessage: null,
  };
}

function SettingsStatusAlert({
  message,
  className = "",
}: {
  message: SettingsStatusMessage | null;
  className?: string;
}) {
  if (!message) return null;

  return (
    <div
      className={`${className} px-4 py-2 rounded-lg text-sm font-medium ${
        message.type === "success"
          ? "bg-success/10 text-success"
          : "bg-error/10 text-error"
      }`}
    >
      {message.text}
    </div>
  );
}

function SettingsAccountInfoSection({ profile }: { profile: SettingsProfile }) {
  const t = useTranslations("dashboard");

  return (
    <div className="market-card bg-surface/50 p-6">
      <h2 className="text-lg font-semibold text-primary mb-4">{t("accountInfo")}</h2>
      <div className="space-y-3">
        <div className="flex justify-between items-center py-2 border-b border-border">
          <span className="text-secondary">{t("name")}</span>
          <span className="font-medium text-primary">
            {profile?.full_name || t("notProvided")}
          </span>
        </div>
        <p className="text-xs text-tertiary">{t("contactAdminToChangeName")}</p>
      </div>
    </div>
  );
}

function SettingsContactInfoSection({
  phone,
  onPhoneChange,
  onPhoneBlur,
  saveMessage,
  onSave,
  isSaving,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  onPhoneBlur: () => void;
  saveMessage: SettingsStatusMessage | null;
  onSave: () => void;
  isSaving: boolean;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const phonePlaceholder = useMarket().phonePlaceholder;

  return (
    <div className="market-card p-6">
      <h2 className="text-lg font-semibold text-primary mb-4">{t("contactInfo")}</h2>
      <form
        className="space-y-4"
        action={() => {
          onSave();
        }}
      >
        <div>
          <label
            htmlFor="dashboard-settings-phone"
            className="block text-sm font-medium text-primary mb-2"
          >
            {t("phoneNumber")}
          </label>
          <input
            id="dashboard-settings-phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onBlur={onPhoneBlur}
            placeholder={phonePlaceholder}
            className="input"
            autoComplete="tel"
          />
          <p className="text-xs text-tertiary mt-1">{t("phoneVisibility")}</p>
        </div>

        <SettingsStatusAlert message={saveMessage} />

        <button
          type="submit"
          disabled={isSaving}
          className="market-action-primary px-6 py-2.5 disabled:opacity-50"
        >
          {isSaving ? tCommon("loading") : t("saveChanges")}
        </button>
      </form>
    </div>
  );
}

function SettingsSecuritySection({
  newPassword,
  confirmPassword,
  isPasswordFormValid,
  onNewPasswordChange,
  onConfirmPasswordChange,
  passwordMessage,
  onChangePassword,
  isUpdatingPassword,
}: {
  newPassword: string;
  confirmPassword: string;
  isPasswordFormValid: boolean;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  passwordMessage: SettingsStatusMessage | null;
  onChangePassword: () => void;
  isUpdatingPassword: boolean;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const isSubmitDisabled = isUpdatingPassword || !isPasswordFormValid;

  return (
    <div className="market-card bg-surface/50 p-6">
      <h2 className="text-lg font-semibold text-primary mb-4">{t("security")}</h2>
      <form
        className="space-y-4"
        action={() => {
          onChangePassword();
        }}
      >
        <div>
          <label
            htmlFor="dashboard-settings-new-password"
            className="block text-sm font-medium text-primary mb-2"
          >
            {t("newPassword")}
          </label>
          <input
            id="dashboard-settings-new-password"
            name="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => onNewPasswordChange(e.target.value)}
            className="input"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
          <p className="text-xs text-tertiary mt-1">
            {t("passwordMinLength", { min: MIN_PASSWORD_LENGTH })}
          </p>
        </div>
        <div>
          <label
            htmlFor="dashboard-settings-confirm-password"
            className="block text-sm font-medium text-primary mb-2"
          >
            {t("confirmPassword")}
          </label>
          <input
            id="dashboard-settings-confirm-password"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            className="input"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>
        <p className="text-xs text-tertiary -mt-1">{t("passwordDirectSetHint")}</p>

        <SettingsStatusAlert message={passwordMessage} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="market-action-primary px-6 py-2.5 disabled:opacity-50"
          >
            {isUpdatingPassword ? tCommon("loading") : t("changePassword")}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsDangerZoneSection({
  onSignOut,
  deleteConfirm,
  onDeleteConfirmChange,
  deleteMessage,
  onDeleteAccount,
  isDeletingAccount,
}: {
  onSignOut: () => Promise<void>;
  deleteConfirm: string;
  onDeleteConfirmChange: (value: string) => void;
  deleteMessage: SettingsStatusMessage | null;
  onDeleteAccount: () => void;
  isDeletingAccount: boolean;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  return (
    <div className="rounded-xl border border-error/30 bg-error/5 p-6">
      <h2 className="text-lg font-semibold text-error mb-2">{t("dangerZone")}</h2>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-secondary mb-4">{t("logoutWarning")}</p>
          <button
            onClick={() => {
              void onSignOut();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-error px-6 py-2.5 font-semibold text-white transition-colors hover:bg-error/90"
          >
            {tCommon("logout")}
          </button>
        </div>

        <form
          className="pt-6 border-t border-error/20"
          action={() => {
            onDeleteAccount();
          }}
        >
          <h3 className="text-sm font-semibold text-error mb-2">{t("deleteAccount")}</h3>
          <p className="text-sm text-secondary mb-4">{t("deleteAccountWarning")}</p>
          <label
            htmlFor="dashboard-delete-confirm"
            className="block text-sm font-medium text-primary mb-2"
          >
            {t("deleteConfirmLabel")}
          </label>
          <input
            id="dashboard-delete-confirm"
            name="deleteConfirm"
            type="text"
            value={deleteConfirm}
            onChange={(e) => onDeleteConfirmChange(e.target.value)}
            className="input"
            placeholder="DELETE"
            autoComplete="off"
          />

          <SettingsStatusAlert message={deleteMessage} className="mt-4" />

          <button
            type="submit"
            disabled={isDeletingAccount || deleteConfirm.trim().toUpperCase() !== "DELETE"}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-error px-6 py-2.5 font-semibold text-white transition-colors hover:bg-error/90 disabled:opacity-50"
          >
            {isDeletingAccount ? tCommon("loading") : t("deleteAccount")}
          </button>
        </form>
      </div>
    </div>
  );
}

// Settings Tab - simplified, name change removed per user request
function SettingsTab({
  profile,
  signOut,
}: {
  profile: SettingsProfile;
  signOut: () => Promise<void>;
}) {
  const { user, refreshProfile } = useAuth();
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const market = useMarket();
  const supabase = useMemo(() => createClient(), []);
  const [state, dispatch] = useReducer(
    settingsTabReducer,
    profile,
    createInitialSettingsTabState,
  );
  const {
    phone,
    isSaving,
    saveMessage,
    newPassword,
    confirmPassword,
    isUpdatingPassword,
    passwordMessage,
    deleteConfirm,
    isDeletingAccount,
    deleteMessage,
  } = state;

  const isPasswordFormValid =
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirmPassword;

  const handleChangePassword = async () => {
    if (!user) return;

    dispatch({ type: "setIsUpdatingPassword", value: true });
    dispatch({ type: "setPasswordMessage", value: null });

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      dispatch({
        type: "setPasswordMessage",
        value: {
          type: "error",
          text: t("passwordMinLength", { min: MIN_PASSWORD_LENGTH }),
        },
      });
      dispatch({ type: "setIsUpdatingPassword", value: false });
      return;
    }

    if (newPassword !== confirmPassword) {
      dispatch({
        type: "setPasswordMessage",
        value: { type: "error", text: t("passwordMismatch") },
      });
      dispatch({ type: "setIsUpdatingPassword", value: false });
      return;
    }

    const submitPasswordChange = () =>
      withTimeout(
        fetch("/api/account/password", {
          method: "POST",
          headers: createCsrfHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            password: newPassword,
          }),
        }),
        REQUEST_TIMEOUT_MS,
      );

    try {
      let response = await submitPasswordChange();
      let payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; code?: string }
        | null;

      if (response.status === 403 && payload?.code === "mfa_required") {
        const code = window.prompt(
          locale === "ro"
            ? "Introduceți codul de 6 cifre din aplicația de autentificare."
            : "Zadajte 6-miestny kód z autentifikačnej aplikácie.",
        )?.trim();

        if (!code) {
          dispatch({
            type: "setPasswordMessage",
            value: { type: "error", text: t("passwordUpdateFailed") },
          });
          return;
        }

        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const factor = factors?.all?.find(
          (candidate) => candidate.status === "verified",
        );
        if (!factor) throw new Error("No verified MFA factor");

        const { data: challenge, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challengeError) throw challengeError;

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.id,
          code,
        });
        if (verifyError) throw verifyError;

        response = await submitPasswordChange();
        payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string; code?: string }
          | null;
      }

      if (!response.ok || !payload?.ok) {
        dispatch({
          type: "setPasswordMessage",
          value: {
            type: "error",
            text: payload?.error || t("passwordUpdateFailed"),
          },
        });
        return;
      }

      dispatch({
        type: "setPasswordMessage",
        value: { type: "success", text: t("passwordUpdated") },
      });
      dispatch({ type: "setNewPassword", value: "" });
      dispatch({ type: "setConfirmPassword", value: "" });
    } catch (err) {
      dispatch({
        type: "setPasswordMessage",
        value: {
          type: "error",
          text:
            err instanceof Error && err.message === "timeout"
              ? t("requestTimeout")
              : t("passwordUpdateFailed"),
        },
      });
    } finally {
      dispatch({ type: "setIsUpdatingPassword", value: false });
    }
  };

  const handleSavePhone = async () => {
    if (!user) return;
    dispatch({ type: "setIsSaving", value: true });
    dispatch({ type: "setSaveMessage", value: null });

    try {
      const nextPhone = normalizePhoneNumber(phone, market.callingCode);
      dispatch({ type: "setPhone", value: nextPhone });

      const phoneResponse = await withTimeout(
        fetch("/api/account/phone", {
          method: "POST",
          headers: createCsrfHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            phone: nextPhone.length ? nextPhone : null,
          }),
        }),
        REQUEST_TIMEOUT_MS,
      );

      const phonePayload = (await phoneResponse.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!phoneResponse.ok) {
        dispatch({
          type: "setSaveMessage",
          value: {
            type: "error",
            text:
              phonePayload?.error ||
              t("saveFailed"),
          },
        });
      } else {
        dispatch({
          type: "setSaveMessage",
          value: { type: "success", text: t("changesSaved") },
        });
        await refreshProfile().catch(() => undefined);
      }
    } catch (err) {
      dispatch({
        type: "setSaveMessage",
        value: {
          type: "error",
          text:
            err instanceof Error && err.message === "timeout"
              ? t("requestTimeout")
              : t("saveFailed"),
        },
      });
    } finally {
      dispatch({ type: "setIsSaving", value: false });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      dispatch({
        type: "setDeleteMessage",
        value: { type: "error", text: t("deleteConfirmMismatch") },
      });
      return;
    }

    dispatch({ type: "setIsDeletingAccount", value: true });
    dispatch({ type: "setDeleteMessage", value: null });

    try {
      const response = await withTimeout(
        fetch("/api/account/delete", {
          method: "POST",
          headers: createCsrfHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ confirm: "DELETE" }),
        }),
        REQUEST_TIMEOUT_MS,
      );

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok) {
        dispatch({
          type: "setDeleteMessage",
          value: {
            type: "error",
            text: payload?.error || t("deleteFailed"),
          },
        });
        return;
      }

      dispatch({
        type: "setDeleteMessage",
        value: { type: "success", text: t("accountDeleted") },
      });
      window.location.href = "/";
    } catch (err) {
      dispatch({
        type: "setDeleteMessage",
        value: {
          type: "error",
          text:
            err instanceof Error && err.message === "timeout"
              ? t("requestTimeout")
              : t("deleteFailed"),
        },
      });
    } finally {
      dispatch({ type: "setIsDeletingAccount", value: false });
    }
  };

  return (
    <div className="max-w-lg space-y-8">
      <SettingsAccountInfoSection profile={profile} />
      <SettingsContactInfoSection
        phone={phone}
        onPhoneChange={(value) => dispatch({ type: "setPhone", value })}
        onPhoneBlur={() =>
          dispatch({
            type: "setPhone",
            value: normalizePhoneNumber(phone, market.callingCode),
          })
        }
        saveMessage={saveMessage}
        onSave={() => {
          void handleSavePhone();
        }}
        isSaving={isSaving}
      />
      <SettingsSecuritySection
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        isPasswordFormValid={isPasswordFormValid}
        onNewPasswordChange={(value) => dispatch({ type: "setNewPassword", value })}
        onConfirmPasswordChange={(value) =>
          dispatch({ type: "setConfirmPassword", value })
        }
        passwordMessage={passwordMessage}
        onChangePassword={() => {
          void handleChangePassword();
        }}
        isUpdatingPassword={isUpdatingPassword}
      />
      <SettingsDangerZoneSection
        onSignOut={signOut}
        deleteConfirm={deleteConfirm}
        onDeleteConfirmChange={(value) =>
          dispatch({ type: "setDeleteConfirm", value })
        }
        deleteMessage={deleteMessage}
        onDeleteAccount={() => {
          void handleDeleteAccount();
        }}
        isDeletingAccount={isDeletingAccount}
      />
    </div>
  );
}
