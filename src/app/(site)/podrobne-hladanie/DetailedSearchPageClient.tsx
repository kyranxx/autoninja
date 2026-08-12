"use client";

import Image from "next/image";
import {
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import { useMarketCode } from "@/context/MarketContext";
import { usePublicVehicleTaxonomy } from "@/lib/vehicle-taxonomy/client";
import { detailedSearchStateFromParams, detailedSearchStateToParams, type DetailedSearchState } from "@/lib/algolia/detailed-search-state";
import { getMarketPath } from "@/lib/routes";
import { HOME_LOCATIONS } from "@/components/home/theme";
import { cn } from "@/utils/cn";

const FUEL_VALUES = ["petrol", "diesel", "electric", "hybrid", "lpg", "cng"] as const;
const BODY_STYLE_VALUES = [
  "sedan",
  "combi",
  "suv",
  "hatchback",
  "coupe",
  "cabriolet",
  "mpv",
  "pickup",
  "commercial",
] as const;
const TRANSMISSION_VALUES = ["manual", "automatic"] as const;

function textValue(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  return event.target.value;
}

function SectionCard({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white shadow-sm"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="!text-base font-extrabold tracking-tight text-text-primary sm:!text-lg">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-text-primary">
      {children}
    </label>
  );
}

function TextField({
  id,
  label,
  placeholder,
  value,
  onChange,
  icon,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon?: ReactNode;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">{icon}</span> : null}
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(textValue(event))}
          className={cn(
            "market-field h-12 w-full bg-white px-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/20",
            icon && "pl-10",
          )}
        />
      </div>
    </div>
  );
}

function BrandSelectField({
  id,
  label,
  placeholder,
  brands,
  options,
  onAdd,
  onRemove,
  removeLabel,
}: {
  id: string;
  label: string;
  placeholder: string;
  brands: string[];
  options: { label: string; value: string }[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  removeLabel: (value: string) => string;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative flex min-h-12 flex-wrap items-center gap-1.5 rounded-lg border border-primary/14 bg-white p-2 pr-10 transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20">
        {brands.map((brand) => (
          <span
            key={brand}
            className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md bg-accent-subtle px-2.5 text-xs font-bold text-accent"
          >
            <span className="max-w-[150px] truncate">{brand}</span>
            <button
              type="button"
              aria-label={removeLabel(brand)}
              onClick={() => onRemove(brand)}
              className="rounded-full p-0.5 text-accent hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        ))}
        <select
          id={id}
          value=""
          onChange={(event) => onAdd(textValue(event))}
          className="min-w-[150px] flex-1 appearance-none border-0 bg-transparent px-1.5 py-1 text-sm font-semibold text-text-primary outline-none"
        >
          <option value="">{placeholder}</option>
          {options
            .filter((option) => !brands.includes(option.value))
            .map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
      </div>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(textValue(event))}
          className="market-field h-12 w-full appearance-none bg-background-secondary px-3.5 pr-10 text-sm font-medium text-text-primary focus:border-accent focus:ring-1 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
      </div>
    </div>
  );
}

function RangePair({
  id,
  label,
  fromLabel,
  toLabel,
  from,
  to,
  onFromChange,
  onToChange,
  suffix,
}: {
  id: string;
  label: string;
  fromLabel: string;
  toLabel: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  suffix: string;
}) {
  return (
    <fieldset className="rounded-xl border border-primary/10 bg-background-muted/70 p-3">
      <legend className="px-1 text-sm font-semibold text-text-primary">{label}</legend>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="relative min-w-0">
          <label htmlFor={`${id}-from`} className="sr-only">{`${label} ${fromLabel}`}</label>
          <input
            id={`${id}-from`}
            type="number"
            inputMode="numeric"
            min={0}
            value={from}
            placeholder={fromLabel}
            onChange={(event) => onFromChange(textValue(event))}
            className={cn(
              "market-field h-11 w-full bg-white px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/20",
              suffix ? "pr-12" : "pr-3",
            )}
          />
          {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-text-muted">{suffix}</span> : null}
        </div>
        <div className="relative min-w-0">
          <label htmlFor={`${id}-to`} className="sr-only">{`${label} ${toLabel}`}</label>
          <input
            id={`${id}-to`}
            type="number"
            inputMode="numeric"
            min={0}
            value={to}
            placeholder={toLabel}
            onChange={(event) => onToChange(textValue(event))}
            className={cn(
              "market-field h-11 w-full bg-white px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/20",
              suffix ? "pr-12" : "pr-3",
            )}
          />
          {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-text-muted">{suffix}</span> : null}
        </div>
      </div>
    </fieldset>
  );
}

function ChoiceGroup({
  label,
  values,
  selected,
  labels,
  onToggle,
  selectedCount,
}: {
  label: string;
  values: readonly string[];
  selected: string[];
  labels: (value: string) => string;
  onToggle: (value: string) => void;
  selectedCount?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-text-primary">
        {label}
        {selectedCount ? <span className="ml-2 text-xs font-medium text-text-muted">{selectedCount}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const isSelected = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(value)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                isSelected
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-border-strong bg-white text-text-secondary hover:border-accent hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
              )}
            >
              {isSelected ? <Check aria-hidden="true" className="size-4" /> : null}
              {labels(value)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ToggleChoice({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onChange}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-colors",
        checked
          ? "border-primary bg-primary/5 text-text-primary"
          : "border-border-strong bg-white text-text-secondary hover:border-accent/60 hover:text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
      )}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded border-2",
          checked ? "border-primary bg-primary text-white" : "border-border-strong bg-background",
        )}
      >
        {checked ? <Check className="size-3.5" /> : null}
      </span>
    </button>
  );
}

function countSelectedFilters(state: DetailedSearchState): number {
  const rangeCount = [
    [state.priceFrom, state.priceTo],
    [state.mileageFrom, state.mileageTo],
    [state.yearFrom, state.yearTo],
    [state.powerFrom, state.powerTo],
  ].filter(([from, to]) => Boolean(from || to)).length;

  return (
    Number(Boolean(state.q.trim())) +
    state.brands.length +
    Number(Boolean(state.model)) +
    state.fuels.length +
    state.bodyStyles.length +
    state.transmissions.length +
    state.locations.length +
    rangeCount +
    Number(state.hasServiceBook) +
    Number(state.notCrashed) +
    Number(state.boughtInSk) +
    Number(state.vatDeductible)
  );
}

export default function DetailedSearchPageClient() {
  const locale = useLocale();
  const t = useTranslations("detailedSearch");
  const tFuel = useTranslations("fuel");
  const tBodyType = useTranslations("bodyType");
  const tTransmission = useTranslations("transmission");
  const searchParams = useSearchParams();
  const router = useRouter();
  const marketCode = useMarketCode();
  const { brandNames, modelsByBrandName } = usePublicVehicleTaxonomy();
  const queryString = searchParams.toString();
  const routeState = useMemo(
    () => detailedSearchStateFromParams(new URLSearchParams(queryString)),
    [queryString],
  );
  const [draft, setDraft] = useState<{
    queryString: string;
    state: DetailedSearchState;
  }>(() => ({ queryString, state: routeState }));
  const state = draft.queryString === queryString ? draft.state : routeState;

  const updateField = <K extends keyof DetailedSearchState>(
    key: K,
    value: DetailedSearchState[K],
  ) => {
    setDraft({
      queryString,
      state: { ...state, [key]: value },
    });
  };

  const toggleListValue = (
    key: "fuels" | "bodyStyles" | "transmissions" | "locations",
    value: string,
  ) => {
    setDraft((currentDraft) => {
      const currentState =
        currentDraft.queryString === queryString ? currentDraft.state : routeState;
      const values = currentState[key];
      return {
        queryString,
        state: {
          ...currentState,
          [key]: values.includes(value)
            ? values.filter((item) => item !== value)
            : [...values, value],
        },
      };
    });
  };

  const modelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          state.brands.flatMap((brand) => modelsByBrandName[brand] ?? []),
        ),
      )
        .sort((left, right) => left.localeCompare(right, locale))
        .map((model) => ({ label: model, value: model })),
    [locale, modelsByBrandName, state.brands],
  );

  const brandOptions = useMemo(
    () => brandNames.map((brand) => ({ label: brand, value: brand })),
    [brandNames],
  );

  const currentStateQuery = detailedSearchStateToParams(state).toString();
  const selectedFilterCount = useMemo(() => countSelectedFilters(state), [state]);
  const isElectricOnly = state.fuels.length === 1 && state.fuels[0] === "electric";
  const resultsHref = getMarketPath(
    currentStateQuery ? `/vysledky?${currentStateQuery}` : "/vysledky",
    marketCode,
  );

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(resultsHref);
  };

  const addBrand = (brand: string) => {
    if (!brand || state.brands.includes(brand)) return;
    updateField("brands", [...state.brands, brand]);
  };

  const removeBrand = (brand: string) => {
    const nextBrands = state.brands.filter((item) => item !== brand);
    const availableModels = new Set(
      nextBrands.flatMap((selectedBrand) => modelsByBrandName[selectedBrand] ?? []),
    );

    setDraft({
      queryString,
      state: {
        ...state,
        brands: nextBrands,
        model: state.model && availableModels.has(state.model) ? state.model : "",
      },
    });
  };

  return (
    <main id="main-content" className="market-page min-h-screen bg-background-muted pb-12 pt-4 sm:pb-16 sm:pt-6">
      <div className="container-main max-w-[84rem]">
        <div className="mb-4">
          <a href={resultsHref} className="inline-flex min-h-9 items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-hover">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("backToResults")}
          </a>
        </div>

        <div className="relative isolate overflow-hidden rounded-2xl border border-primary bg-primary px-4 py-4 text-white shadow-lg sm:px-7 sm:py-5">
          <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-accent/25 blur-2xl" />
          <h1 className="relative z-10 !text-3xl font-black leading-[1.05] tracking-tight !text-white sm:!text-4xl">{t("title")}</h1>
        </div>

        <form onSubmit={submitSearch} className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-5">
          <div className="space-y-4">
            <SectionCard step="01" title={t("basicSection")}>
              <div className="space-y-3">
                <TextField
                  id="detailed-search-query"
                  label={t("queryLabel")}
                  placeholder={t("queryPlaceholder")}
                  value={state.q}
                  onChange={(value) => updateField("q", value)}
                  icon={<Search aria-hidden="true" className="size-4" />}
                />
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:items-start">
                  <BrandSelectField
                    id="detailed-search-brand"
                    label={t("brandLabel")}
                    placeholder={t("brandPlaceholder")}
                    brands={state.brands}
                    options={brandOptions}
                    onAdd={addBrand}
                    onRemove={removeBrand}
                    removeLabel={(brand) => t("selectedBrandRemove", { brand })}
                  />
                  <SelectField
                    id="detailed-search-model"
                    label={t("modelLabel")}
                    value={state.model}
                    placeholder={state.brands.length > 0 ? (modelOptions.length > 0 ? t("modelPlaceholder") : t("noModels")) : t("selectBrandFirst")}
                    options={modelOptions}
                    disabled={state.brands.length === 0 || modelOptions.length === 0}
                    onChange={(value) => updateField("model", value)}
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard step="02" title={t("rangesSection")} description={t("hint")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <RangePair
                  id="detailed-price"
                  label={t("priceLabel")}
                  fromLabel={t("from")}
                  toLabel={t("to")}
                  from={state.priceFrom}
                  to={state.priceTo}
                  onFromChange={(value) => updateField("priceFrom", value)}
                  onToChange={(value) => updateField("priceTo", value)}
                  suffix="EUR"
                />
                <RangePair
                  id="detailed-mileage"
                  label={t("mileageLabel")}
                  fromLabel={t("from")}
                  toLabel={t("to")}
                  from={state.mileageFrom}
                  to={state.mileageTo}
                  onFromChange={(value) => updateField("mileageFrom", value)}
                  onToChange={(value) => updateField("mileageTo", value)}
                  suffix="km"
                />
                <RangePair
                  id="detailed-year"
                  label={t("yearLabel")}
                  fromLabel={t("from")}
                  toLabel={t("to")}
                  from={state.yearFrom}
                  to={state.yearTo}
                  onFromChange={(value) => updateField("yearFrom", value)}
                  onToChange={(value) => updateField("yearTo", value)}
                  suffix=""
                />
                <RangePair
                  id="detailed-power"
                  label={t("powerLabel")}
                  fromLabel={t("from")}
                  toLabel={t("to")}
                  from={state.powerFrom}
                  to={state.powerTo}
                  onFromChange={(value) => updateField("powerFrom", value)}
                  onToChange={(value) => updateField("powerTo", value)}
                  suffix="kW"
                />
              </div>
            </SectionCard>

            <SectionCard step="03" title={t("technicalSection")}>
              <div>
                <div className="mb-5 flex flex-col gap-3 rounded-xl border border-accent/25 bg-accent-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm">
                      <Zap aria-hidden="true" className="size-4" />
                    </span>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">{t("quickFilterLabel")}</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={isElectricOnly}
                    onClick={() => updateField("fuels", isElectricOnly ? [] : ["electric"])}
                    className={cn(
                      "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
                      isElectricOnly
                        ? "border-primary bg-primary text-white"
                        : "border-accent/35 bg-white text-primary hover:border-accent hover:bg-accent/10",
                    )}
                  >
                    <Zap aria-hidden="true" className="size-4" />
                    {t("electricOnly")}
                  </button>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <ChoiceGroup
                    label={t("fuelLabel")}
                    values={FUEL_VALUES}
                    selected={state.fuels}
                    labels={(value) => tFuel(value as Parameters<typeof tFuel>[0])}
                    onToggle={(value) => toggleListValue("fuels", value)}
                    selectedCount={state.fuels.length > 0 ? t("selectedCount", { count: state.fuels.length }) : undefined}
                  />
                  <ChoiceGroup
                    label={t("transmissionLabel")}
                    values={TRANSMISSION_VALUES}
                    selected={state.transmissions}
                    labels={(value) => tTransmission(value as Parameters<typeof tTransmission>[0])}
                    onToggle={(value) => toggleListValue("transmissions", value)}
                    selectedCount={state.transmissions.length > 0 ? t("selectedCount", { count: state.transmissions.length }) : undefined}
                  />
                  <div className="lg:col-span-2">
                    <ChoiceGroup
                      label={t("bodyStyleLabel")}
                      values={BODY_STYLE_VALUES}
                      selected={state.bodyStyles}
                      labels={(value) => tBodyType(value as Parameters<typeof tBodyType>[0])}
                      onToggle={(value) => toggleListValue("bodyStyles", value)}
                      selectedCount={state.bodyStyles.length > 0 ? t("selectedCount", { count: state.bodyStyles.length }) : undefined}
                    />
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard step="04" title={t("locationTrustSection")}>
              <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
                <ChoiceGroup
                  label={t("locationLabel")}
                  values={HOME_LOCATIONS}
                  selected={state.locations}
                  labels={(value) => value}
                  onToggle={(value) => toggleListValue("locations", value)}
                  selectedCount={state.locations.length > 0 ? t("selectedCount", { count: state.locations.length }) : undefined}
                />
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-text-primary">{t("trustLabel")}</legend>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    <ToggleChoice checked={state.hasServiceBook} label={t("serviceBook")} onChange={() => updateField("hasServiceBook", !state.hasServiceBook)} />
                    <ToggleChoice checked={state.notCrashed} label={t("notCrashed")} onChange={() => updateField("notCrashed", !state.notCrashed)} />
                    <ToggleChoice checked={state.boughtInSk} label={t("boughtInMarket")} onChange={() => updateField("boughtInSk", !state.boughtInSk)} />
                    <ToggleChoice checked={state.vatDeductible} label={t("vatDeductible")} onChange={() => updateField("vatDeductible", !state.vatDeductible)} />
                  </div>
                </fieldset>
              </div>
            </SectionCard>

            <button
              type="submit"
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-accent px-4 text-sm font-black text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lg:hidden"
            >
              {t("submit")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
          </div>

          <aside className="order-first lg:order-last lg:sticky lg:top-24">
            <div className="relative isolate overflow-hidden rounded-2xl border border-primary bg-primary p-4 text-white shadow-lg sm:p-5">
              <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/25 blur-2xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/80">
                      <SlidersHorizontal aria-hidden="true" className="size-4 text-accent" />
                      {t("summaryTitle")}
                    </div>
                    <p className="mt-4 text-sm font-bold leading-relaxed text-white">
                      {selectedFilterCount > 0 ? t("summarySelected", { count: selectedFilterCount }) : t("summaryEmpty")}
                    </p>
                  </div>
                  <Image
                    src="/brand/autoninja/mascot-search-inspect-car-v1.png"
                    alt={t("mascotAlt")}
                    width={112}
                    height={112}
                    className="h-24 w-24 shrink-0 object-contain object-bottom"
                  />
                </div>
                <button
                  type="submit"
                  className="mt-4 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-accent px-4 text-sm font-black text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  {t("submit")}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </button>
                <a href={resultsHref} className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-white/30 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
                  {t("backToResults")}
                </a>
              </div>
            </div>
          </aside>
        </form>
      </div>
    </main>
  );
}
