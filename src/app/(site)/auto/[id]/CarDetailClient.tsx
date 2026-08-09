"use client";

import {
  type ClipboardEvent,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useReducer,
  useState,
} from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import {
  resolveMarketCodeFromLocale,
  type MarketCode,
} from "@/config/markets";
import { createClient } from "@/lib/supabase/client";
import type { CarData, SimilarCar } from "@/lib/cars/car-detail";
import { useAuthOptional } from "@/context/AuthContext";
import { cn } from "@/utils/cn";
import { optimizeCloudflareImage } from "@/lib/image-optimizer";
import { buildAdPath } from "@/lib/cars/ad-path";
import { getListingFallbackGallery } from "@/lib/cars/fallback-images";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { startViewTransition } from "@/utils/view-transitions";
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import TurnstileCaptcha from "@/components/security/TurnstileCaptcha";
import type { BreadcrumbTrailItem } from "@/lib/seo/breadcrumbs";
import {
  PUBLIC_MARKET_COPY,
  formatMarketCurrency,
  formatMarketNumber,
  formatPublicCarValue,
  type PublicCarValueCategory,
  type PublicMarketCopy,
} from "@/lib/market/public-copy";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  HeartIcon,
  ShareIcon,
  SpinnerIcon,
} from "@/components/ui/Icons";
import { getCityCoordinates } from "@/lib/geo/cities";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";
import { Modal } from "@/components/ui/shadcn/modal";

const SimpleMap = dynamic(() => import("@/components/SimpleMap"), {
  ssr: false,
});

interface CarDetailClientProps {
  carId: string;
  initialCar: CarData | null;
  initialSimilarCars: SimilarCar[];
  enableViewTransitions: boolean;
  breadcrumbItems: BreadcrumbTrailItem[];
  isAdminPreview: boolean;
}

interface CarDetailState {
  car: CarData | null;
  similarCars: SimilarCar[];
  isLoading: boolean;
  error: string;
  selectedImageIndex: number;
  isSaved: boolean;
  showPhone: boolean;
  showContactForm: boolean;
  contactMessage: string;
  isSendingMessage: boolean;
  messageSent: boolean;
}

type ReportCategory =
  | "fraud"
  | "duplicate"
  | "incorrect_info"
  | "prohibited"
  | "abuse"
  | "other";

type CarDetailText = {
  loadError: string;
  share: {
    copySuccess: string;
    copyError: string;
    listingText: (brand: string, model: string) => string;
    fallbackText: string;
  };
  saved: {
    loginRequired: string;
    removed: string;
    added: string;
    updateFailed: string;
  };
  message: {
    loginRequired: string;
    captchaRequired: string;
    sendFailed: string;
    sent: string;
    defaultMessage: (brand: string, model: string) => string;
  };
  report: {
    captchaRequired: string;
    failed: string;
    duplicate: string;
    sent: string;
    modalTitle: string;
    modalDescription: string;
    reasonLabel: string;
    categoryLabels: Record<ReportCategory, string>;
    detailsLabel: string;
    detailsPlaceholder: string;
    cancel: string;
    submit: string;
    submitting: string;
  };
  specs: {
    power: string;
    engine: string;
    body: string;
    color: string;
    description: string;
    equipment: string;
    location: string;
  };
  gallery: {
    previous: string;
    next: string;
    showPhoto: (index: number) => string;
    photoAlt: (brand: string, model: string, index: number) => string;
  };
  heading: {
    saveAria: string;
    removeAria: string;
    saveTooltip: string;
    removeTooltip: string;
    shareLabel: string;
    copyLabel: string;
    copyTooltip: string;
  };
  contact: {
    price: string;
    vatDeductible: string;
    note: string;
    hideForm: string;
    writeMessage: string;
    phoneNotProvided: string;
    showPhone: string;
    report: string;
    tip: string;
    inbox: string;
    antiSpam: string;
    sentTitle: string;
    sentDescription: string;
    openMessages: string;
    placeholder: string;
    enterHint: string;
    sendInquiry: string;
    sending: string;
  };
  seller: {
    title: string;
    verifiedTitle: string;
    memberSince: (year: string) => string;
  };
  similarTitle: string;
  notFound: {
    title: string;
    description: string;
    back: string;
  };
  adminPreview: {
    title: string;
    description: string;
  };
  views: (count: string) => string;
};

type ResolvedCarDetailCopy = {
  marketCode: MarketCode;
  market: PublicMarketCopy;
  text: CarDetailText;
};

interface CarDetailInteractionState {
  contactCaptchaKey: number;
  contactCaptchaToken: string | null;
  isReportModalOpen: boolean;
  isReporting: boolean;
  reportCaptchaKey: number;
  reportCaptchaToken: string | null;
  reportCategory: ReportCategory;
  reportDetails: string;
}

type CarDetailAction =
  | { type: "set_selected_image"; index: number }
  | { type: "set_saved"; isSaved: boolean }
  | { type: "toggle_phone" }
  | { type: "toggle_contact_form"; defaultMessage: string }
  | { type: "set_contact_message"; contactMessage: string }
  | { type: "send_message_start" }
  | { type: "send_message_finished"; messageSent: boolean };

const CAR_DETAIL_TEXT: Record<MarketCode, CarDetailText> = {
  SK: {
    loadError: "Inzerát sa nepodarilo načítať",
    share: {
      copySuccess: "Odkaz skopírovaný do schránky",
      copyError: "Nepodarilo sa skopírovať odkaz",
      listingText: (brand, model) =>
        `Pozrite si inzerát ${brand} ${model} na AutoNinja.`,
      fallbackText: "Pozrite si tento inzerát na AutoNinja.",
    },
    saved: {
      loginRequired: "Pre uloženie inzerátu sa musíte prihlásiť.",
      removed: "Inzerát odstránený z obľúbených",
      added: "Inzerát uložený",
      updateFailed: "Nepodarilo sa upraviť obľúbené inzeráty",
    },
    message: {
      loginRequired: "Pre odoslanie správy sa musíte prihlásiť.",
      captchaRequired: "Pred odoslaním správy potvrďte captcha.",
      sendFailed: "Nepodarilo sa odoslať dopyt.",
      sent: "Správa odoslaná",
      defaultMessage: (brand, model) =>
        `Dobrý deň, mám záujem o ${brand} ${model}. Je vozidlo stále dostupné?`,
    },
    report: {
      captchaRequired: "Pred odoslaním hlásenia potvrďte captcha.",
      failed: "Hlásenie sa nepodarilo odoslať.",
      duplicate: "Otvorené hlásenie pre tento inzerát už existuje.",
      sent: "Hlásenie bolo odoslané na kontrolu.",
      modalTitle: "Nahlásiť inzerát",
      modalDescription: "Hlásenie pošleme na kontrolu moderácii.",
      reasonLabel: "Dôvod",
      categoryLabels: {
        fraud: "Podvod / scam",
        duplicate: "Duplicitný inzerát",
        incorrect_info: "Nesprávne údaje",
        prohibited: "Zakázaný obsah",
        abuse: "Zneužitie",
        other: "Iné",
      },
      detailsLabel: "Popis problému",
      detailsPlaceholder:
        "Napíšte, čo je na inzeráte podozrivé alebo nesprávne.",
      cancel: "Zrušiť",
      submit: "Odoslať hlásenie",
      submitting: "Odosielanie...",
    },
    specs: {
      power: "Výkon",
      engine: "Objem",
      body: "Karoséria",
      color: "Farba",
      description: "Popis vozidla",
      equipment: "Výbava",
      location: "Poloha",
    },
    gallery: {
      previous: "Predchádzajúca fotografia",
      next: "Ďalšia fotografia",
      showPhoto: (index) => `Zobraziť fotografiu ${index}`,
      photoAlt: (brand, model, index) => `${brand} ${model} - fotografia ${index}`,
    },
    heading: {
      saveAria: "Uložiť do obľúbených",
      removeAria: "Odobrať z obľúbených",
      saveTooltip: "Uložiť inzerát",
      removeTooltip: "Odobrať z uložených",
      shareLabel: "Zdieľať inzerát",
      copyLabel: "Skopírovať odkaz na inzerát",
      copyTooltip: "Skopírovať odkaz",
    },
    contact: {
      price: "Cena vozidla",
      vatDeductible: "Možný odpočet DPH",
      note:
        "Najrýchlejšie je napísať správu. Predajca ju vidí okamžite a odpoveď príde priamo do vašej schránky.",
      hideForm: "Skryť formulár správy",
      writeMessage: "Napísať správu predajcovi",
      phoneNotProvided: "Telefón nie je uvedený",
      showPhone: "Zobraziť telefón",
      report: "Nahlásiť inzerát",
      tip: "Tip: krátka vecná správa zvyšuje šancu na rýchlu odpoveď.",
      inbox: "Odpoveď nájdete v Môj účet - Správy.",
      antiSpam: "Anti-spam ochrana: max 3 správy na toto vozidlo za 10 minút.",
      sentTitle: "Správa odoslaná",
      sentDescription: "Predajca vám čoskoro odpovie.",
      openMessages: "Otvoriť správy",
      placeholder: "Mám záujem o toto auto...",
      enterHint: "Enter odošle správu, Shift+Enter vloží nový riadok.",
      sendInquiry: "Odoslať dopyt",
      sending: "Odosielanie...",
    },
    seller: {
      title: "Predajca",
      verifiedTitle: "Overený predajca",
      memberSince: (year) => `Člen od ${year}`,
    },
    similarTitle: "Podobné vozidlá",
    notFound: {
      title: "Inzerát nenájdený",
      description: "Požadovaný inzerát už nie je dostupný.",
      back: "Späť na autá",
    },
    adminPreview: {
      title: "Administrátorský náhľad",
      description:
        "Tento inzerát zatiaľ nie je zverejnený. Kontaktné akcie sú v náhľade vypnuté.",
    },
    views: (count) => `${count} zobrazení`,
  },
  RO: {
    loadError: "Anunțul nu a putut fi încărcat",
    share: {
      copySuccess: "Link copiat în clipboard",
      copyError: "Linkul nu a putut fi copiat",
      listingText: (brand, model) =>
        `Vezi anunțul ${brand} ${model} pe AutoNinja.`,
      fallbackText: "Vezi acest anunț pe AutoNinja.",
    },
    saved: {
      loginRequired: "Trebuie să te autentifici pentru a salva anunțul.",
      removed: "Anunț eliminat din favorite",
      added: "Anunț salvat",
      updateFailed: "Favoritele nu au putut fi actualizate",
    },
    message: {
      loginRequired: "Trebuie să te autentifici pentru a trimite mesajul.",
      captchaRequired: "Confirmă captcha înainte de trimiterea mesajului.",
      sendFailed: "Cererea nu a putut fi trimisă.",
      sent: "Mesaj trimis",
      defaultMessage: (brand, model) =>
        `Bună ziua, sunt interesat de ${brand} ${model}. Mai este disponibilă mașina?`,
    },
    report: {
      captchaRequired: "Confirmă captcha înainte de trimiterea raportării.",
      failed: "Raportarea nu a putut fi trimisă.",
      duplicate: "Există deja o raportare deschisă pentru acest anunț.",
      sent: "Raportarea a fost trimisă pentru verificare.",
      modalTitle: "Raportează anunțul",
      modalDescription: "Trimitem raportarea la moderare.",
      reasonLabel: "Motiv",
      categoryLabels: {
        fraud: "Fraudă / scam",
        duplicate: "Anunț duplicat",
        incorrect_info: "Date incorecte",
        prohibited: "Conținut interzis",
        abuse: "Abuz",
        other: "Alt motiv",
      },
      detailsLabel: "Descrierea problemei",
      detailsPlaceholder: "Scrie ce pare suspect sau incorect în anunț.",
      cancel: "Anulează",
      submit: "Trimite raportarea",
      submitting: "Se trimite...",
    },
    specs: {
      power: "Putere",
      engine: "Capacitate",
      body: "Caroserie",
      color: "Culoare",
      description: "Descrierea mașinii",
      equipment: "Dotări",
      location: "Locație",
    },
    gallery: {
      previous: "Fotografia anterioară",
      next: "Fotografia următoare",
      showPhoto: (index) => `Afișează fotografia ${index}`,
      photoAlt: (brand, model, index) => `${brand} ${model} - fotografia ${index}`,
    },
    heading: {
      saveAria: "Salvează la favorite",
      removeAria: "Elimină din favorite",
      saveTooltip: "Salvează anunțul",
      removeTooltip: "Elimină din salvate",
      shareLabel: "Distribuie anunțul",
      copyLabel: "Copiază linkul anunțului",
      copyTooltip: "Copiază linkul",
    },
    contact: {
      price: "Prețul mașinii",
      vatDeductible: "TVA deductibil",
      note:
        "Cel mai rapid este să trimiți un mesaj. Vânzătorul îl vede imediat, iar răspunsul ajunge direct în contul tău.",
      hideForm: "Ascunde formularul",
      writeMessage: "Scrie vânzătorului",
      phoneNotProvided: "Număr de contact nespecificat",
      showPhone: "Afișează telefonul",
      report: "Raportează anunțul",
      tip: "Sfat: un mesaj scurt și concret crește șansa unui răspuns rapid.",
      inbox: "Răspunsul îl găsești în Contul meu - Mesaje.",
      antiSpam:
        "Protecție anti-spam: maximum 3 mesaje pentru această mașină în 10 minute.",
      sentTitle: "Mesaj trimis",
      sentDescription: "Vânzătorul îți va răspunde în curând.",
      openMessages: "Deschide mesajele",
      placeholder: "Sunt interesat de această mașină...",
      enterHint: "Enter trimite mesajul, Shift+Enter adaugă un rând nou.",
      sendInquiry: "Trimite cererea",
      sending: "Se trimite...",
    },
    seller: {
      title: "Vânzător",
      verifiedTitle: "Vânzător verificat",
      memberSince: (year) => `Membru din ${year}`,
    },
    similarTitle: "Mașini similare",
    notFound: {
      title: "Anunț negăsit",
      description: "Anunțul solicitat nu mai este disponibil.",
      back: "Înapoi la mașini",
    },
    adminPreview: {
      title: "Previzualizare admin",
      description:
        "Acest anunț nu este încă public. Acțiunile de contact sunt dezactivate în previzualizare.",
    },
    views: (count) => `${count} vizualizări`,
  },
};

function resolveCarDetailCopy(locale: string): ResolvedCarDetailCopy {
  const marketCode = resolveMarketCodeFromLocale(locale);

  return {
    marketCode,
    market: PUBLIC_MARKET_COPY[marketCode],
    text: CAR_DETAIL_TEXT[marketCode],
  };
}

function formatDetailDate(value: string, market: PublicMarketCopy): string {
  return new Date(value).toLocaleDateString(market.languageTag, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDetailYear(value: string | number | Date): string {
  return String(new Date(value).getFullYear());
}

function formatDetailCarValue(
  value: string | null | undefined,
  copy: ResolvedCarDetailCopy,
  category: PublicCarValueCategory,
) {
  return formatPublicCarValue(value, copy.marketCode, category) || copy.market.notProvided;
}

function createInitialState(
  initialCar: CarData | null,
  initialSimilarCars: SimilarCar[],
  loadError: string,
): CarDetailState {
  return {
    car: initialCar,
    similarCars: initialSimilarCars,
    isLoading: false,
    error: initialCar ? "" : loadError,
    selectedImageIndex: 0,
    isSaved: false,
    showPhone: false,
    showContactForm: false,
    contactMessage: "",
    isSendingMessage: false,
    messageSent: false,
  };
}

const LOADING_SKELETON_KEYS = [
  "loading-spec-1",
  "loading-spec-2",
  "loading-spec-3",
  "loading-spec-4",
];

function carDetailReducer(
  state: CarDetailState,
  action: CarDetailAction,
): CarDetailState {
  switch (action.type) {
    case "set_selected_image":
      return {
        ...state,
        selectedImageIndex: action.index,
      };
    case "set_saved":
      return {
        ...state,
        isSaved: action.isSaved,
      };
    case "toggle_phone":
      return {
        ...state,
        showPhone: !state.showPhone,
      };
    case "toggle_contact_form": {
      const willOpen = !state.showContactForm;
      return {
        ...state,
        showContactForm: willOpen,
        contactMessage:
          willOpen && !state.contactMessage.trim()
            ? action.defaultMessage
            : state.contactMessage,
      };
    }
    case "set_contact_message":
      return {
        ...state,
        contactMessage: action.contactMessage,
      };
    case "send_message_start":
      return {
        ...state,
        isSendingMessage: true,
      };
    case "send_message_finished":
      return {
        ...state,
        isSendingMessage: false,
        messageSent: action.messageSent,
      };
    default:
      return state;
  }
}

function useIncrementAdViews(
  carId: string,
  initialCar: CarData | null,
  isAdminPreview: boolean,
) {
  useEffect(() => {
    if (isAdminPreview || !carId || !initialCar) {
      return;
    }

    const supabase = createClient();

    void (async () => {
      try {
        await supabase.rpc("increment_ad_views", { ad_id: carId });
      } catch (error) {
        console.error("Error incrementing car views:", error);
      }
    })();
  }, [carId, initialCar, isAdminPreview]);
}

function useSavedAdState(
  carId: string,
  userId: string | undefined,
  dispatch: Dispatch<CarDetailAction>,
  isAdminPreview: boolean,
) {
  useEffect(() => {
    let isActive = true;

    if (isAdminPreview || !userId) {
      dispatch({ type: "set_saved", isSaved: false });
      return () => {
        isActive = false;
      };
    }

    const supabase = createClient();

    const syncSavedState = async () => {
      try {
        const { data, error } = await supabase
          .from("saved_ads")
          .select("id")
          .eq("user_id", userId)
          .eq("ad_id", carId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (isActive) {
          dispatch({ type: "set_saved", isSaved: Boolean(data) });
        }
      } catch (error) {
        console.error("Error loading saved state:", error);
      }
    };

    void syncSavedState();

    return () => {
      isActive = false;
    };
  }, [carId, userId, dispatch, isAdminPreview]);
}

function useListingViewTracking(car: CarData | null, isAdminPreview: boolean) {
  const hasTrackedViewRef = useRef(false);

  useEffect(() => {
    if (isAdminPreview || !car?.id || hasTrackedViewRef.current) {
      return;
    }

    trackAnalyticsEvent("listing_viewed", {
      adId: car.id,
      source: "direct",
    });
    hasTrackedViewRef.current = true;
  }, [car, isAdminPreview]);
}

function useCarDetailShareActions(
  car: CarData | null,
  copy: ResolvedCarDetailCopy,
) {
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(copy.text.share.copySuccess);
    } catch {
      toast.error(copy.text.share.copyError);
    }
  };

  const handleShareLink = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: car
            ? `${car.brand} ${car.model}`
            : "AutoNinja",
          text: car
            ? copy.text.share.listingText(car.brand, car.model)
            : copy.text.share.fallbackText,
          url: window.location.href,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    await handleCopyLink();
  };

  return { handleCopyLink, handleShareLink };
}

export default function CarDetailClient({
  carId,
  initialCar,
  initialSimilarCars,
  enableViewTransitions,
  breadcrumbItems,
  isAdminPreview,
}: CarDetailClientProps) {
  const locale = useLocale();
  const copy = resolveCarDetailCopy(locale);
  const { user } = useAuthOptional();
  const [state, dispatch] = useReducer(
    carDetailReducer,
    createInitialState(initialCar, initialSimilarCars, copy.text.loadError),
  );
  const [interactionState, setInteractionState] = useState<CarDetailInteractionState>({
    contactCaptchaKey: 0,
    contactCaptchaToken: null,
    isReportModalOpen: false,
    isReporting: false,
    reportCaptchaKey: 0,
    reportCaptchaToken: null,
    reportCategory: "fraud",
    reportDetails: "",
  });
  const {
    contactCaptchaKey,
    contactCaptchaToken,
    isReportModalOpen,
    isReporting,
    reportCaptchaKey,
    reportCaptchaToken,
    reportCategory,
    reportDetails,
  } = interactionState;
  const setContactCaptchaToken = useCallback((contactCaptchaToken: string | null) => {
    setInteractionState((current) =>
      current.contactCaptchaToken === contactCaptchaToken
        ? current
        : { ...current, contactCaptchaToken },
    );
  }, []);
  const setReportCaptchaToken = useCallback((reportCaptchaToken: string | null) => {
    setInteractionState((current) =>
      current.reportCaptchaToken === reportCaptchaToken
        ? current
        : { ...current, reportCaptchaToken },
    );
  }, []);
  const userId = user?.id;
  useIncrementAdViews(carId, initialCar, isAdminPreview);
  useSavedAdState(carId, userId, dispatch, isAdminPreview);
  useListingViewTracking(state.car, isAdminPreview);

  const car = state.car;

  const handleSaveToggle = async () => {
    if (isAdminPreview || !user) {
      toast.info(copy.text.saved.loginRequired);
      return;
    }

    try {
      const supabase = createClient();
      if (state.isSaved) {
        await supabase
          .from("saved_ads")
          .delete()
          .eq("user_id", user.id)
          .eq("ad_id", carId);
        dispatch({ type: "set_saved", isSaved: false });
        toast.success(copy.text.saved.removed);
        return;
      }

      await supabase.from("saved_ads").insert({ user_id: user.id, ad_id: carId });
      dispatch({ type: "set_saved", isSaved: true });
      toast.success(copy.text.saved.added);
    } catch {
      toast.error(copy.text.saved.updateFailed);
    }
  };
  const { handleCopyLink, handleShareLink } = useCarDetailShareActions(car, copy);

  const submitMessage = async () => {
    if (isAdminPreview || !user) {
      toast.info(copy.text.message.loginRequired);
      return;
    }

    if (!car?.id || !state.contactMessage.trim()) {
      return;
    }

    if (!contactCaptchaToken) {
      toast.error(copy.text.message.captchaRequired);
      return;
    }

    dispatch({ type: "send_message_start" });

    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: car.id,
          recipientId: car.seller.id,
          message: state.contactMessage,
          captchaToken: contactCaptchaToken,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; inquiryId?: string }
        | null;

      if (!response.ok) {
        toast.error(
          copy.marketCode === "SK" && payload?.error
            ? payload.error
            : copy.text.message.sendFailed,
        );
        dispatch({ type: "send_message_finished", messageSent: false });
        return;
      }

      if (payload?.inquiryId) {
        trackAnalyticsEvent("lead_submitted", {
          leadId: payload.inquiryId,
          adId: car.id,
          channel: "message",
        });
      }

      toast.success(copy.text.message.sent);
      dispatch({ type: "send_message_finished", messageSent: true });
    } catch {
      toast.error(copy.text.message.sendFailed);
      dispatch({ type: "send_message_finished", messageSent: false });
    } finally {
      setInteractionState((current) => ({
        ...current,
        contactCaptchaKey: current.contactCaptchaKey + 1,
        contactCaptchaToken: null,
      }));
    }
  };

  const submitReport = async () => {
    if (isAdminPreview || !car?.id) {
      return;
    }

    if (!reportCaptchaToken) {
      toast.error(copy.text.report.captchaRequired);
      return;
    }

    setInteractionState((current) => ({ ...current, isReporting: true }));

    try {
      const response = await fetch("/api/listing-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: car.id,
          category: reportCategory,
          details: reportDetails,
          captchaToken: reportCaptchaToken,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; duplicate?: boolean }
        | null;

      if (!response.ok) {
        toast.error(
          copy.marketCode === "SK" && payload?.error
            ? payload.error
            : copy.text.report.failed,
        );
        return;
      }

      toast.success(
        payload?.duplicate
          ? copy.text.report.duplicate
          : copy.text.report.sent,
      );
      setInteractionState((current) => ({
        ...current,
        isReportModalOpen: false,
        reportCategory: "fraud",
        reportDetails: "",
      }));
    } catch {
      toast.error(copy.text.report.failed);
    } finally {
      setInteractionState((current) => ({
        ...current,
        isReporting: false,
        reportCaptchaKey: current.reportCaptchaKey + 1,
        reportCaptchaToken: null,
      }));
    }
  };

  const handleSendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage();
  };

  const handleTogglePhone = () => {
    if (isAdminPreview || !state.car) {
      return;
    }

    if (!state.showPhone) {
      trackAnalyticsEvent("seller_contact_started", {
        adId: state.car.id,
        channel: "phone",
      });
    }

    dispatch({ type: "toggle_phone" });
  };

  const handleToggleContactForm = () => {
    if (isAdminPreview || !state.car) {
      return;
    }

    if (!state.showContactForm) {
      trackAnalyticsEvent("seller_contact_started", {
        adId: state.car.id,
        channel: "message",
      });
    }

    dispatch({
      type: "toggle_contact_form",
      defaultMessage: defaultContactMessage,
    });
  };

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!state.isSendingMessage && state.contactMessage.trim()) {
        void submitMessage();
      }
    }
  };

  const handleMessagePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData("text");
    if (!pastedText) {
      return;
    }

    event.preventDefault();
    dispatch({
      type: "set_contact_message",
      contactMessage: pastedText.replace(/\r\n/g, "\n").replace(/\u3000/g, " ").trim(),
    });
  };

  if (state.isLoading) {
    return <CarLoadingSkeleton />;
  }

  if (state.error || !car) {
    return <CarNotFoundState copy={copy} />;
  }

  const cityCoords = car.location_city ? getCityCoordinates(car.location_city) : null;
  const defaultContactMessage = copy.text.message.defaultMessage(
    car.brand,
    car.model,
  );

  return (
    <CarDetailView
      car={car}
      copy={copy}
      state={state}
      dispatch={dispatch}
      userId={user?.id}
      isAdminPreview={isAdminPreview}
      enableViewTransitions={enableViewTransitions}
      breadcrumbItems={breadcrumbItems}
      cityCoords={cityCoords}
      contactCaptchaKey={contactCaptchaKey}
      contactCaptchaToken={contactCaptchaToken}
      setContactCaptchaToken={setContactCaptchaToken}
      isReportModalOpen={isReportModalOpen}
      isReporting={isReporting}
      reportCaptchaKey={reportCaptchaKey}
      reportCaptchaToken={reportCaptchaToken}
      reportCategory={reportCategory}
      reportDetails={reportDetails}
      setInteractionState={setInteractionState}
      handleSaveToggle={handleSaveToggle}
      handleShareLink={handleShareLink}
      handleCopyLink={handleCopyLink}
      handleTogglePhone={handleTogglePhone}
      handleToggleContactForm={handleToggleContactForm}
      handleSendMessage={handleSendMessage}
      handleMessageKeyDown={handleMessageKeyDown}
      handleMessagePaste={handleMessagePaste}
      submitReport={submitReport}
      setReportCaptchaToken={setReportCaptchaToken}
    />
  );
}

function CarDetailView({
  car,
  copy,
  state,
  dispatch,
  userId,
  isAdminPreview,
  enableViewTransitions,
  breadcrumbItems,
  cityCoords,
  contactCaptchaKey,
  contactCaptchaToken,
  setContactCaptchaToken,
  isReportModalOpen,
  isReporting,
  reportCaptchaKey,
  reportCaptchaToken,
  reportCategory,
  reportDetails,
  setInteractionState,
  handleSaveToggle,
  handleShareLink,
  handleCopyLink,
  handleTogglePhone,
  handleToggleContactForm,
  handleSendMessage,
  handleMessageKeyDown,
  handleMessagePaste,
  submitReport,
  setReportCaptchaToken,
}: {
  car: CarData;
  copy: ResolvedCarDetailCopy;
  state: CarDetailState;
  dispatch: Dispatch<CarDetailAction>;
  userId?: string;
  isAdminPreview: boolean;
  enableViewTransitions: boolean;
  breadcrumbItems: BreadcrumbTrailItem[];
  cityCoords: { lat: number; lng: number } | null;
  contactCaptchaKey: number;
  contactCaptchaToken: string | null;
  setContactCaptchaToken: (token: string | null) => void;
  isReportModalOpen: boolean;
  isReporting: boolean;
  reportCaptchaKey: number;
  reportCaptchaToken: string | null;
  reportCategory: ReportCategory;
  reportDetails: string;
  setInteractionState: Dispatch<SetStateAction<CarDetailInteractionState>>;
  handleSaveToggle: () => Promise<void>;
  handleShareLink: () => Promise<void>;
  handleCopyLink: () => Promise<void>;
  handleTogglePhone: () => void;
  handleToggleContactForm: () => void;
  handleSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  handleMessageKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleMessagePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  submitReport: () => Promise<void>;
  setReportCaptchaToken: (token: string | null) => void;
}) {
  return (
    <main className="pt-4 pb-16 sm:pt-6 sm:pb-18">
      <div className="container-main">
        {isAdminPreview ? (
          <div
            role="status"
            className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-text-secondary"
          >
            <p className="font-semibold text-text-primary">
              {copy.text.adminPreview.title}
            </p>
            <p className="mt-1">{copy.text.adminPreview.description}</p>
          </div>
        ) : null}
        <BreadcrumbTrail items={breadcrumbItems} className="mb-3" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="space-y-7 lg:col-span-2 sm:space-y-8">
            <CarGallery
              car={car}
              copy={copy}
              selectedImageIndex={state.selectedImageIndex}
              enableViewTransitions={enableViewTransitions}
              onSelectImage={(index) =>
                dispatch({ type: "set_selected_image", index })
              }
            />

            <CarHeading
              car={car}
              copy={copy}
              isAdminPreview={isAdminPreview}
              isSaved={state.isSaved}
              onToggleSaved={handleSaveToggle}
              onShare={handleShareLink}
              onCopyLink={handleCopyLink}
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SpecItem label={copy.text.specs.power} value={`${car.power_kw} kW`} />
              <SpecItem label={copy.text.specs.engine} value={`${car.engine_volume_cm3} cm3`} />
              <SpecItem
                label={copy.text.specs.body}
                value={formatDetailCarValue(car.body_style, copy, "bodyStyle")}
              />
              <SpecItem label={copy.text.specs.color} value={car.color || "-"} />
            </div>

            <section>
              <h2 className="mb-2 text-lg font-semibold text-text-primary">
                {copy.text.specs.description}
              </h2>
              <p className="text-text-secondary leading-relaxed whitespace-pre-wrap">
                {car.description}
              </p>
            </section>

            {car.equipment_json?.length > 0 && (
              <section>
                <h2 className="mb-2 text-lg font-semibold text-text-primary">
                  {copy.text.specs.equipment}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {toUniqueKeyedStrings(car.equipment_json, "equipment").map((entry) => (
                    <span
                      key={entry.key}
                      className="px-3 py-1.5 bg-surface rounded-full text-xs text-text-secondary border border-border-subtle"
                    >
                      {entry.value}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {cityCoords && (
              <section>
                <h2 className="mb-2 text-lg font-semibold text-text-primary">
                  {copy.text.specs.location}
                </h2>
                <SimpleMap
                  lat={cityCoords.lat}
                  lng={cityCoords.lng}
                  radiusKm={0}
                  cityName={car.location_city}
                />
              </section>
            )}
          </div>

          <aside className="space-y-3 lg:sticky lg:top-24">
            <ContactSellerCard
              car={car}
              copy={copy}
              isAdminPreview={isAdminPreview}
              status={{
                canReport: userId !== car.seller.id,
                isSendingMessage: state.isSendingMessage,
                messageSent: state.messageSent,
                showContactForm: state.showContactForm,
                showPhone: state.showPhone,
              }}
              contactMessage={state.contactMessage}
              onTogglePhone={handleTogglePhone}
              onToggleContactForm={handleToggleContactForm}
              onSubmit={handleSendMessage}
              onMessageChange={(value) =>
                dispatch({ type: "set_contact_message", contactMessage: value })
              }
              onMessageKeyDown={handleMessageKeyDown}
              onMessagePaste={handleMessagePaste}
              contactCaptchaToken={contactCaptchaToken}
              captchaInstanceKey={contactCaptchaKey}
              onContactCaptchaTokenChange={setContactCaptchaToken}
              onOpenReport={() =>
                setInteractionState((current) => ({
                  ...current,
                  isReportModalOpen: true,
                }))
              }
            />

            <SellerInfoCard car={car} copy={copy} />

            <div className="flex items-center justify-between text-xs text-text-muted px-2">
              <span>
                {copy.text.views(formatMarketNumber(car.views_count, copy.market))}
              </span>
              <span>{formatDetailDate(car.created_at, copy.market)}</span>
            </div>
          </aside>
        </div>

        <SimilarCarsSection similarCars={state.similarCars} copy={copy} />
        <ReportListingModal
          copy={copy}
          open={isReportModalOpen}
          category={reportCategory}
          details={reportDetails}
          isPending={isReporting}
          captchaInstanceKey={reportCaptchaKey}
          captchaToken={reportCaptchaToken}
          onCategoryChange={(reportCategory) =>
            setInteractionState((current) => ({ ...current, reportCategory }))
          }
          onDetailsChange={(reportDetails) =>
            setInteractionState((current) => ({ ...current, reportDetails }))
          }
          onClose={() =>
            setInteractionState((current) => ({
              ...current,
              isReportModalOpen: false,
            }))
          }
          onSubmit={() => {
            void submitReport();
          }}
          onCaptchaTokenChange={setReportCaptchaToken}
        />
      </div>
    </main>
  );
}

function CarGallery({
  car,
  copy,
  selectedImageIndex,
  enableViewTransitions,
  onSelectImage,
}: {
  car: CarData;
  copy: ResolvedCarDetailCopy;
  selectedImageIndex: number;
  enableViewTransitions: boolean;
  onSelectImage: (index: number) => void;
}) {
  const photos = car.photos_json?.length
    ? car.photos_json
    : getListingFallbackGallery(car.id);
  const safeImageIndex = Math.min(selectedImageIndex, photos.length - 1);
  const selectedPhoto = optimizeCloudflareImage(photos[safeImageIndex], {
    width: 1600,
    height: 900,
    fit: "cover",
    quality: 85,
    format: "auto",
  });
  const selectImage = (index: number) => {
    if (index === safeImageIndex) {
      return;
    }

    startViewTransition(
      () => {
        onSelectImage(index);
      },
      { enabled: enableViewTransitions },
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px]">
      <div className="view-transition-gallery-image relative aspect-video rounded-2xl outer-radius overflow-hidden bg-background-secondary border border-border-subtle shadow-sm">
        <Image
          src={selectedPhoto}
          alt={`${car.brand} ${car.model}`}
          fill
          sizes="(max-width: 1024px) 100vw, 66vw"
          priority
          loading="eager"
          fetchPriority="high"
          className="object-cover"
        />

        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label={copy.text.gallery.previous}
              onClick={() =>
                selectImage(
                  safeImageIndex > 0 ? safeImageIndex - 1 : photos.length - 1,
                )
              }
              className="absolute left-4 top-1/2 -translate-y-1/2 size-10 hit-target rounded-full bg-background-secondary/90 border border-border-subtle flex items-center justify-center hover:bg-background-secondary transition-colors motion-interruptible"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              aria-label={copy.text.gallery.next}
              onClick={() =>
                selectImage(
                  safeImageIndex < photos.length - 1 ? safeImageIndex + 1 : 0,
                )
              }
              className="absolute right-4 top-1/2 -translate-y-1/2 size-10 hit-target rounded-full bg-background-secondary/90 border border-border-subtle flex items-center justify-center hover:bg-background-secondary transition-colors motion-interruptible"
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </>
        )}

        <div className="absolute bottom-4 right-4 px-3 py-1 bg-background-dark/70 rounded-full border border-white/10 text-white text-xs font-medium">
          {safeImageIndex + 1} / {photos.length}
        </div>
      </div>

      {photos.length > 1 && (
        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto no-scrollbar pb-1 lg:pb-0 min-h-0">
          {toUniqueKeyedStrings(photos, "thumb").map((entry, index) => (
            <button
              key={entry.key}
              type="button"
              aria-label={copy.text.gallery.showPhoto(index + 1)}
              onClick={() => selectImage(index)}
              className={cn(
                "relative w-20 h-14 lg:w-full lg:h-20 rounded-lg inner-radius overflow-hidden flex-shrink-0 border-2 transition-colors",
                safeImageIndex === index
                  ? "border-text-primary"
                  : "border-transparent hover:border-border",
              )}
            >
              <Image
                src={optimizeCloudflareImage(entry.value, {
                  width: 320,
                  height: 180,
                  fit: "cover",
                  quality: 80,
                  format: "auto",
                })}
                alt={copy.text.gallery.photoAlt(car.brand, car.model, index + 1)}
                fill
                sizes="(max-width: 1024px) 80px, 140px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CarHeading({
  car,
  copy,
  isAdminPreview,
  isSaved,
  onToggleSaved,
  onShare,
  onCopyLink,
}: {
  car: CarData;
  copy: ResolvedCarDetailCopy;
  isAdminPreview: boolean;
  isSaved: boolean;
  onToggleSaved: () => void;
  onShare: () => void;
  onCopyLink: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-border">
      <div>
        <h1 className="text-3xl sm:text-4xl font-display font-semibold text-text-primary">
          {car.brand} {car.model}
        </h1>
        <p className="text-text-secondary mt-1">
          {car.year} • {formatMarketNumber(car.mileage_km, copy.market)} km •{" "}
          {formatDetailCarValue(car.fuel, copy, "fuel")} •{" "}
          {formatDetailCarValue(car.transmission, copy, "transmission")}
        </p>
      </div>

      <TooltipProvider delayDuration={120}>
        <div className="flex gap-2">
          {!isAdminPreview ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={
                    isSaved ? copy.text.heading.removeAria : copy.text.heading.saveAria
                  }
                  onClick={onToggleSaved}
                  className={cn(
                    "size-10 hit-target rounded-full border border-border-subtle bg-background-secondary/90 flex items-center justify-center transition-colors motion-interruptible",
                    isSaved
                      ? "border-error/20 bg-error/10 text-error"
                      : "hover:border-border-strong",
                  )}
                >
                  <HeartIcon className={cn("size-5", isSaved && "fill-current text-error")} />
                </button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>
                {isSaved ? copy.text.heading.removeTooltip : copy.text.heading.saveTooltip}
              </TooltipContent>
            </Tooltip>
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={copy.text.heading.shareLabel}
                onClick={onShare}
                className="size-10 hit-target rounded-full border border-border-subtle bg-background-secondary/90 flex items-center justify-center hover:border-border-strong transition-colors motion-interruptible"
              >
                <ShareIcon className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>{copy.text.heading.shareLabel}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={copy.text.heading.copyLabel}
                onClick={onCopyLink}
                className="size-10 hit-target rounded-full border border-border-subtle bg-background-secondary/90 flex items-center justify-center hover:border-border-strong transition-colors motion-interruptible"
              >
                <ExternalLinkIcon className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>{copy.text.heading.copyTooltip}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

function ContactSellerCard({
  car,
  copy,
  isAdminPreview,
  status,
  contactMessage,
  onTogglePhone,
  onToggleContactForm,
  onSubmit,
  onMessageChange,
  onMessageKeyDown,
  onMessagePaste,
  contactCaptchaToken,
  captchaInstanceKey,
  onContactCaptchaTokenChange,
  onOpenReport,
}: {
  car: CarData;
  copy: ResolvedCarDetailCopy;
  isAdminPreview: boolean;
  status: {
    canReport: boolean;
    isSendingMessage: boolean;
    messageSent: boolean;
    showContactForm: boolean;
    showPhone: boolean;
  };
  contactMessage: string;
  contactCaptchaToken: string | null;
  captchaInstanceKey: number;
  onTogglePhone: () => void;
  onToggleContactForm: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onMessageChange: (value: string) => void;
  onMessageKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMessagePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onContactCaptchaTokenChange: (token: string | null) => void;
  onOpenReport: () => void;
}) {
  const {
    canReport,
    isSendingMessage,
    messageSent,
    showContactForm,
    showPhone,
  } = status;
  return (
    <div className="card p-5">
      <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">
        {copy.text.contact.price}
      </p>
      <p className="text-3xl font-display font-semibold text-text-primary tabular-nums">
        {formatMarketCurrency(car.price_eur, copy.market)}
      </p>
      {car.is_vat_deductible && (
        <p className="mt-2 text-xs text-text-tertiary">
          {copy.text.contact.vatDeductible}
        </p>
      )}

      {isAdminPreview ? (
        <div className="mt-5 rounded-xl border border-accent/20 bg-accent/5 p-3">
          <p className="text-xs leading-relaxed text-text-secondary">
            {copy.text.adminPreview.description}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
            <p className="text-xs leading-relaxed text-text-secondary">
              {copy.text.contact.note}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={onToggleContactForm}
              className="btn-primary w-full py-3.5 text-sm font-semibold"
            >
              {showContactForm
                ? copy.text.contact.hideForm
                : copy.text.contact.writeMessage}
            </button>
            <button
              type="button"
              onClick={onTogglePhone}
              className="btn-secondary w-full py-3"
            >
              {showPhone
                ? car.seller.phone || copy.text.contact.phoneNotProvided
                : copy.text.contact.showPhone}
            </button>
            {canReport ? (
              <button
                type="button"
                onClick={onOpenReport}
                className="btn-secondary w-full py-3"
              >
                {copy.text.contact.report}
              </button>
            ) : null}
          </div>

          {!showContactForm ? (
            <p className="mt-3 text-xs leading-relaxed text-text-secondary">
              {copy.text.contact.tip}
            </p>
          ) : null}

          <ul className="mt-3 space-y-1 text-xs font-medium text-text-tertiary">
            <li>{copy.text.contact.inbox}</li>
            <li>{copy.text.contact.antiSpam}</li>
          </ul>

          {showContactForm && (
            <div className="mt-6 border-t border-border pt-6">
              {messageSent ? (
                <div className="py-4 text-center">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-success-subtle">
                    <CheckIcon className="size-6 text-success" />
                  </div>
                  <p className="mb-1 font-medium text-text-primary">
                    {copy.text.contact.sentTitle}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {copy.text.contact.sentDescription}
                  </p>
                  <Link
                    href="/moj-ucet?tab=messages"
                    className="btn-secondary mt-3 inline-flex items-center justify-center px-4 py-2 text-sm"
                  >
                    {copy.text.contact.openMessages}
                  </Link>
                </div>
              ) : (
                <form onSubmit={onSubmit}>
                  <textarea
                    rows={5}
                    value={contactMessage}
                    onChange={(event) => onMessageChange(event.target.value)}
                    onKeyDown={onMessageKeyDown}
                    onPaste={onMessagePaste}
                    placeholder={copy.text.contact.placeholder}
                    className="input mb-3 resize-none"
                  />
                  <TurnstileCaptcha
                    key={`car-contact-${captchaInstanceKey}`}
                    onTokenChange={onContactCaptchaTokenChange}
                    action="inquiry_submit"
                    className="mb-3"
                  />
                  <p className="mb-3 text-xs text-text-tertiary">
                    {copy.text.contact.enterHint}
                  </p>
                  <button
                    type="submit"
                    disabled={isSendingMessage || !contactMessage.trim() || !contactCaptchaToken}
                    className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
                  >
                    {isSendingMessage && <SpinnerIcon className="size-4 animate-spin" />}
                    {isSendingMessage
                      ? copy.text.contact.sending
                      : copy.text.contact.sendInquiry}
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReportListingModal({
  copy,
  open,
  category,
  details,
  isPending,
  captchaInstanceKey,
  captchaToken,
  onCategoryChange,
  onDetailsChange,
  onClose,
  onSubmit,
  onCaptchaTokenChange,
}: {
  copy: ResolvedCarDetailCopy;
  open: boolean;
  category: "fraud" | "duplicate" | "incorrect_info" | "prohibited" | "abuse" | "other";
  details: string;
  isPending: boolean;
  captchaInstanceKey: number;
  captchaToken: string | null;
  onCategoryChange: (
    value: "fraud" | "duplicate" | "incorrect_info" | "prohibited" | "abuse" | "other",
  ) => void;
  onDetailsChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onCaptchaTokenChange: (token: string | null) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.text.report.modalTitle}
      description={copy.text.report.modalDescription}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="report-category" className="mb-1 block text-sm font-medium text-primary">
            {copy.text.report.reasonLabel}
          </label>
          <select
            id="report-category"
            value={category}
            onChange={(event) =>
              onCategoryChange(
                event.target.value as
                  | "fraud"
                  | "duplicate"
                  | "incorrect_info"
                  | "prohibited"
                  | "abuse"
                  | "other",
              )
            }
            className="input"
          >
            <option value="fraud">{copy.text.report.categoryLabels.fraud}</option>
            <option value="duplicate">
              {copy.text.report.categoryLabels.duplicate}
            </option>
            <option value="incorrect_info">
              {copy.text.report.categoryLabels.incorrect_info}
            </option>
            <option value="prohibited">
              {copy.text.report.categoryLabels.prohibited}
            </option>
            <option value="abuse">{copy.text.report.categoryLabels.abuse}</option>
            <option value="other">{copy.text.report.categoryLabels.other}</option>
          </select>
        </div>

        <div>
          <label htmlFor="report-details" className="mb-1 block text-sm font-medium text-primary">
            {copy.text.report.detailsLabel}
          </label>
          <textarea
            id="report-details"
            rows={5}
            value={details}
            onChange={(event) => onDetailsChange(event.target.value)}
            placeholder={copy.text.report.detailsPlaceholder}
            className="input resize-none"
          />
        </div>

        <TurnstileCaptcha
          key={`report-listing-${captchaInstanceKey}`}
          onTokenChange={onCaptchaTokenChange}
          action="listing_report_submit"
        />

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-2">
            {copy.text.report.cancel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending || details.trim().length < 10 || !captchaToken}
            className="btn-primary px-4 py-2 disabled:opacity-50"
          >
            {isPending ? copy.text.report.submitting : copy.text.report.submit}
          </button>
        </div>
      </div>
    </Modal>
  );
}
function SellerInfoCard({
  car,
  copy,
}: {
  car: CarData;
  copy: ResolvedCarDetailCopy;
}) {
  return (
    <div className="card p-6">
      <p className="text-xs text-text-tertiary uppercase tracking-wider mb-4">
        {copy.text.seller.title}
      </p>
      <div className="flex items-center gap-3 mb-4">
        <div className="size-12 rounded-full bg-surface flex items-center justify-center text-xl border border-border-subtle">
          👤
        </div>
        <div>
          <p className="font-medium text-text-primary flex items-center gap-1.5 min-w-0">
            <span className="text-cutoff">{car.seller.name}</span>
            {car.seller.is_verified && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-success bg-success-subtle px-2 py-0.5 rounded-full"
                title={copy.text.seller.verifiedTitle}
              >
                ✓
              </span>
            )}
          </p>
          <p className="text-xs text-text-tertiary">
            {copy.text.seller.memberSince(formatDetailYear(car.seller.member_since))}
          </p>
        </div>
      </div>
    </div>
  );
}

function SimilarCarsSection({
  similarCars,
  copy,
}: {
  similarCars: SimilarCar[];
  copy: ResolvedCarDetailCopy;
}) {
  if (similarCars.length === 0) {
    return null;
  }

  return (
    <section className="mt-16 pt-10 border-t border-border">
      <h2 className="text-2xl font-display font-semibold text-text-primary mb-6">
        {copy.text.similarTitle}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {similarCars.map((similar) => (
          <Link
            key={similar.id}
            href={buildAdPath({
              id: similar.id,
              brand: similar.brand,
              model: similar.model,
              year: similar.year,
            })}
            className="group card card-hover overflow-hidden"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-background-tertiary">
              <Image
                src={optimizeCloudflareImage(
                  similar.photos_json?.[0] || "/placeholder-car.jpg",
                  {
                    width: 720,
                    height: 540,
                    fit: "cover",
                    quality: 82,
                    format: "auto",
                  },
                )}
                alt={`${similar.brand} ${similar.model}`}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="p-5 space-y-3">
              <div>
                <h3 className="text-lg font-display font-semibold text-text-primary leading-tight">
                  {similar.brand}{" "}
                  <span className="font-normal text-text-secondary">
                    {similar.model}
                  </span>
                </h3>
                <p className="text-sm text-text-tertiary mt-1">
                  {similar.year} • {formatDetailCarValue(similar.fuel, copy, "fuel")} •{" "}
                  {formatMarketNumber(similar.mileage_km, copy.market)} km
                </p>
              </div>
              <p className="text-xl font-display font-semibold text-text-primary tabular-nums">
                {formatMarketCurrency(similar.price_eur, copy.market)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CarLoadingSkeleton() {
  return (
    <main className="pt-16 sm:pt-20 pb-20 animate-pulse">
      <div className="container-main">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-4 w-12 bg-background-secondary rounded" />
          <div className="h-4 w-2 bg-background-secondary rounded" />
          <div className="h-4 w-10 bg-background-secondary rounded" />
          <div className="h-4 w-2 bg-background-secondary rounded" />
          <div className="h-4 w-28 bg-background-secondary rounded" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
          <div className="lg:col-span-2 space-y-10">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px]">
              <div className="aspect-video bg-background-secondary rounded-2xl" />
              <div className="hidden lg:flex flex-col gap-2">
                <div className="h-20 bg-background-secondary rounded-lg" />
                <div className="h-20 bg-background-secondary rounded-lg" />
                <div className="h-20 bg-background-secondary rounded-lg" />
              </div>
            </div>

            <div className="pb-6 border-b border-border">
              <div className="h-9 w-3/4 bg-background-secondary rounded mb-2" />
              <div className="h-5 w-1/2 bg-background-secondary rounded" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {LOADING_SKELETON_KEYS.map((skeletonKey) => (
                <div
                  key={skeletonKey}
                  className="bg-background-secondary rounded-lg p-3 h-16"
                />
              ))}
            </div>

            <div>
              <div className="h-6 w-36 bg-background-secondary rounded mb-3" />
              <div className="space-y-2">
                <div className="h-4 bg-background-secondary rounded w-full" />
                <div className="h-4 bg-background-secondary rounded w-5/6" />
                <div className="h-4 bg-background-secondary rounded w-4/6" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-background-secondary rounded-lg p-6 space-y-4">
              <div className="h-4 w-20 bg-background-tertiary rounded" />
              <div className="h-9 w-2/3 bg-background-tertiary rounded" />
              <div className="h-12 bg-background-tertiary rounded" />
              <div className="h-12 bg-background-tertiary rounded" />
            </div>
            <div className="bg-background-secondary rounded-lg p-6 h-28" />
          </div>
        </div>
      </div>
    </main>
  );
}

function CarNotFoundState({ copy }: { copy: ResolvedCarDetailCopy }) {
  return (
    <main className="pt-24 pb-16">
      <div className="container-main text-center">
        <h1 className="text-3xl font-display font-semibold text-text-primary">
          {copy.text.notFound.title}
        </h1>
        <p className="mt-2 text-text-secondary">
          {copy.text.notFound.description}
        </p>
        <Link href="/vysledky" className="text-accent hover:underline mt-4 inline-block">
          {copy.text.notFound.back}
        </Link>
      </div>
    </main>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-lg p-3">
      <p className="text-[11px] text-text-tertiary uppercase tracking-[0.2em] mb-1">
        {label}
      </p>
      <p className="text-base font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function toUniqueKeyedStrings(values: string[], prefix: string) {
  const counts = new Map<string, number>();
  return values.map((value) => {
    const nextCount = (counts.get(value) || 0) + 1;
    counts.set(value, nextCount);
    return {
      value,
      key: `${prefix}-${value}-${nextCount}`,
    };
  });
}
