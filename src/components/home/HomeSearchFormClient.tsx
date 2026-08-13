"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMarketCode } from "@/context/MarketContext";
import {
  ArrowRight as ArrowRightIcon,
  CalendarDays as CalendarIcon,
  CarFront as CarIcon,
  ChevronDown,
  Gauge as SpeedometerIcon,
  LoaderCircle as SpinnerIcon,
  RotateCcw,
  Search as SearchIcon,
  SlidersHorizontal,
  Tag as TagIcon,
  Zap as ZapIcon,
} from "lucide-react";
import {
  TooltipProvider,
} from "@/components/ui/shadcn/tooltip";
import type { AlgoliaCarRecord } from "@/lib/algolia";
import { getCarsIndexName } from "@/lib/algolia/public-env";
import { getAlgoliaMarketFilter, type MarketCode } from "@/config/markets";
import { usePublicVehicleTaxonomy } from "@/lib/vehicle-taxonomy/client";
import { cn } from "@/utils/cn";
import { getMarketPath } from "@/lib/routes";
import { HOME_LOCATIONS } from "@/components/home/theme";
import { trackAnalyticsEvent } from "@/lib/analytics/client";

const HOME_MIN_SUGGESTION_LENGTH = 2;
const HOME_REMOTE_SUGGESTION_LIMIT = 8;
const HOME_REMOTE_SUGGESTION_DEBOUNCE_MS = 120;
const HOME_PREVIEW_COUNT_DEBOUNCE_MS = 420;

const HOME_YEAR_PRESETS = [
  2026,
  2025,
  2024,
  2023,
  2022,
  2021,
  2020,
  2019,
  2018,
  2017,
  2016,
  2015,
  2014,
  2013,
  2012,
  2011,
  2010,
  2009,
  2008,
  2007,
  2006,
  2005,
  2004,
  2003,
  2002,
  2001,
  2000,
  1999,
  1998,
  1997,
  1996,
  1995,
  1994,
  1993,
  1992,
  1991,
  1990,
] as const;

const HOME_PRICE_TO_PRESETS = [
  1000,
  2000,
  3000,
  4000,
  5000,
  7500,
  10000,
  12500,
  15000,
  17500,
  20000,
  25000,
  30000,
  35000,
  40000,
  50000,
  60000,
  75000,
  100000,
  150000,
  200000,
] as const;

const HOME_PRICE_FROM_PRESETS = [
  1000,
  2000,
  3000,
  4000,
  5000,
  7500,
  10000,
  12500,
  15000,
  17500,
  20000,
  25000,
  30000,
  35000,
  40000,
  50000,
  60000,
  75000,
  100000,
] as const;

const HOME_MILEAGE_TO_PRESETS = [
  10000,
  20000,
  25000,
  30000,
  40000,
  50000,
  75000,
  100000,
  125000,
  150000,
  175000,
  200000,
  250000,
  300000,
  400000,
  500000,
] as const;

const HOME_MILEAGE_FROM_PRESETS = [
  10000,
  20000,
  25000,
  30000,
  40000,
  50000,
  75000,
  100000,
  125000,
  150000,
  175000,
  200000,
  250000,
  300000,
  400000,
] as const;

const homeSearchNavigationListeners = new Set<() => void>();
let homeSearchNavigationPending = false;

function setHomeSearchNavigationPending(nextValue: boolean) {
  homeSearchNavigationPending = nextValue;
  for (const listener of homeSearchNavigationListeners) {
    listener();
  }
}

function subscribeToHomeSearchNavigation(listener: () => void) {
  homeSearchNavigationListeners.add(listener);
  return () => homeSearchNavigationListeners.delete(listener);
}

function getHomeSearchNavigationSnapshot() {
  return homeSearchNavigationPending;
}

function getHomeSearchNavigationServerSnapshot() {
  return false;
}

let homeAlgoliaModulePromise: Promise<typeof import("@/lib/algolia")> | null = null;

function loadHomeAlgoliaModule() {
  if (!homeAlgoliaModulePromise) {
    homeAlgoliaModulePromise = import("@/lib/algolia");
  }

  return homeAlgoliaModulePromise;
}

async function loadHomeSearchPreviewCount(
  homeSearchQuery: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    homeSearchQuery ? `/api/search/count?${homeSearchQuery}` : "/api/search/count",
    {
      method: "GET",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error("preview-failed");
  }

  return (await response.json()) as {
    count?: number;
    degraded?: boolean;
  };
}

const HOME_CATEGORY_TABS = [
  {
    key: "all",
    bodyStyle: "",
  },
  {
    key: "suv",
    bodyStyle: "suv",
  },
  {
    key: "combi",
    bodyStyle: "combi",
  },
  {
    key: "hatchback",
    bodyStyle: "hatchback",
  },
  {
    key: "sedan",
    bodyStyle: "sedan",
  },
  {
    key: "coupe",
    bodyStyle: "coupe",
  },
  {
    key: "mpv",
    bodyStyle: "mpv",
  },
  {
    key: "pickup",
    bodyStyle: "pickup",
  },
  {
    key: "commercial",
    bodyStyle: "commercial",
  },
] as const;

type HomeVehicleCategoryKey = (typeof HOME_CATEGORY_TABS)[number]["key"] | "";

function getHomeCategoryKeyForBodyStyle(bodyStyle: string): HomeVehicleCategoryKey {
  return HOME_CATEGORY_TABS.find((tab) => tab.bodyStyle === bodyStyle)?.key ?? "";
}

type HomeSearchFormFieldsState = {
  q: string;
  brand: string;
  selectedBrands: string[];
  model: string;
  fuel: string;
  bodyStyle: string;
  priceFrom: string;
  priceTo: string;
  mileageFrom: string;
  mileageTo: string;
  yearFrom: string;
  yearTo: string;
};

type HomeSearchUiState = {
  isSearchFocused: boolean;
  showSuggestions: boolean;
  showAdvancedFilters: boolean;
  activeVehicleCategory: HomeVehicleCategoryKey;
};

type HomeSearchSuggestionState = {
  highlightedSuggestionIndex: number;
  suggestions: SuggestionItem[];
};

type HomeSearchCategoryScrollState = {
  showLeft: boolean;
  showRight: boolean;
};

const initialHomeSearchFieldsState: HomeSearchFormFieldsState = {
  q: "",
  brand: "",
  selectedBrands: [],
  model: "",
  fuel: "",
  bodyStyle: "",
  priceFrom: "",
  priceTo: "",
  mileageFrom: "",
  mileageTo: "",
  yearFrom: "",
  yearTo: "",
};

function homeSearchFieldsReducer(
  state: HomeSearchFormFieldsState,
  patch:
    | Partial<HomeSearchFormFieldsState>
    | ((current: HomeSearchFormFieldsState) => HomeSearchFormFieldsState),
): HomeSearchFormFieldsState {
  return typeof patch === "function" ? patch(state) : { ...state, ...patch };
}

function homeSearchUiReducer(
  state: HomeSearchUiState,
  patch: Partial<HomeSearchUiState>,
): HomeSearchUiState {
  return { ...state, ...patch };
}

function homeSearchSuggestionReducer(
  state: HomeSearchSuggestionState,
  patch:
    | HomeSearchSuggestionState
    | ((current: HomeSearchSuggestionState) => HomeSearchSuggestionState),
): HomeSearchSuggestionState {
  return typeof patch === "function" ? patch(state) : patch;
}

function homeSearchCategoryScrollReducer(
  state: HomeSearchCategoryScrollState,
  nextState: HomeSearchCategoryScrollState,
): HomeSearchCategoryScrollState {
  return nextState;
}

function HomeSelect({
  label,
  value,
  onChange,
  options,
  icon,
  className,
  disabled = false,
  renderOption,
  popularOptionCount = 0,
  popoverClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  renderOption?: (option: { label: string; value: string }) => ReactNode;
  popularOptionCount?: number;
  popoverClassName?: string;
}) {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );

  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  }, []);

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) {
      return;
    }

    optionRefs.current[highlightedIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [highlightedIndex, isOpen]);

  const openMenu = (preferredIndex?: number) => {
    if (disabled || options.length === 0) {
      return;
    }

    const nextIndex =
      typeof preferredIndex === "number" && preferredIndex >= 0
        ? preferredIndex
        : selectedIndex >= 0
          ? selectedIndex
          : 0;
    setIsOpen(true);
    setHighlightedIndex(nextIndex);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const selectOption = (option: { label: string; value: string }) => {
    onChange(option.value);
    closeMenu();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }

      setHighlightedIndex((currentValue) =>
        currentValue < options.length - 1 ? currentValue + 1 : currentValue,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openMenu(selectedIndex >= 0 ? selectedIndex : options.length - 1);
        return;
      }

      setHighlightedIndex((currentValue) =>
        currentValue > 0 ? currentValue - 1 : currentValue,
      );
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }

      if (highlightedIndex >= 0) {
        selectOption(options[highlightedIndex]);
      }
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu();
    }
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          if (disabled) {
            return;
          }
          if (isOpen) {
            closeMenu();
            return;
          }
          openMenu();
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          window.setTimeout(() => {
            if (!containerRef.current?.contains(document.activeElement)) {
              closeMenu();
            }
          }, 120);
        }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        disabled={disabled}
        className={cn(
          "home-filter-control market-field relative flex h-11 w-full items-center justify-between bg-white px-3.5 pr-10 text-base font-semibold text-text-primary outline-none transition-all focus:border-[var(--home-brand)] focus:ring-0 focus-visible:border-[var(--home-brand)] focus-visible:outline-none focus-visible:ring-0 sm:h-12 sm:px-4 sm:pr-11 sm:text-sm",
          disabled && "cursor-not-allowed opacity-60",
        )}
        style={
          isFocused || isOpen
            ? {
                borderColor: "var(--home-brand)",
                boxShadow: "none",
                outline: "none",
              }
            : undefined
        }
      >
        <span className="flex min-w-0 items-center gap-2.5 pr-3">
          {icon ? (
            <span className="flex size-[18px] shrink-0 items-center justify-center text-[var(--home-mint-ink)]">
              {icon}
            </span>
          ) : null}
          <span className="truncate">
            {value ? options.find((option) => option.value === value)?.label || value : label}
          </span>
        </span>
        <span className="pointer-events-none absolute right-3 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center sm:right-4">
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 transition-transform duration-200", isOpen && "rotate-180")}
          />
        </span>
      </button>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className={cn(
            "home-popover-surface absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border-subtle bg-white py-2 shadow-lg shadow-[var(--home-brand)]/10 animate-modal-in",
            popoverClassName,
          )}
        >
          {options.map((opt, index) => (
            <button
              key={opt.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(opt)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-background-muted",
                index === popularOptionCount && popularOptionCount > 0
                  ? "border-t border-border-subtle"
                  : "",
                highlightedIndex === index && "bg-background-muted",
                value === opt.value ? "text-text-primary" : "text-text-primary",
              )}
            >
              {renderOption ? renderOption(opt) : opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HomeEditableNumberField({
  label,
  value,
  onChange,
  options,
  icon,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  icon?: ReactNode;
  className?: string;
}) {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  }, []);

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) {
      return;
    }

    optionRefs.current[highlightedIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [highlightedIndex, isOpen]);

  const openMenu = (preferredIndex?: number) => {
    if (options.length === 0) {
      return;
    }

    const selectedIndex = options.findIndex((option) => option.value === value);
    const nextIndex =
      typeof preferredIndex === "number" && preferredIndex >= 0
        ? preferredIndex
        : selectedIndex >= 0
          ? selectedIndex
          : 0;
    setIsOpen(true);
    setHighlightedIndex(nextIndex);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    closeMenu();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }

      setHighlightedIndex((currentValue) =>
        currentValue < options.length - 1 ? currentValue + 1 : currentValue,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openMenu(options.length - 1);
        return;
      }

      setHighlightedIndex((currentValue) =>
        currentValue > 0 ? currentValue - 1 : currentValue,
      );
      return;
    }

    if (event.key === "Enter" && isOpen && highlightedIndex >= 0) {
      event.preventDefault();
      selectOption(options[highlightedIndex].value);
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu();
    }
  };

  return (
    <div className={cn("relative h-11 w-full self-start sm:h-12", className)} ref={containerRef}>
      <input
        id={`${listboxId}-input`}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        inputMode="numeric"
        pattern="[0-9 ]*"
        value={value}
        onChange={(event) => {
          onChange(normalizeIntegerInput(event.target.value));
          if (!isOpen) {
            openMenu();
          }
        }}
        onFocus={() => {
          setIsFocused(true);
          openMenu();
        }}
        onBlur={() => {
          setIsFocused(false);
          window.setTimeout(() => {
            if (!containerRef.current?.contains(document.activeElement)) {
              closeMenu();
            }
          }, 120);
        }}
        onKeyDown={handleKeyDown}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        placeholder={label}
        className={cn(
          "home-filter-input market-field block h-11 w-full bg-white pr-12 text-base font-semibold text-text-primary outline-none transition-all placeholder:text-text-secondary focus:border-[var(--home-brand)] focus:ring-0 focus-visible:border-[var(--home-brand)] focus-visible:outline-none focus-visible:ring-0 sm:h-12 sm:pr-12 sm:text-sm",
          icon ? "pl-10 sm:pl-11" : "px-3.5 sm:px-4",
        )}
        style={
          isFocused || isOpen
            ? {
                borderColor: "var(--home-brand)",
                boxShadow: "none",
                outline: "none",
              }
            : undefined
        }
      />
      {icon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 flex size-[18px] -translate-y-1/2 items-center justify-center text-[var(--home-mint-ink)] sm:left-4">
          {icon}
        </span>
      ) : null}
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (isOpen) {
            closeMenu();
            return;
          }

          openMenu();
        }}
        aria-label={isOpen ? `${label} close` : `${label} open`}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        className="!absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-text-primary transition-colors hover:bg-[var(--home-mint)]/10 sm:right-3"
        style={{ position: "absolute" }}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform duration-200", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="home-popover-surface absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border-subtle bg-white py-2 shadow-lg shadow-[var(--home-brand)]/10 animate-modal-in"
        >
          {options.map((option, index) => (
            <button
              key={`${label}-${option.value}`}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option.value)}
              className={cn(
                "flex w-full items-center px-4 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-background-muted",
                highlightedIndex === index && "bg-background-muted",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const HOME_BRAND_LOGOS: Record<string, string> = {
  audi: "/brand-logos/audi.png",
  bmw: "/brand-logos/bmw.png",
  dacia: "/brand-logos/dacia.svg",
  ford: "/brand-logos/ford.png",
  hyundai: "/brand-logos/hyundai.svg",
  kia: "/brand-logos/kia.png",
  "mercedes-benz": "/brand-logos/mercedes-benz.png",
  nissan: "/brand-logos/nissan.png",
  opel: "/brand-logos/opel.svg",
  peugeot: "/brand-logos/peugeot.svg",
  renault: "/brand-logos/renault.svg",
  skoda: "/brand-logos/skoda.png",
  toyota: "/brand-logos/toyota.png",
  volvo: "/brand-logos/volvo.png",
  volkswagen: "/brand-logos/volkswagen.png",
};

const HOME_BRAND_LOGO_CLASSNAMES: Record<string, string> = {
  audi: "h-[21px] sm:h-7",
  bmw: "h-[25px] sm:h-8",
  dacia: "h-[20px] sm:h-6",
  ford: "h-[24px] sm:h-7",
  hyundai: "h-[17px] sm:h-5",
  kia: "h-[22px] sm:h-7",
  "mercedes-benz": "h-[22px] sm:h-7",
  nissan: "h-[22px] sm:h-7",
  opel: "h-[21px] sm:h-6",
  peugeot: "h-[20px] sm:h-6",
  renault: "h-[21px] sm:h-6",
  skoda: "h-[22px] sm:h-7",
  toyota: "h-[22px] sm:h-7",
  volvo: "h-[23px] sm:h-[30px]",
  volkswagen: "h-[25px] sm:h-8",
};

const HOME_BRAND_POPOVER_CLASS_NAME =
  "max-w-[calc(100vw-2rem)] max-h-96 sm:min-w-[22rem] sm:max-h-[28rem] lg:min-w-[28rem]";

const HOME_FEATURED_BRAND_SLUGS = [
  "volkswagen",
  "toyota",
  "skoda",
  "bmw",
  "mercedes-benz",
  "audi",
  "renault",
  "dacia",
] as const;

type SuggestionType = "brand" | "model" | "location";

type SuggestionItem = {
  type: SuggestionType;
  value: string;
  count?: number;
  brand?: string;
};

type HomeSearchFilters = {
  q: string;
  brands: string[];
  model: string;
  fuel: string;
  bodyStyle: string;
  priceFrom: string;
  priceTo: string;
  mileageFrom: string;
  mileageTo: string;
  yearFrom: string;
  yearTo: string;
};

function HomeBrandLogo({ brand, slug }: { brand: string; slug: string }) {
  const src = HOME_BRAND_LOGOS[slug];
  if (!src) {
    return <CarIcon className="size-3.5 sm:size-5" />;
  }

  return (
    <span
      className={cn(
        "relative flex w-full items-center justify-center",
        HOME_BRAND_LOGO_CLASSNAMES[slug] ?? "h-[22px] sm:h-7",
      )}
    >
      <Image
        src={src}
        alt={`${brand} logo`}
        fill
        sizes="64px"
        className="object-contain object-center"
      />
    </span>
  );
}

function normalizeLooseText(value: string): string {
  return value
    .replace(/\u3000/g, " ")
    .replace(/[;,|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsLowercaseMatch(value: string, normalizedNeedle: string): boolean {
  return value.toLowerCase().includes(normalizedNeedle);
}

function normalizeIntegerInput(value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  return String(Number.parseInt(digits, 10));
}

function createHomeNumberOptions(
  values: readonly number[],
  unit: string,
  locale: string,
): { label: string; value: string }[] {
  return values.map((value) => ({
    label: `${value.toLocaleString(locale)} ${unit}`,
    value: String(value),
  }));
}

function normalizeRangePair(from: string, to: string): [string, string] {
  if (!from || !to) {
    return [from, to];
  }

  const fromNumber = Number.parseInt(from, 10);
  const toNumber = Number.parseInt(to, 10);

  if (Number.isNaN(fromNumber) || Number.isNaN(toNumber)) {
    return [from, to];
  }

  return fromNumber <= toNumber ? [from, to] : [to, from];
}

function buildHomeSearchParams(filters: HomeSearchFilters): URLSearchParams {
  const normalizedQuery = normalizeLooseText(filters.q);
  const normalizedBrandSet = new Set<string>();
  for (const brand of filters.brands) {
    const normalizedBrand = normalizeLooseText(brand);
    if (normalizedBrand.length > 0) {
      normalizedBrandSet.add(normalizedBrand);
    }
  }
  const normalizedBrands = Array.from(normalizedBrandSet);
  const normalizedModel = normalizeLooseText(filters.model);
  const [safePriceFrom, safePriceTo] = normalizeRangePair(
    normalizeIntegerInput(filters.priceFrom),
    normalizeIntegerInput(filters.priceTo),
  );
  const [safeMileageFrom, safeMileageTo] = normalizeRangePair(
    normalizeIntegerInput(filters.mileageFrom),
    normalizeIntegerInput(filters.mileageTo),
  );
  const [safeYearFrom, safeYearTo] = normalizeRangePair(
    normalizeIntegerInput(filters.yearFrom),
    normalizeIntegerInput(filters.yearTo),
  );
  const params = new URLSearchParams();

  if (normalizedQuery) params.set("q", normalizedQuery);
  for (const normalizedBrand of normalizedBrands) {
    params.append("brand", normalizedBrand);
  }
  if (normalizedModel) params.set("model", normalizedModel);
  if (filters.fuel) params.set("fuel", filters.fuel);
  if (filters.bodyStyle) params.set("bodyStyle", filters.bodyStyle);
  if (safePriceFrom) params.set("priceFrom", safePriceFrom);
  if (safePriceTo) params.set("priceTo", safePriceTo);
  if (safeMileageFrom) params.set("mileageFrom", safeMileageFrom);
  if (safeMileageTo) params.set("mileageTo", safeMileageTo);
  if (safeYearFrom) params.set("yearFrom", safeYearFrom);
  if (safeYearTo) params.set("yearTo", safeYearTo);

  return params;
}

function getFallbackSuggestions(
  inputValue: string,
  brandNames: string[],
  modelsByBrandName: Record<string, string[]>,
): SuggestionItem[] {
  const needle = inputValue.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const modelEntries = Object.entries(modelsByBrandName).flatMap(([brand, models]) =>
    models.map((model) => ({ brand, model })),
  );

  const suggestions: SuggestionItem[] = [
    ...brandNames.filter((brand) => brand.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((brand) => ({ type: "brand" as const, value: brand })),
    ...modelEntries
      .filter((entry) => entry.model.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((entry) => ({
        type: "model" as const,
        value: entry.model,
        brand: entry.brand,
      })),
    ...HOME_LOCATIONS.filter((location) => location.toLowerCase().includes(needle))
      .slice(0, 2)
      .map((location) => ({ type: "location" as const, value: location })),
  ];

  const seen = new Set<string>();
  return suggestions.filter((item) => {
    const key = `${item.type}:${item.value.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeSuggestions(suggestions: SuggestionItem[]): SuggestionItem[] {
  const seen = new Set<string>();
  return suggestions.filter((item) => {
    const key = `${item.type}:${item.value.toLowerCase()}:${(item.brand ?? "").toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function findBrandForModel(
  modelValue: string,
  modelsByBrandName: Record<string, string[]>,
): string | null {
  const normalizedModel = modelValue.trim().toLowerCase();

  for (const [brand, models] of Object.entries(modelsByBrandName)) {
    if (models.some((model) => model.toLowerCase() === normalizedModel)) {
      return brand;
    }
  }

  return null;
}

function findEffectiveHomeBrand(
  inputValue: string,
  selectedBrand: string,
  brandNames: string[],
): string | null {
  const normalizedInput = inputValue.trim().toLowerCase();

  if (
    selectedBrand &&
    (!normalizedInput ||
      normalizedInput === selectedBrand.toLowerCase() ||
      normalizedInput.startsWith(`${selectedBrand.toLowerCase()} `))
  ) {
    return selectedBrand;
  }

  return (
    brandNames.find((candidate) => {
      const normalizedCandidate = candidate.toLowerCase();
      return (
        normalizedInput === normalizedCandidate ||
        normalizedInput.startsWith(`${normalizedCandidate} `)
      );
    }) ?? null
  );
}

function getHomeSuggestions(
  inputValue: string,
  selectedBrand: string,
  brandNames: string[],
  modelsByBrandName: Record<string, string[]>,
): SuggestionItem[] {
  const trimmedValue = inputValue.trim();
  const effectiveBrand = findEffectiveHomeBrand(trimmedValue, selectedBrand, brandNames);

  if (!effectiveBrand) {
    return getFallbackSuggestions(trimmedValue, brandNames, modelsByBrandName);
  }

  const normalizedBrand = effectiveBrand.toLowerCase();
  const normalizedInput = trimmedValue.toLowerCase();
  const modelNeedle = normalizedInput.startsWith(normalizedBrand)
    ? trimmedValue.slice(effectiveBrand.length).trim().toLowerCase()
    : normalizedInput;
  const modelSuggestions = (modelsByBrandName[effectiveBrand] ?? [])
    .filter((candidate) =>
      modelNeedle ? candidate.toLowerCase().includes(modelNeedle) : true,
    )
    .slice(0, 5)
    .map((value) => ({
      type: "model" as const,
      value,
      brand: effectiveBrand,
    }));
  const locationSuggestions = HOME_LOCATIONS.filter((location) =>
    location.toLowerCase().includes(normalizedInput),
  )
    .slice(0, 2)
    .map((value) => ({
      type: "location" as const,
      value,
    }));

  return dedupeSuggestions([...modelSuggestions, ...locationSuggestions]);
}

async function getAlgoliaHomeSuggestions(
  inputValue: string,
  selectedBrand: string,
  brandNames: string[],
  marketCode: MarketCode,
): Promise<SuggestionItem[]> {
  const trimmedValue = inputValue.trim();
  if (trimmedValue.length < HOME_MIN_SUGGESTION_LENGTH) {
    return [];
  }

  const effectiveBrand = findEffectiveHomeBrand(trimmedValue, selectedBrand, brandNames);
  const normalizedInput = trimmedValue.toLowerCase();
  const modelNeedle = effectiveBrand
    && normalizedInput.startsWith(`${effectiveBrand.toLowerCase()} `)
    ? trimmedValue.slice(effectiveBrand.length).trim().toLowerCase()
    : normalizedInput;

  try {
    const { searchSingleIndex } = await loadHomeAlgoliaModule();
    const searchResult = await searchSingleIndex<AlgoliaCarRecord>({
      indexName: getCarsIndexName(),
      searchParams: {
        query: trimmedValue,
        filters: getAlgoliaMarketFilter(marketCode),
        hitsPerPage: HOME_REMOTE_SUGGESTION_LIMIT * 2,
        facets: ["brand", "model", "location_city"],
        maxValuesPerFacet: HOME_REMOTE_SUGGESTION_LIMIT,
        ...(effectiveBrand
          ? {
              facetFilters: [`brand:${effectiveBrand}`],
            }
          : {}),
      },
    });

    const brandFacet = searchResult.facets?.brand ?? {};
    const modelFacet = searchResult.facets?.model ?? {};
    const locationFacet = searchResult.facets?.location_city ?? {};
    const hits = (searchResult.hits ?? []) as AlgoliaCarRecord[];

    const matchingBrandFacets: Array<[string, number]> = [];
    if (!effectiveBrand) {
      for (const entry of Object.entries(brandFacet)) {
        if (containsLowercaseMatch(entry[0], normalizedInput)) {
          matchingBrandFacets.push(entry);
        }
      }
    }
    matchingBrandFacets.sort((left, right) => right[1] - left[1]);
    const brandSuggestions: SuggestionItem[] = matchingBrandFacets
      .slice(0, 3)
      .map(([value, count]) => ({
        type: "brand" as const,
        value,
        count,
      }));

    const hitModels: Array<{ brand: string; model: string }> = [];
    const normalizedEffectiveBrand = effectiveBrand ? effectiveBrand.toLowerCase() : "";
    for (const hit of hits) {
      const hitBrand = typeof hit.brand === "string" ? hit.brand : "";
      const hitModel = typeof hit.model === "string" ? hit.model : "";
      if (hitBrand.length === 0 || hitModel.length === 0) {
        continue;
      }
      if (effectiveBrand && hitBrand.toLowerCase() !== normalizedEffectiveBrand) {
        continue;
      }
      if (modelNeedle && !containsLowercaseMatch(hitModel, modelNeedle)) {
        continue;
      }
      hitModels.push({ brand: hitBrand, model: hitModel });
    }

    const modelSuggestions: SuggestionItem[] = hitModels
      .slice(0, 5)
      .map((entry) => ({
        type: "model" as const,
        value: entry.model,
        brand: entry.brand,
        count: modelFacet[entry.model],
      }));

    const matchingLocationFacets: Array<[string, number]> = [];
    for (const entry of Object.entries(locationFacet)) {
      if (containsLowercaseMatch(entry[0], normalizedInput)) {
        matchingLocationFacets.push(entry);
      }
    }
    matchingLocationFacets.sort((left, right) => right[1] - left[1]);
    const locationSuggestions: SuggestionItem[] = matchingLocationFacets
      .slice(0, 2)
      .map(([value, count]) => ({
        type: "location" as const,
        value,
        count,
      }));

    return dedupeSuggestions([
      ...brandSuggestions,
      ...modelSuggestions,
      ...locationSuggestions,
    ]).slice(0, HOME_REMOTE_SUGGESTION_LIMIT);
  } catch {
    return [];
  }
}

type HomeSearchFormClientProps = {
  className?: string;
};

export default function HomeSearchFormClient(props: HomeSearchFormClientProps) {
  return useHomeSearchFormClientView(props);
}

function useHomeSearchFormClientView({ className }: HomeSearchFormClientProps) {
  const { push } = useRouter();
  const locale = useLocale();
  const marketCode = useMarketCode();
  const t = useTranslations("homeSearch");
  const tFilters = useTranslations("filters");
  const tFuel = useTranslations("fuel");
  const tBodyType = useTranslations("bodyType");
  const {
    taxonomy,
    brandNames,
    modelsByBrandName,
  } = usePublicVehicleTaxonomy();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryScrollerRef = useRef<HTMLDivElement>(null);
  const categoryDragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    dragged: boolean;
  } | null>(null);
  const categoryPreventClickRef = useRef(false);
  const [searchFields, updateSearchFields] = useReducer(
    homeSearchFieldsReducer,
    initialHomeSearchFieldsState,
  );
  const {
    q,
    brand,
    selectedBrands,
    model,
    fuel,
    bodyStyle,
    priceFrom,
    priceTo,
    mileageFrom,
    mileageTo,
    yearFrom,
    yearTo,
  } = searchFields;
  const setQ = useCallback((q: string) => updateSearchFields({ q }), []);
  const setBrand = useCallback((brand: string) => updateSearchFields({ brand }), []);
  const setSelectedBrands = useCallback(
    (selectedBrands: string[]) => updateSearchFields({ selectedBrands }),
    [],
  );
  const setModel = useCallback((nextModel: string | ((currentValue: string) => string)) => {
    updateSearchFields((current) => ({
      ...current,
      model:
        typeof nextModel === "function" ? nextModel(current.model) : nextModel,
    }));
  }, []);
  const setFuel = useCallback((fuel: string) => updateSearchFields({ fuel }), []);
  const setPriceFrom = useCallback(
    (priceFrom: string) => updateSearchFields({ priceFrom }),
    [],
  );
  const setPriceTo = useCallback((priceTo: string) => updateSearchFields({ priceTo }), []);
  const setMileageFrom = useCallback(
    (mileageFrom: string) => updateSearchFields({ mileageFrom }),
    [],
  );
  const setMileageTo = useCallback(
    (mileageTo: string) => updateSearchFields({ mileageTo }),
    [],
  );
  const setYearFrom = useCallback((yearFrom: string) => updateSearchFields({ yearFrom }), []);
  const setYearTo = useCallback((yearTo: string) => updateSearchFields({ yearTo }), []);
  const isSearching = useSyncExternalStore(
    subscribeToHomeSearchNavigation,
    getHomeSearchNavigationSnapshot,
    getHomeSearchNavigationServerSnapshot,
  );
  const [searchUiState, updateSearchUiState] = useReducer(homeSearchUiReducer, {
    isSearchFocused: false,
    showSuggestions: false,
    showAdvancedFilters: false,
    activeVehicleCategory: "",
  });
  const {
    isSearchFocused,
    showSuggestions,
    showAdvancedFilters,
    activeVehicleCategory,
  } = searchUiState;
  const setIsSearchFocused = useCallback(
    (isSearchFocused: boolean) => updateSearchUiState({ isSearchFocused }),
    [updateSearchUiState],
  );
  const setShowSuggestions = useCallback(
    (showSuggestions: boolean) => updateSearchUiState({ showSuggestions }),
    [updateSearchUiState],
  );
  const setActiveVehicleCategory = useCallback(
    (activeVehicleCategory: HomeSearchUiState["activeVehicleCategory"]) =>
      updateSearchUiState({ activeVehicleCategory }),
    [updateSearchUiState],
  );
  const setBodyStyle = useCallback((bodyStyle: string) => {
    updateSearchFields({ bodyStyle });
    updateSearchUiState({
      activeVehicleCategory: getHomeCategoryKeyForBodyStyle(bodyStyle),
    });
  }, [updateSearchFields, updateSearchUiState]);
  const [suggestionState, setSuggestionState] = useReducer(homeSearchSuggestionReducer, {
    highlightedSuggestionIndex: -1,
    suggestions: [],
  });
  const [previewState, updatePreviewState] = useReducer(
    (
      current: { count: number | null; isLoading: boolean },
      next: Partial<{ count: number | null; isLoading: boolean }>,
    ) => ({ ...current, ...next }),
    {
      count: null,
      isLoading: false,
    },
  );
  const [categoryScrollControls, setCategoryScrollControls] = useReducer(
    homeSearchCategoryScrollReducer,
    {
      showLeft: false,
      showRight: false,
    },
  );
  const suggestionRequestCounterRef = useRef(0);
  const { highlightedSuggestionIndex, suggestions } = suggestionState;
  const previewCount = previewState.count;
  const isPreviewLoading = previewState.isLoading;
  const yearOptions = useMemo(
    () => HOME_YEAR_PRESETS.map((year) => ({ label: String(year), value: String(year) })),
    [],
  );
  const featuredBrands = useMemo(() => {
    const brandsBySlug = new Map(taxonomy.brands.map((option) => [option.slug, option]));
    return HOME_FEATURED_BRAND_SLUGS.flatMap((slug) => {
      const option = brandsBySlug.get(slug);
      return option ? [option] : [];
    });
  }, [taxonomy]);

  const activeBrand = brand || selectedBrands[0] || "";
  const brandSlugByName = useMemo(
    () => new Map(taxonomy.brands.map((option) => [option.name, option.slug])),
    [taxonomy.brands],
  );
  const brandOptions = useMemo(() => {
    const featuredSlugs = new Set(HOME_FEATURED_BRAND_SLUGS);
    const featured = HOME_FEATURED_BRAND_SLUGS.flatMap((slug) => {
      const option = taxonomy.brands.find((brandOption) => brandOption.slug === slug);
      return option ? [{ label: option.name, value: option.name }] : [];
    });
    const remaining = taxonomy.brands
      .filter((option) => !featuredSlugs.has(option.slug as (typeof HOME_FEATURED_BRAND_SLUGS)[number]))
      .map((option) => ({ label: option.name, value: option.name }))
      .sort((left, right) => left.label.localeCompare(right.label, locale));

    return [...featured, ...remaining];
  }, [locale, taxonomy.brands]);
  const modelOptions = useMemo(() => {
    if (!activeBrand) {
      return [];
    }

    return (modelsByBrandName[activeBrand] ?? []).map((option) => ({
      label: option,
      value: option,
    }));
  }, [activeBrand, modelsByBrandName]);

  const applyPrimaryBrand = (nextBrand: string) => {
    setBrand(nextBrand);
    setSelectedBrands(nextBrand ? [nextBrand] : []);
    setModel((currentValue) => {
      if (!nextBrand) {
        return "";
      }

      return (modelsByBrandName[nextBrand] ?? []).includes(currentValue)
        ? currentValue
        : "";
    });
  };


  const activeFilters = useMemo(() => {
    const list: { key: string; label: string; onRemove: () => void }[] = [];
    
    // Query filter
    if (q.trim()) {
      list.push({ key: "q", label: q.trim(), onRemove: () => setQ("") });
    }
    
    // Brands filters
    selectedBrands.forEach((b) => {
      list.push({
        key: `brand-${b}`,
        label: b,
        onRemove: () => {
          setBrand("");
          setSelectedBrands([]);
          setModel("");
        },
      });
    });
    
    // Other filters
    if (model) {
      list.push({ key: "model", label: model, onRemove: () => setModel("") });
    }
    if (fuel) {
      list.push({ key: "fuel", label: tFuel(fuel), onRemove: () => setFuel("") });
    }
    if (bodyStyle) {
      list.push({
        key: "body",
        label: tBodyType(bodyStyle),
        onRemove: () => setBodyStyle(""),
      });
    }
    if (priceFrom) {
      list.push({
        key: "pf",
        label: `${t("priceFromPlaceholder")}: ${priceFrom} €`,
        onRemove: () => setPriceFrom(""),
      });
    }
    if (priceTo) {
      list.push({
        key: "pt",
        label: `${t("priceToOption")}: ${priceTo} €`,
        onRemove: () => setPriceTo(""),
      });
    }
    if (mileageFrom) {
      list.push({
        key: "mf",
        label: `${t("mileageFromPlaceholder")}: ${mileageFrom} km`,
        onRemove: () => setMileageFrom(""),
      });
    }
    if (mileageTo) {
      list.push({
        key: "mt",
        label: `${t("mileageToPlaceholder")}: ${mileageTo} km`,
        onRemove: () => setMileageTo(""),
      });
    }
    if (yearFrom) {
      list.push({
        key: "yf",
        label: `${t("yearFromPlaceholder")}: ${yearFrom}`,
        onRemove: () => setYearFrom(""),
      });
    }
    if (yearTo) {
      list.push({
        key: "yt",
        label: `${t("yearToPlaceholder")}: ${yearTo}`,
        onRemove: () => setYearTo(""),
      });
    }
    
    return list;
  }, [
    q,
    selectedBrands,
    model,
    fuel,
    bodyStyle,
    priceFrom,
    priceTo,
    mileageFrom,
    mileageTo,
    yearFrom,
    yearTo,
    setBodyStyle,
    setBrand,
    setFuel,
    setMileageFrom,
    setMileageTo,
    setModel,
    setPriceFrom,
    setPriceTo,
    setQ,
    setSelectedBrands,
    setYearFrom,
    setYearTo,
    tFuel,
    tBodyType,
    t,
  ]);

  const hasAnyFilters = activeFilters.length > 0;
  const submitButtonLabel = t("search");
  const homeSearchQuery = useMemo(
    () =>
      buildHomeSearchParams({
        q,
        brands: activeBrand ? [activeBrand] : [],
        model,
        fuel,
        bodyStyle,
        priceFrom,
        priceTo,
        mileageFrom,
        mileageTo,
        yearFrom,
        yearTo,
      }).toString(),
    [
      bodyStyle,
      fuel,
      model,
      priceFrom,
      priceTo,
      q,
      mileageFrom,
      mileageTo,
      yearFrom,
      yearTo,
      activeBrand,
    ],
  );
  useEffect(() => {
    const trimmedQuery = q.trim();
    if (trimmedQuery.length < HOME_MIN_SUGGESTION_LENGTH) {
      suggestionRequestCounterRef.current += 1;
      return;
    }

    const requestId = suggestionRequestCounterRef.current + 1;
    suggestionRequestCounterRef.current = requestId;

    const timeoutId = window.setTimeout(async () => {
      if (suggestionRequestCounterRef.current !== requestId) {
        return;
      }

      const algoliaSuggestions = await getAlgoliaHomeSuggestions(
        trimmedQuery,
        brand,
        brandNames,
        marketCode,
      );
      if (suggestionRequestCounterRef.current === requestId) {
        setSuggestionState({
          highlightedSuggestionIndex: -1,
          suggestions:
            algoliaSuggestions.length > 0
              ? algoliaSuggestions
              : getHomeSuggestions(trimmedQuery, brand, brandNames, modelsByBrandName),
        });
      }
    }, HOME_REMOTE_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [brand, brandNames, marketCode, modelsByBrandName, q]);

  useEffect(() => {
    setHomeSearchNavigationPending(false);
    const handlePageShow = () => setHomeSearchNavigationPending(false);

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    const scroller = categoryScrollerRef.current;
    if (!scroller) {
      return;
    }

    const updateCategoryScrollControls = () => {
      if (window.innerWidth >= 640) {
        setCategoryScrollControls({ showLeft: false, showRight: false });
        return;
      }

      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      const epsilon = 2;
      setCategoryScrollControls({
        showLeft: scroller.scrollLeft > epsilon,
        showRight: maxScrollLeft - scroller.scrollLeft > epsilon,
      });
    };

    updateCategoryScrollControls();
    scroller.addEventListener("scroll", updateCategoryScrollControls, { passive: true });
    window.addEventListener("resize", updateCategoryScrollControls);

    return () => {
      scroller.removeEventListener("scroll", updateCategoryScrollControls);
      window.removeEventListener("resize", updateCategoryScrollControls);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      updatePreviewState({ isLoading: true });

      try {
        const payload = await loadHomeSearchPreviewCount(
          homeSearchQuery,
          controller.signal,
        );
        updatePreviewState({
          count:
            payload.degraded
              ? null
              : typeof payload.count === "number"
                ? payload.count
                : null,
          isLoading: false,
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          updatePreviewState({ count: null, isLoading: false });
        }
      }
    }, HOME_PREVIEW_COUNT_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [homeSearchQuery]);

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHomeSearchNavigationPending(true);
    setShowSuggestions(false);
    trackAnalyticsEvent("search_query_submitted", {
      query: q.trim() || "browse",
      filtersCount: [
        Boolean(activeBrand),
        Boolean(model),
        Boolean(fuel),
        Boolean(bodyStyle),
        Boolean(priceFrom || priceTo),
        Boolean(mileageFrom || mileageTo),
        Boolean(yearFrom || yearTo),
      ].filter(Boolean).length,
      resultCount: typeof previewCount === "number" ? previewCount : undefined,
      locale: locale as "sk" | "ro" | "en" | "hu",
    });
    push(getMarketPath(homeSearchQuery ? `/vysledky?${homeSearchQuery}` : "/vysledky", marketCode));
  };

  const resetAllFilters = () => {
    setQ("");
    setBrand("");
    setSelectedBrands([]);
    setModel("");
    setFuel("");
    setBodyStyle("");
    setPriceFrom("");
    setPriceTo("");
    setMileageFrom("");
    setMileageTo("");
    setYearFrom("");
    setYearTo("");
    setShowSuggestions(false);
    setSuggestionState((current) => ({
      ...current,
      highlightedSuggestionIndex: -1,
    }));
    setHomeSearchNavigationPending(false);
    setActiveVehicleCategory("");
  };

  const handleCategoryPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = categoryScrollerRef.current;
    if (
      !scroller ||
      event.pointerType !== "mouse" ||
      window.innerWidth >= 640 ||
      scroller.scrollWidth <= scroller.clientWidth
    ) {
      return;
    }

    categoryDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      dragged: false,
    };
    scroller.setPointerCapture(event.pointerId);
  };

  const handleCategoryPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = categoryScrollerRef.current;
    const dragState = categoryDragStateRef.current;
    if (!scroller || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    if (Math.abs(deltaX) > 4) {
      dragState.dragged = true;
      categoryPreventClickRef.current = true;
    }

    scroller.scrollLeft = dragState.startScrollLeft - deltaX;
  };

  const releaseCategoryPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = categoryScrollerRef.current;
    const dragState = categoryDragStateRef.current;
    if (!scroller || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (scroller.hasPointerCapture(event.pointerId)) {
      scroller.releasePointerCapture(event.pointerId);
    }

    categoryDragStateRef.current = null;
    window.setTimeout(() => {
      categoryPreventClickRef.current = false;
    }, 0);
  };

  const scrollCategoryStripBy = (distance: number) => {
    const scroller = categoryScrollerRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollLeft += distance;
    window.requestAnimationFrame(() => {
      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      const epsilon = 2;
      setCategoryScrollControls({
        showLeft: scroller.scrollLeft > epsilon,
        showRight: maxScrollLeft - scroller.scrollLeft > epsilon,
      });
    });
  };

  const applySuggestion = (suggestion: SuggestionItem) => {
    if (suggestion.type === "brand") {
      const nextValue = `${suggestion.value} `;

      setQ(nextValue);
      applyPrimaryBrand(suggestion.value);
      setShowSuggestions(true);
      setSuggestionState((current) => ({
        ...current,
        highlightedSuggestionIndex: -1,
      }));
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return;
    }

    setQ(suggestion.value);
    setShowSuggestions(false);
    setSuggestionState((current) => ({
      ...current,
      highlightedSuggestionIndex: -1,
    }));

    if (suggestion.type === "model") {
      const matchedBrand =
        suggestion.brand ?? findBrandForModel(suggestion.value, modelsByBrandName);
      if (matchedBrand) {
        applyPrimaryBrand(matchedBrand);
      }
      setModel(suggestion.value);
      const newQueryString = matchedBrand ? `${matchedBrand} ${suggestion.value} ` : `${suggestion.value} `;
      setQ(newQueryString);
      
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return;
    }

    if (suggestion.type === "location") {
      // location is removed from UI input filters
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestionState((current) => ({
        ...current,
        highlightedSuggestionIndex:
          current.highlightedSuggestionIndex < suggestions.length - 1
            ? current.highlightedSuggestionIndex + 1
            : current.highlightedSuggestionIndex,
      }));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestionState((current) => ({
        ...current,
        highlightedSuggestionIndex:
          current.highlightedSuggestionIndex > 0
            ? current.highlightedSuggestionIndex - 1
            : -1,
      }));
      return;
    }

    if (event.key === "Escape") {
      setShowSuggestions(false);
      setSuggestionState((current) => ({
        ...current,
        highlightedSuggestionIndex: -1,
      }));
      return;
    }

    if (event.key === "Enter" && highlightedSuggestionIndex >= 0) {
      event.preventDefault();
      applySuggestion(suggestions[highlightedSuggestionIndex]);
    }
  };

  return (
    <TooltipProvider delayDuration={260} skipDelayDuration={1400}>
      <form
        onSubmit={onSearch}
        action={getMarketPath("/vysledky", marketCode)}
        method="get"
        autoComplete="off"
        className={cn(
          "mt-5 w-full min-w-0 max-w-full overflow-visible rounded-2xl border border-black/10 bg-white p-3 text-text-primary sm:p-4",
          className,
        )}
      >
      <div className="relative">
        <SearchIcon className="absolute left-5 top-1/2 size-6 -translate-y-1/2 text-[var(--home-mint)] transition-transform duration-300 group-focus-within:scale-110" />
        <input
          ref={searchInputRef}
          id="home-search-q"
          name="q"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={q}
          onChange={(event) => {
            const nextValue = event.target.value;
            const nextTrimmedValue = nextValue.trim().toLowerCase();

            if (
              brand &&
              nextTrimmedValue &&
              nextTrimmedValue !== brand.toLowerCase() &&
              !nextTrimmedValue.startsWith(`${brand.toLowerCase()} `)
            ) {
              applyPrimaryBrand("");
            }

            setQ(nextValue);
            setSuggestionState((current) => ({
              ...current,
              highlightedSuggestionIndex: -1,
            }));
            if (nextValue.trim().length < HOME_MIN_SUGGESTION_LENGTH) {
              setShowSuggestions(false);
              return;
            }
            setShowSuggestions(true);
          }}
          onFocus={() => {
            setIsSearchFocused(true);
            setShowSuggestions(
              q.trim().length >= HOME_MIN_SUGGESTION_LENGTH && suggestions.length > 0,
            );
          }}
          onBlur={() => {
            setIsSearchFocused(false);
            window.setTimeout(() => {
              setShowSuggestions(false);
              setSuggestionState((current) => ({
                ...current,
                highlightedSuggestionIndex: -1,
              }));
            }, 120);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder={t("searchPlaceholder")}
          className="home-search-input h-13 w-full rounded-xl border border-[var(--home-brand)]/45 bg-white pl-14 pr-4 text-sm font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-text-secondary placeholder:opacity-70 focus:border-[var(--home-brand)] focus:ring-0 focus-visible:border-[var(--home-brand)] focus-visible:outline-none focus-visible:ring-0 hover:border-[var(--home-brand)] sm:h-14 sm:text-base"
          style={{
            borderColor: "var(--home-brand)",
            boxShadow: isSearchFocused
              ? "0 10px 24px -14px rgba(17,24,39,0.28)"
              : "inset 0 0 0 1px color-mix(in srgb, var(--home-brand) 38%, white 62%), 0 10px 24px -14px rgba(17,24,39,0.28)",
            outline: "none",
          }}
        />

        {showSuggestions && suggestions.length > 0 ? (
          <div
            className="home-popover-surface home-subtle-mask absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border-subtle bg-white shadow-xl"
            style={{ transformOrigin: "left top" }}
          >
            <ul className="max-h-72 overflow-y-auto py-2">
              {suggestions.map((suggestion, index) => (
                <li key={`${suggestion.type}-${suggestion.brand ?? ""}-${suggestion.value}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySuggestion(suggestion)}
                    onMouseEnter={() =>
                      setSuggestionState((current) => ({
                        ...current,
                        highlightedSuggestionIndex: index,
                      }))
                    }
                    className={cn(
                      "home-hover-surface flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors",
                      highlightedSuggestionIndex === index && "bg-accent/10",
                    )}
                    style={
                      highlightedSuggestionIndex === index
                        ? undefined
                        : ({
                            "--home-hover-bg": "var(--color-background-tertiary)",
                          } as CSSProperties)
                    }
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          suggestion.type === "brand" && "bg-accent/10 text-accent",
                          suggestion.type === "model" && "bg-success/10 text-success",
                          suggestion.type === "location" && "bg-primary/10 text-primary",
                        )}
                      >
                        {suggestion.type === "brand" ? (
                          <CarIcon className="size-4" />
                        ) : suggestion.type === "model" ? (
                          <TagIcon className="size-4" />
                        ) : (
                          <SearchIcon className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {suggestion.value}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {suggestion.type === "brand"
                            ? t("suggestionBrand")
                            : suggestion.type === "model"
                              ? t("suggestionModel")
                              : t("suggestionLocation")}
                        </span>
                      </span>
                    </span>
                    {typeof suggestion.count === "number" ? (
                      <span className="text-xs text-text-muted">{suggestion.count}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div
        role="group"
        aria-label={t("popularFiltersLabel")}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-primary">
          {t("popularFiltersLabel")}
        </span>
        <button
          type="button"
          aria-pressed={fuel === "electric"}
          onClick={() => setFuel(fuel === "electric" ? "" : "electric")}
          className={cn(
            "home-pressable inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-all",
            fuel === "electric"
              ? "border-[var(--home-brand)] bg-[var(--home-brand)] text-[var(--home-mint)] shadow-sm"
              : "border-border-subtle bg-white text-text-primary hover:border-[var(--home-mint)] hover:bg-[var(--home-mint-soft)] hover:text-[var(--home-brand)]",
          )}
        >
          <ZapIcon aria-hidden="true" className="size-4" />
          {tFuel("electric")}
        </button>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-primary">
            {t("popularBrandsLabel")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-8">
          {featuredBrands.length > 0
            ? featuredBrands.map((option) => {
                const isActive = activeBrand === option.name;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={option.name}
                    onClick={() => {
                      applyPrimaryBrand(isActive ? "" : option.name);
                    }}
                    className={cn(
                      "home-pressable home-hover-surface relative flex min-w-0 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-[9px] font-semibold transition-all group sm:px-2 sm:py-2 lg:px-1.5",
                      isActive
                        ? "border-[var(--home-brand)] bg-[var(--home-brand)] text-[var(--home-mint)] shadow-md"
                        : "border-border-subtle bg-white text-text-primary",
                    )}
                    style={
                      (
                        isActive
                          ? {
                              "--home-hover-border": "var(--home-brand)",
                              "--home-hover-bg": "var(--home-brand)",
                              "--home-hover-text": "var(--home-mint)",
                              "--home-hover-shadow": "var(--shadow-md)",
                            }
                          : {
                              "--home-hover-border": "var(--home-mint)",
                              "--home-hover-bg": "var(--home-mint-soft)",
                              "--home-hover-text": "var(--home-brand)",
                              "--home-hover-shadow": "var(--shadow-sm)",
                            }
                      ) as CSSProperties
                    }
                  >
                    <span className="flex h-8 w-full items-center justify-center rounded-md bg-white sm:h-9">
                      <HomeBrandLogo brand={option.name} slug={option.slug} />
                    </span>
                  </button>
                );
              })
            : HOME_FEATURED_BRAND_SLUGS.map((slug) => (
                <span
                  key={`brand-placeholder-${slug}`}
                  aria-hidden="true"
                  className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-border-subtle bg-white px-1 py-1.5 sm:px-2 sm:py-2 lg:px-1.5"
                >
                  <span className="flex h-8 w-full items-center justify-center rounded-md bg-background-muted sm:h-9" />
                </span>
              ))}
        </div>
      </div>

      <div className="mt-3 hidden" aria-hidden="true">
        <div className="relative w-full min-w-0 overflow-visible">
          <div
            ref={categoryScrollerRef}
            onPointerDown={handleCategoryPointerDown}
            onPointerMove={handleCategoryPointerMove}
            onPointerUp={releaseCategoryPointer}
            onPointerCancel={releaseCategoryPointer}
            onClickCapture={(event) => {
              if (!categoryPreventClickRef.current) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
            }}
            className="w-full min-w-0 overflow-visible px-0 pb-1 min-[360px]:overflow-x-auto min-[360px]:overflow-y-visible min-[360px]:[-ms-overflow-style:none] min-[360px]:[scrollbar-width:none] min-[360px]:[&::-webkit-scrollbar]:hidden sm:overflow-visible sm:pb-0"
          >
            <div
              aria-label={t("categoryTabsLabel")}
              className="grid w-full grid-cols-3 gap-1.5 pr-1 min-[360px]:flex min-[360px]:w-max min-[360px]:min-w-full min-[360px]:pr-2 sm:grid sm:w-auto sm:grid-cols-5 sm:gap-2 sm:pr-0 xl:grid-cols-9"
            >
              {HOME_CATEGORY_TABS.map((tab) => {
                const isActive = activeVehicleCategory === tab.key;
                const label =
                  tab.key === "all"
                    ? t("categoryAll")
                    : tBodyType(tab.bodyStyle as Parameters<typeof tBodyType>[0]);

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        setActiveVehicleCategory("");
                        setBodyStyle("");
                        return;
                      }

                      setActiveVehicleCategory(tab.key);
                      setBodyStyle(tab.bodyStyle);
                    }}
                    className={cn(
                      "home-pressable home-hover-surface flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-1.5 py-1 text-center transition-all group min-[360px]:w-[86px] min-[360px]:shrink-0 sm:min-h-12 sm:w-full sm:px-2",
                      isActive
                        ? "border-[var(--home-brand)] bg-[var(--home-brand)] text-[var(--home-mint)] shadow-md"
                        : "border-border-subtle bg-white text-text-primary",
                    )}
                    style={
                      (
                        isActive
                          ? {
                              "--home-hover-border": "var(--home-brand)",
                              "--home-hover-bg": "var(--home-brand)",
                              "--home-hover-text": "var(--home-mint)",
                              "--home-hover-shadow": "var(--shadow-md)",
                            }
                          : {
                              "--home-hover-border": "var(--home-mint)",
                              "--home-hover-bg": "var(--home-mint-soft)",
                              "--home-hover-text": "var(--home-brand)",
                              "--home-hover-shadow": "var(--shadow-sm)",
                            }
                      ) as CSSProperties
                    }
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors sm:size-8",
                        isActive
                          ? "bg-[var(--home-mint)] text-[var(--home-brand)]"
                          : "bg-white text-text-primary group-hover:bg-[var(--home-mint)] group-hover:text-[var(--home-brand)]",
                      )}
                    >
                      <CarIcon aria-hidden="true" className="size-4 sm:size-[18px]" />
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold leading-tight transition-colors sm:text-[11px]",
                        !isActive && "group-hover:text-[var(--home-brand)]",
                      )}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-1 top-[calc(50%-6px)] z-10 flex -translate-y-1/2 items-center justify-between sm:hidden">
            <div className="flex size-9 items-center justify-center">
              {categoryScrollControls.showLeft ? (
                <button
                  type="button"
                  aria-label={t("scrollCategoriesLeft")}
                  onClick={() => scrollCategoryStripBy(-224)}
                  className="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border border-[var(--home-mint)]/28 bg-[var(--home-mint)]/12 text-[var(--home-brand)] shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--home-mint)]/18"
                >
                  <ArrowRightIcon className="size-4 rotate-180" />
                </button>
              ) : null}
            </div>
            <div className="flex size-9 items-center justify-center">
              {categoryScrollControls.showRight ? (
                <button
                  type="button"
                  aria-label={t("scrollCategoriesRight")}
                  onClick={() => scrollCategoryStripBy(224)}
                  className="pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border border-[var(--home-mint)]/28 bg-[var(--home-mint)]/12 text-[var(--home-brand)] shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--home-mint)]/18"
                >
                  <ArrowRightIcon className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div id="home-inline-range-fields" className="mt-3">
        {showAdvancedFilters ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="col-span-full grid gap-2 sm:grid-cols-3 sm:gap-3">
              <HomeSelect
                label={t("brandOption")}
                value={activeBrand}
                onChange={(nextBrand) => applyPrimaryBrand(nextBrand)}
                icon={<CarIcon className="size-4" />}
                options={brandOptions}
                popularOptionCount={Math.min(
                  HOME_FEATURED_BRAND_SLUGS.length,
                  brandOptions.length,
                )}
                popoverClassName={HOME_BRAND_POPOVER_CLASS_NAME}
                renderOption={(option) => {
                  const slug = brandSlugByName.get(option.value) ?? "";
                  return (
                    <>
                      <span className="flex h-7 w-10 shrink-0 items-center justify-center">
                        {HOME_BRAND_LOGOS[slug] ? (
                          <Image
                            src={HOME_BRAND_LOGOS[slug]}
                            alt=""
                            width={40}
                            height={24}
                            className="max-h-6 w-auto max-w-10 object-contain"
                          />
                        ) : (
                          <CarIcon className="size-4 text-text-muted" />
                        )}
                      </span>
                      <span className="truncate font-semibold">{option.label}</span>
                    </>
                  );
                }}
              />

              <HomeSelect
                label={t("modelOption")}
                value={model}
                onChange={setModel}
                icon={<TagIcon className="size-4" />}
                options={modelOptions}
                disabled={!activeBrand}
              />

              <HomeSelect
                label={t("fuelOption")}
                value={fuel}
                onChange={setFuel}
                icon={<CarIcon className="size-4" />}
                options={[
                  { label: tFuel("petrol"), value: "petrol" },
                  { label: tFuel("diesel"), value: "diesel" },
                  { label: tFuel("electric"), value: "electric" },
                  { label: tFuel("hybrid"), value: "hybrid" },
                  { label: tFuel("lpg"), value: "lpg" },
                ]}
              />
            </div>

            <div className="col-span-full grid gap-3 xl:grid-cols-3">
              <div className="space-y-2 rounded-xl border border-border-subtle bg-background-secondary/50 p-2.5">
                <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                  {tFilters("priceTitle")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <HomeEditableNumberField
                    label={t("priceFromPlaceholder")}
                    value={priceFrom}
                    onChange={setPriceFrom}
                    icon={<TagIcon className="size-4" />}
                    options={createHomeNumberOptions(HOME_PRICE_FROM_PRESETS, "EUR", locale)}
                  />
                  <HomeEditableNumberField
                    label={t("priceToOption")}
                    value={priceTo}
                    onChange={setPriceTo}
                    icon={<TagIcon className="size-4" />}
                    options={createHomeNumberOptions(HOME_PRICE_TO_PRESETS, "EUR", locale)}
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border-subtle bg-background-secondary/50 p-2.5">
                <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                  {tFilters("mileageTitle")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <HomeEditableNumberField
                    label={t("mileageFromPlaceholder")}
                    value={mileageFrom}
                    onChange={setMileageFrom}
                    icon={<SpeedometerIcon className="size-4" />}
                    options={createHomeNumberOptions(HOME_MILEAGE_FROM_PRESETS, "km", locale)}
                  />
                  <HomeEditableNumberField
                    label={t("mileageToPlaceholder")}
                    value={mileageTo}
                    onChange={setMileageTo}
                    icon={<SpeedometerIcon className="size-4" />}
                    options={createHomeNumberOptions(HOME_MILEAGE_TO_PRESETS, "km", locale)}
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border-subtle bg-background-secondary/50 p-2.5">
                <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                  {tFilters("yearTitle")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <HomeEditableNumberField
                    label={t("yearFromPlaceholder")}
                    value={yearFrom}
                    onChange={setYearFrom}
                    icon={<CalendarIcon className="size-4" />}
                    options={yearOptions}
                  />
                  <HomeEditableNumberField
                    label={t("yearToPlaceholder")}
                    value={yearTo}
                    onChange={setYearTo}
                    icon={<CalendarIcon className="size-4" />}
                    options={yearOptions}
                  />
                </div>
              </div>
            </div>

            <HomeSelect
              className="xl:col-span-2"
              label={t("bodyStyleOption")}
              value={bodyStyle}
              onChange={setBodyStyle}
              icon={<CarIcon className="size-4" />}
              options={[
                { label: tBodyType("hatchback"), value: "hatchback" },
                { label: tBodyType("sedan"), value: "sedan" },
                { label: tBodyType("combi"), value: "combi" },
                { label: tBodyType("suv"), value: "suv" },
                { label: tBodyType("coupe"), value: "coupe" },
                { label: tBodyType("cabriolet"), value: "cabriolet" },
                { label: tBodyType("mpv"), value: "mpv" },
                { label: tBodyType("pickup"), value: "pickup" },
                { label: tBodyType("commercial"), value: "commercial" },
              ]}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-7">
            <HomeSelect
              className="lg:col-span-2"
              label={t("brandOption")}
              value={activeBrand}
              onChange={(nextBrand) => applyPrimaryBrand(nextBrand)}
              icon={<CarIcon className="size-4" />}
              options={brandOptions}
              popularOptionCount={Math.min(
                HOME_FEATURED_BRAND_SLUGS.length,
                brandOptions.length,
              )}
              popoverClassName={HOME_BRAND_POPOVER_CLASS_NAME}
              renderOption={(option) => {
                const slug = brandSlugByName.get(option.value) ?? "";
                return (
                  <>
                    <span className="flex h-7 w-10 shrink-0 items-center justify-center">
                      {HOME_BRAND_LOGOS[slug] ? (
                        <Image
                          src={HOME_BRAND_LOGOS[slug]}
                          alt=""
                          width={40}
                          height={24}
                          className="max-h-6 w-auto max-w-10 object-contain"
                        />
                      ) : (
                        <CarIcon className="size-4 text-text-muted" />
                      )}
                    </span>
                    <span className="truncate font-semibold">{option.label}</span>
                  </>
                );
              }}
            />

            <HomeSelect
              label={t("modelOption")}
              value={model}
              onChange={setModel}
              icon={<TagIcon className="size-4" />}
              options={modelOptions}
              disabled={!activeBrand}
            />

            <HomeEditableNumberField
              label={t("yearFromPlaceholder")}
              value={yearFrom}
              onChange={setYearFrom}
              icon={<CalendarIcon className="size-4" />}
              options={yearOptions}
            />

            <HomeEditableNumberField
              label={t("mileageToPlaceholder")}
              value={mileageTo}
              onChange={setMileageTo}
              icon={<SpeedometerIcon className="size-4" />}
              options={createHomeNumberOptions(HOME_MILEAGE_TO_PRESETS, "km", locale)}
            />

            <HomeEditableNumberField
              label={t("priceToOption")}
              value={priceTo}
              onChange={setPriceTo}
              icon={<TagIcon className="size-4" />}
              options={createHomeNumberOptions(HOME_PRICE_TO_PRESETS, "EUR", locale)}
            />

            <HomeSelect
              label={t("fuelOption")}
              value={fuel}
              onChange={setFuel}
              icon={<CarIcon className="size-4" />}
              options={[
                { label: tFuel("petrol"), value: "petrol" },
                { label: tFuel("diesel"), value: "diesel" },
                { label: tFuel("electric"), value: "electric" },
                { label: tFuel("hybrid"), value: "hybrid" },
                { label: tFuel("lpg"), value: "lpg" },
              ]}
            />
          </div>
        )}
      </div>

      {hasAnyFilters ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={filter.onRemove}
                className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-[var(--home-mint)] bg-[var(--home-mint-soft)] px-3 py-2 text-xs font-semibold text-[var(--home-mint-ink)] shadow-sm transition-colors hover:bg-[var(--home-mint-strong)]"
              >
                <span className="max-w-[150px] truncate">{filter.label}</span>
                <span className="flex size-5 items-center justify-center rounded-full bg-white/55 text-[11px] font-bold">
                  &times;
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between">
        {hasAnyFilters ? (
          <button
            type="button"
            onClick={resetAllFilters}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border-strong bg-white px-3 text-text-primary shadow-sm transition-colors hover:border-[var(--home-brand)] hover:text-[var(--home-brand)]"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            {t("resetFilters")}
          </button>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
          <button
            type="button"
            aria-controls="home-inline-range-fields"
            aria-expanded={showAdvancedFilters}
            onClick={() =>
              updateSearchUiState({ showAdvancedFilters: !showAdvancedFilters })
            }
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-white px-3 text-text-primary transition-colors hover:border-[var(--home-brand)] hover:bg-background-muted hover:text-[var(--color-accent-text)]"
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            {t(showAdvancedFilters ? "inlineRangesHide" : "inlineRangesShow")}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSearching}
        aria-label={submitButtonLabel}
        aria-busy={isSearching || isPreviewLoading}
        className={cn(
          "market-action-primary mt-3 flex h-14 min-h-14 w-full px-5 py-3",
          isSearching && "cursor-not-allowed opacity-80",
        )}
      >
        <span className="grid h-6 w-full max-w-md grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center gap-3">
          {isSearching || isPreviewLoading ? (
            <SpinnerIcon aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="truncate text-center text-base font-semibold sm:text-lg">
            {isSearching
              ? t("searching")
              : isPreviewLoading
                ? t("updatingPreview")
                : submitButtonLabel}
          </span>
          {isSearching || isPreviewLoading ? (
            <span aria-hidden="true" />
          ) : (
            <ArrowRightIcon aria-hidden="true" className="size-5" />
          )}
        </span>
      </button>
      </form>
    </TooltipProvider>
  );
}
