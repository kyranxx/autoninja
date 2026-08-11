"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ToggleRefinement,
  useClearRefinements,
  useCurrentRefinements,
  useRange,
  useRefinementList,
  useStats,
} from "react-instantsearch";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/utils/cn";
import {
  ChevronDown as ChevronDownIcon,
  Search as SearchIcon,
  X as XIcon,
} from "lucide-react";
import { usePublicVehicleTaxonomy } from "@/lib/vehicle-taxonomy/client";
import { getResultCountMessageKey } from "@/lib/search/result-count-copy";

type RefinementOption = {
  value: string;
  label: string;
  count: number;
  isRefined: boolean;
};

type RangePreset = {
  key: string;
  label: string;
  min?: number;
  max?: number;
};

function toFieldId(prefix: string, value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${prefix}-${slug || "item"}`;
}

function normalizeRefinementKey(value: string): string {
  return value.trim().toLocaleLowerCase("sk");
}

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9]+/g, "");
}

function getKnownModelsForBrand(
  brand: string,
  brandNames: string[],
  modelsByBrandName: Record<string, string[]>,
): string[] {
  const normalizedBrand = normalizeComparableText(brand);
  const directBrandModels =
    Object.entries(modelsByBrandName).find(
      ([brandName]) => normalizeComparableText(brandName) === normalizedBrand,
    )?.[1] ?? [];

  if (directBrandModels.length > 0) {
    return directBrandModels;
  }

  return brandNames.includes(brand) ? (modelsByBrandName[brand] ?? []) : [];
}

function sortRefinementOptions(
  left: RefinementOption,
  right: RefinementOption,
): number {
  if (left.isRefined !== right.isRefined) {
    return left.isRefined ? -1 : 1;
  }

  if (left.count !== right.count) {
    return right.count - left.count;
  }

  return left.label.localeCompare(right.label, "sk");
}

export function mergePersistentRefinementOptions(
  persistedOptions: RefinementOption[],
  liveOptions: RefinementOption[],
  selectedLabels: string[] = [],
): RefinementOption[] {
  const mergedByKey = new Map<string, RefinementOption>();

  for (const option of persistedOptions) {
    mergedByKey.set(normalizeRefinementKey(option.value), option);
  }

  for (const option of liveOptions) {
    mergedByKey.set(normalizeRefinementKey(option.value), option);
  }

  for (const label of selectedLabels) {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      continue;
    }

    const key = normalizeRefinementKey(trimmedLabel);
    const existing = mergedByKey.get(key);
    mergedByKey.set(key, {
      value: existing?.value ?? trimmedLabel,
      label: existing?.label ?? trimmedLabel,
      count: existing?.count ?? 0,
      isRefined: true,
    });
  }

  return Array.from(mergedByKey.values()).sort(sortRefinementOptions);
}

export function getVisibleBrandRefinementOptions(
  catalogOptions: RefinementOption[],
  liveOptions: RefinementOption[],
  selectedLabels: string[],
  searchQuery: string,
): RefinementOption[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const source = normalizedQuery
    ? mergePersistentRefinementOptions(catalogOptions, liveOptions, selectedLabels)
    : mergePersistentRefinementOptions([], liveOptions, selectedLabels);

  if (!normalizedQuery) {
    return source;
  }

  return source.filter((item) =>
    item.label.toLowerCase().includes(normalizedQuery),
  );
}

function RefinementToggleButton({
  item,
  prefix,
  onToggle,
  label,
}: {
  item: { value: string; isRefined: boolean; count: number };
  prefix: string;
  onToggle: () => void;
  label: string;
}) {
  const controlId = toFieldId(prefix, item.value);

  return (
    <button
      type="button"
      id={controlId}
      aria-pressed={item.isRefined}
      onClick={onToggle}
      className={cn(
        "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        item.isRefined ? "bg-primary/5" : "hover:bg-background-tertiary",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
          item.isRefined
            ? "border-primary bg-primary text-white"
            : "border-border-strong bg-background",
        )}
        aria-hidden="true"
      >
        {item.isRefined ? (
          <span className="size-1.5 rounded-full bg-white" />
        ) : null}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm transition-colors",
          item.isRefined
            ? "font-medium text-text-primary"
            : "text-text-secondary",
        )}
      >
        {label}
      </span>
      <span className="shrink-0 text-xs text-text-muted tabular-nums">
        {item.count}
      </span>
    </button>
  );
}

export function FilterSidebar({
  idScope = "filters",
}: { idScope?: string } = {}) {
  const tFilters = useTranslations("filters");
  const tHomeSearch = useTranslations("homeSearch");
  const tFuel = useTranslations("fuel");
  const tTransmission = useTranslations("transmission");
  const tBodyType = useTranslations("bodyType");
  const { items: activeRefinementGroups, refine: refineCurrent } =
    useCurrentRefinements();
  const { canRefine: canClearFilters, refine: clearFilters } =
    useClearRefinements();

  const formatFilterTitle = useMemo(
    () => (attribute: string) => {
      switch (attribute) {
        case "brand":
          return tFilters("brand");
        case "model":
          return tFilters("model");
        case "location_city":
          return tHomeSearch("locationOption");
        case "price_eur":
          return tFilters("priceTitle");
        case "mileage_km":
          return tFilters("mileageTitle");
        case "year":
          return tFilters("yearTitle");
        case "power_kw":
          return tFilters("powerTitle");
        case "fuel":
          return tFilters("fuelTitle");
        case "transmission":
          return tFilters("transmissionTitle");
        case "body_style":
          return tFilters("bodyTypeTitle");
        case "has_service_book":
          return tFilters("serviceBook");
        case "not_crashed":
          return tFilters("notCrashed");
        case "is_bought_in_sk":
          return tFilters("boughtInSK");
        case "is_vat_deductible":
          return tFilters("vatDeductible");
        default:
          return attribute;
      }
    },
    [tFilters, tHomeSearch],
  );

  const formatFilterValue = useMemo(
    () => (attribute: string, label: string) => {
      const normalizedLabel = label.trim();

      if (normalizedLabel.toLowerCase() === "true") {
        return formatFilterTitle(attribute);
      }

      switch (attribute) {
        case "fuel":
          return (
            tFuel(
              normalizedLabel.toLowerCase() as Parameters<typeof tFuel>[0],
            ) || normalizedLabel
          );
        case "transmission":
          return (
            tTransmission(
              normalizedLabel.toLowerCase() as Parameters<
                typeof tTransmission
              >[0],
            ) || normalizedLabel
          );
        case "body_style":
          return (
            tBodyType(
              normalizedLabel.toLowerCase() as Parameters<typeof tBodyType>[0],
            ) || normalizedLabel
          );
        default:
          return normalizedLabel;
      }
    },
    [formatFilterTitle, tBodyType, tFuel, tTransmission],
  );

  const activeBrandLabels = useMemo(() => {
    const brandGroup = activeRefinementGroups.find(
      (group) => group.attribute === "brand",
    );
    if (!brandGroup) {
      return [];
    }

    return brandGroup.refinements.reduce<string[]>((labels, refinement) => {
      if (refinement.label.trim().length > 0) {
        labels.push(refinement.label);
      }
      return labels;
    }, []);
  }, [activeRefinementGroups]);

  const totalActiveFilters = useMemo(
    () =>
      activeRefinementGroups.reduce(
        (count, group) => count + group.refinements.length,
        0,
      ),
    [activeRefinementGroups],
  );

  const activeFilterPills = useMemo(() => {
    return activeRefinementGroups
      .filter((group) => !["brand", "model"].includes(group.attribute))
      .flatMap((group) =>
        group.refinements.map((refinement, index) => {
          const baseLabel = formatFilterValue(
            group.attribute,
            refinement.label,
          );
          const titleLabel = formatFilterTitle(group.attribute);
          const needsTitlePrefix = ![
            "brand",
            "model",
            "location_city",
          ].includes(group.attribute);
          const shouldPrefix = needsTitlePrefix && baseLabel !== titleLabel;

          return {
            key: `${group.attribute}-${index}-${refinement.label}`,
            label: shouldPrefix ? `${titleLabel}: ${baseLabel}` : baseLabel,
            onRemove: () => refineCurrent(refinement),
          };
        }),
      );
  }, [
    activeRefinementGroups,
    formatFilterTitle,
    formatFilterValue,
    refineCurrent,
  ]);

  return (
    <div className="space-y-3">
      <ResultsCountCta
        totalActiveFilters={totalActiveFilters}
        canClearFilters={canClearFilters}
        clearFilters={clearFilters}
        activeFilterPills={activeFilterPills}
      />

      {activeBrandLabels.length > 0 ? (
        <SelectedBrandCards selectedBrandLabels={activeBrandLabels} />
      ) : null}

      <FilterSection title={tFilters("brand")}>
        <AllBrandsRefinementList
          idScope={idScope}
          selectedBrandLabels={activeBrandLabels}
        />
      </FilterSection>

      <FilterSection title={tFilters("model")}>
        {activeBrandLabels.length > 0 ? (
          <CustomRefinementList
            attribute="model"
            idScope={idScope}
            emptyLabel={tHomeSearch("selectBrandFirst")}
          />
        ) : (
          <p className="py-1 text-sm text-text-muted">
            {tHomeSearch("selectBrandFirst")}
          </p>
        )}
      </FilterSection>

      <RefinementFilterSection
        attribute="fuel"
        idScope={idScope}
        title={tFilters("fuelTitle")}
        labelFormatter={(value) =>
          tFuel(value.toLowerCase() as Parameters<typeof tFuel>[0]) || value
        }
      />

      <FilterSection title={tFilters("priceTitle")}>
        <PriceRangeInput attribute="price_eur" idScope={idScope} />
      </FilterSection>

      <FilterSection title={tFilters("mileageTitle")}>
        <CustomRangeInput attribute="mileage_km" idScope={idScope} />
      </FilterSection>

      <FilterSection title={tFilters("yearTitle")}>
        <CustomRangeInput attribute="year" idScope={idScope} />
      </FilterSection>

      <FilterSection title={tFilters("powerTitle")}>
        <CustomRangeInput attribute="power_kw" idScope={idScope} />
      </FilterSection>

      <RefinementFilterSection
        attribute="location_city"
        idScope={idScope}
        title={tHomeSearch("locationOption")}
      />

      <RefinementFilterSection
        attribute="transmission"
        idScope={idScope}
        title={tFilters("transmissionTitle")}
        labelFormatter={(value) =>
          tTransmission(
            value.toLowerCase() as Parameters<typeof tTransmission>[0],
          ) || value
        }
      />

      <RefinementFilterSection
        attribute="body_style"
        idScope={idScope}
        title={tFilters("bodyTypeTitle")}
        labelFormatter={(value) =>
          tBodyType(value.toLowerCase() as Parameters<typeof tBodyType>[0]) ||
          value
        }
      />

      <FilterSection title={tFilters("other")} collapsible defaultOpen={false}>
        <div className="space-y-2">
          <CustomToggle
            attribute="has_service_book"
            label={tFilters("serviceBook")}
          />
          <CustomToggle
            attribute="not_crashed"
            label={tFilters("notCrashed")}
          />
          <CustomToggle
            attribute="is_bought_in_sk"
            label={tFilters("boughtInSK")}
          />
          <CustomToggle
            attribute="is_vat_deductible"
            label={tFilters("vatDeductible")}
          />
        </div>
      </FilterSection>
    </div>
  );
}

function FilterSection({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen || !collapsible);

  if (!collapsible) {
    return (
      <section className="border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">
          {title}
        </h3>
        {children}
      </section>
    );
  }

  return (
    <section className="border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        className="flex min-h-9 w-full items-center justify-between rounded-lg px-0.5 text-left text-sm font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span>{title}</span>
        <ChevronDownIcon
          className={cn(
            "size-4 text-text-muted transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all",
          isOpen ? "mt-2 max-h-[1400px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function ResultsCountCta({
  totalActiveFilters,
  canClearFilters,
  clearFilters,
  activeFilterPills,
}: {
  totalActiveFilters: number;
  canClearFilters: boolean;
  clearFilters: () => void;
  activeFilterPills: Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }>;
}) {
  const tFilters = useTranslations("filters");
  const tSearchPage = useTranslations("searchPage");
  const locale = useLocale();
  const { nbHits } = useStats();
  const formattedCount = nbHits.toLocaleString(locale);

  return (
    <section className="rounded-lg border border-border-subtle bg-background-muted/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">
            {formattedCount}
          </span>{" "}
          {tSearchPage(getResultCountMessageKey(nbHits))}
          {totalActiveFilters > 0 ? (
            <span className="text-text-muted">
              {" · "}
              {tSearchPage("activeFiltersLabel")} {totalActiveFilters}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!canClearFilters}
          className={cn(
            "shrink-0 rounded-md px-2 py-1.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            canClearFilters
              ? "text-primary underline decoration-primary/35 underline-offset-2 hover:text-accent"
              : "cursor-not-allowed text-text-muted",
          )}
        >
          {tFilters("clearAll")}
        </button>
      </div>
      {activeFilterPills.length > 0 ? (
        <ul
          className="mt-2.5 flex flex-wrap gap-1.5"
          aria-label={tSearchPage("activeFiltersLabel")}
        >
          {activeFilterPills.map((pill) => (
            <li key={pill.key}>
              <button
                type="button"
                onClick={pill.onRemove}
                aria-label={`${tFilters("clear")} ${pill.label}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary/15 bg-background-secondary px-2 py-1 text-xs font-semibold text-text-secondary transition-colors hover:border-accent/35 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="max-w-[13rem] truncate">{pill.label}</span>
                <XIcon
                  className="size-3.5 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SelectedBrandCards({
  selectedBrandLabels,
}: {
  selectedBrandLabels: string[];
}) {
  const { brandNames, modelsByBrandName } = usePublicVehicleTaxonomy();
  const tFilters = useTranslations("filters");
  const tHomeSearch = useTranslations("homeSearch");
  const { refine: refineBrand } = useRefinementList({
    attribute: "brand",
    limit: 100,
    sortBy: ["count:desc", "name:asc"],
  });
  const { items: modelItems, refine: refineModel } = useRefinementList({
    attribute: "model",
    limit: 100,
    sortBy: ["count:desc", "name:asc"],
  });
  const normalizedModelMap = useMemo(
    () =>
      new Map(
        modelItems.map(
          (item) => [normalizeComparableText(item.label), item] as const,
        ),
      ),
    [modelItems],
  );

  return (
    <section className="rounded-lg border border-accent/20 bg-accent/[0.04] p-3">
      <h3 className="mb-2 text-sm font-semibold text-text-primary">
        {tFilters("selectedBrandsTitle")}
      </h3>
      <div className="space-y-2">
        {selectedBrandLabels.map((brand) => {
          const knownModels = getKnownModelsForBrand(
            brand,
            brandNames,
            modelsByBrandName,
          );
          const selectedKnownModel =
            knownModels.find(
              (model) =>
                normalizedModelMap.get(normalizeComparableText(model))
                  ?.isRefined,
            ) ?? "";

          return (
            <article
              key={brand}
              className="rounded-lg border border-border-subtle bg-background-secondary p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold text-text-primary">
                  {brand}
                </p>
                <button
                  type="button"
                  onClick={() => refineBrand(brand)}
                  className="market-icon-button flex size-8 min-h-8 min-w-8 items-center justify-center rounded-md text-text-secondary hover:text-text-primary"
                  aria-label={`${tHomeSearch("clearSelectedBrand")}: ${brand}`}
                >
                  <XIcon className="size-3.5" aria-hidden="true" />
                </button>
              </div>

              {knownModels.length > 0 ? (
                <>
                  <select
                    aria-label={`${tFilters("model")}: ${brand}`}
                    value={selectedKnownModel}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (
                        selectedKnownModel &&
                        selectedKnownModel !== nextValue
                      ) {
                        refineModel(selectedKnownModel);
                      }
                      if (nextValue && nextValue !== selectedKnownModel) {
                        refineModel(nextValue);
                      }
                    }}
                    className="market-field mt-2 h-10 w-full px-2.5 text-sm font-semibold text-text-primary"
                  >
                    <option value="">
                      {tFilters("modelPickerPlaceholder")}
                    </option>
                    {knownModels.map((modelName) => {
                      const matchingItem = normalizedModelMap.get(
                        normalizeComparableText(modelName),
                      );

                      return (
                        <option key={`${brand}-${modelName}`} value={modelName}>
                          {matchingItem
                            ? `${modelName} (${matchingItem.count})`
                            : modelName}
                        </option>
                      );
                    })}
                  </select>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {knownModels.slice(0, 4).map((modelName) => {
                      const matchingItem = normalizedModelMap.get(
                        normalizeComparableText(modelName),
                      );
                      const isActive = Boolean(matchingItem?.isRefined);

                      return (
                        <button
                          key={`${brand}-${modelName}`}
                          type="button"
                          onClick={() => refineModel(modelName)}
                          aria-pressed={isActive}
                          className={cn(
                            "min-h-8 rounded-md border px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                            isActive
                              ? "border-accent/40 bg-accent/10 text-accent"
                              : "border-border-subtle bg-background-secondary text-text-secondary hover:border-accent/35 hover:text-accent",
                          )}
                        >
                          {modelName}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-text-muted">
                  {tFilters("modelPickerUnavailable")}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function rangesMatch(
  start: [number | undefined, number | undefined],
  preset: RangePreset,
) {
  const [currentMin, currentMax] = start;
  const normalizedMin =
    typeof currentMin === "number" && Number.isFinite(currentMin)
      ? Math.round(currentMin)
      : undefined;
  const normalizedMax =
    typeof currentMax === "number" && Number.isFinite(currentMax)
      ? Math.round(currentMax)
      : undefined;

  return normalizedMin === preset.min && normalizedMax === preset.max;
}

function RangePresetInput({
  attribute,
  presets,
  idScope,
}: {
  attribute: string;
  presets: RangePreset[];
  idScope: string;
}) {
  const tFilters = useTranslations("filters");
  const { canRefine, refine, start } = useRange({ attribute });
  const minDefaultValue =
    typeof start[0] === "number" && Number.isFinite(start[0])
      ? String(Math.round(start[0]))
      : "";
  const maxDefaultValue =
    typeof start[1] === "number" && Number.isFinite(start[1])
      ? String(Math.round(start[1]))
      : "";

  const submitRange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rawMin = String(formData.get(`${attribute}-range-min`) || "").trim();
    const rawMax = String(formData.get(`${attribute}-range-max`) || "").trim();
    const nextMin = rawMin ? Number.parseInt(rawMin, 10) : undefined;
    const nextMax = rawMax ? Number.parseInt(rawMax, 10) : undefined;

    refine([
      Number.isFinite(nextMin) ? nextMin : undefined,
      Number.isFinite(nextMax) ? nextMax : undefined,
    ]);
  };

  return (
    <div className="space-y-2">
      {presets.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {presets.map((preset) => {
            const isActive = rangesMatch(start, preset);

            return (
              <button
                key={preset.key}
                type="button"
                disabled={!canRefine}
                onClick={() => refine([preset.min, preset.max])}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  isActive
                    ? "border-accent/35 bg-accent/8 text-text-primary"
                    : "border-border-subtle bg-background-secondary text-text-secondary hover:border-accent/35 hover:text-text-primary",
                  !canRefine && "cursor-not-allowed opacity-55",
                )}
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isActive
                      ? "border-accent bg-accent"
                      : "border-border-strong bg-background",
                  )}
                  aria-hidden="true"
                >
                  {isActive ? (
                    <span className="size-1 rounded-full bg-white" />
                  ) : null}
                </span>
                <span className="min-w-0 truncate font-medium">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <form
        key={`${attribute}:${minDefaultValue}:${maxDefaultValue}`}
        onSubmit={submitRange}
        className="rounded-lg border border-border-subtle bg-background-secondary p-2"
      >
        <div className="grid grid-cols-2 gap-1.5">
          <input
            id={`${idScope}-${attribute}-range-min`}
            name={`${attribute}-range-min`}
            type="number"
            inputMode="numeric"
            defaultValue={minDefaultValue}
            placeholder={tFilters("from")}
            aria-label={tFilters("from")}
            className="market-field w-full px-2.5 py-2 text-sm text-text-primary placeholder:text-text-muted"
          />
          <input
            id={`${idScope}-${attribute}-range-max`}
            name={`${attribute}-range-max`}
            type="number"
            inputMode="numeric"
            defaultValue={maxDefaultValue}
            placeholder={tFilters("to")}
            aria-label={tFilters("to")}
            className="market-field w-full px-2.5 py-2 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>
        <button
          type="submit"
          className="market-action-secondary mt-1.5 w-full px-3 py-2 text-sm"
        >
          {tFilters("apply")}
        </button>
      </form>
    </div>
  );
}

export function PriceRangeInput({
  attribute,
  idScope = "filters",
}: {
  attribute: string;
  idScope?: string;
}) {
  const locale = useLocale();
  const tFilters = useTranslations("filters");
  const presets = useMemo<RangePreset[]>(
    () =>
      [
        5000, 7500, 10000, 12500, 15000, 20000, 25000, 30000, 35000, 50000,
        75000, 100000,
      ].map((price) => ({
        key: `price-${price}`,
        label: tFilters("upToLabel", {
          value: `${price.toLocaleString(locale)} EUR`,
        }),
        max: price,
      })),
    [locale, tFilters],
  );

  return (
    <RangePresetInput
      attribute={attribute}
      idScope={idScope}
      presets={presets}
    />
  );
}

function CustomRangeInput({
  attribute,
  idScope,
}: {
  attribute: string;
  idScope: string;
}) {
  const locale = useLocale();
  const tFilters = useTranslations("filters");
  const currentYear = new Date().getFullYear();
  const presets = useMemo<RangePreset[]>(() => {
    if (attribute === "mileage_km") {
      return [
        50000, 75000, 100000, 125000, 150000, 175000, 200000, 250000, 300000,
        400000,
      ].map((mileage) => ({
        key: `mileage-${mileage}`,
        label: tFilters("upToLabel", {
          value: `${mileage.toLocaleString(locale)} km`,
        }),
        max: mileage,
      }));
    }

    if (attribute === "year") {
      return [1, 3, 5, 8, 10, 15, 20].map((years) => ({
        key: `year-${years}`,
        label: tFilters("newerThanLabel", {
          value: String(currentYear - years),
        }),
        min: currentYear - years,
      }));
    }

    if (attribute === "power_kw") {
      return [50, 75, 100, 120, 150, 200, 250, 300].map((power) => ({
        key: `power-${power}`,
        label: tFilters("upToLabel", {
          value: `${power.toLocaleString(locale)} kW`,
        }),
        max: power,
      }));
    }

    return [];
  }, [attribute, currentYear, locale, tFilters]);

  return (
    <RangePresetInput
      attribute={attribute}
      idScope={idScope}
      presets={presets}
    />
  );
}

function CustomToggle({
  attribute,
  label,
}: {
  attribute: string;
  label: string;
}) {
  return (
    <ToggleRefinement
      attribute={attribute}
      label={label}
      classNames={{
        root: "",
        label:
          "group flex min-h-9 w-full cursor-pointer items-center gap-2 py-1",
        checkbox:
          "size-4 rounded border-2 border-border-strong text-primary focus:ring-accent focus:ring-offset-0 transition-colors",
        labelText:
          "text-sm text-text-secondary group-hover:text-text-primary transition-colors",
      }}
    />
  );
}

function AllBrandsRefinementList({
  idScope,
  selectedBrandLabels,
}: {
  idScope: string;
  selectedBrandLabels: string[];
}) {
  const { brandNames } = usePublicVehicleTaxonomy();
  const tSearch = useTranslations("search");
  const tHomeSearch = useTranslations("homeSearch");
  const { items: currentItems, refine } = useRefinementList({
    attribute: "brand",
    limit: 100,
    sortBy: ["count:desc", "name:asc"],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const catalogBrandItems = useMemo<RefinementOption[]>(
    () =>
      brandNames.map((brandName) => ({
        value: brandName,
        label: brandName,
        count: 0,
        isRefined: false,
      })),
    [brandNames],
  );
  const mergedItems = useMemo(
    () =>
      getVisibleBrandRefinementOptions(
        catalogBrandItems,
        currentItems,
        selectedBrandLabels,
        searchQuery,
      ),
    [catalogBrandItems, currentItems, searchQuery, selectedBrandLabels],
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          id={`${idScope}-brand-filter-search`}
          name="brand-filter-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label={tSearch("brand")}
          placeholder={tSearch("brand")}
          className="market-field w-full py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted"
        />
      </div>
      <div className="max-h-72 overflow-y-auto pr-1">
        <ul className="space-y-1">
          {mergedItems.map((item) => (
            <li key={item.value}>
              <RefinementToggleButton
                item={item}
                prefix={`${idScope}-brand-filter`}
                label={item.label}
                onToggle={() => refine(item.value)}
              />
            </li>
          ))}
          {mergedItems.length === 0 ? (
            <li className="py-3 text-center text-sm text-text-muted">
              {tHomeSearch("noResults")}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function CustomRefinementList({
  attribute,
  idScope,
  labelFormatter,
  emptyLabel,
}: {
  attribute: string;
  idScope: string;
  labelFormatter?: (value: string) => string;
  emptyLabel?: string | null;
}) {
  const tHomeSearch = useTranslations("homeSearch");
  const { items, refine } = useRefinementList({
    attribute,
    limit: 100,
    sortBy: ["count:desc", "name:asc"],
  });

  if (items.length === 0) {
    return (
      <p className="py-2 text-sm text-text-muted">
        {emptyLabel ?? tHomeSearch("noResults")}
      </p>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto pr-1">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.value}>
            <RefinementToggleButton
              item={item}
              prefix={`${idScope}-${attribute}-filter`}
              label={labelFormatter ? labelFormatter(item.label) : item.label}
              onToggle={() => refine(item.value)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RefinementFilterSection({
  attribute,
  idScope,
  title,
  labelFormatter,
  collapsible = true,
}: {
  attribute: string;
  idScope: string;
  title: string;
  labelFormatter?: (value: string) => string;
  collapsible?: boolean;
}) {
  const { items, refine } = useRefinementList({
    attribute,
    limit: 100,
    sortBy: ["count:desc", "name:asc"],
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <FilterSection title={title} collapsible={collapsible}>
      <div className="max-h-64 overflow-y-auto pr-1">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.value}>
              <RefinementToggleButton
                item={item}
                prefix={`${idScope}-${attribute}-filter`}
                label={labelFormatter ? labelFormatter(item.label) : item.label}
                onToggle={() => refine(item.value)}
              />
            </li>
          ))}
        </ul>
      </div>
    </FilterSection>
  );
}
