import { useTranslations } from "next-intl";
import type { WizardStepProps, AdFormData } from "@/types/wizard";

type CategoryOption = {
  id: AdFormData["category"];
  labelKey: string;
  descKey: string;
};

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    id: "personal",
    labelKey: "personalCars",
    descKey: "personalCarsDesc",
  },
  {
    id: "commercial",
    labelKey: "commercial",
    descKey: "commercialDesc",
  },
  {
    id: "moto",
    labelKey: "motorcycles",
    descKey: "motorcyclesDesc",
  },
];

function CategoryGlyph({ categoryId }: { categoryId: CategoryOption["id"] }) {
  if (categoryId === "commercial") {
    return (
      <svg className="size-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M3 9h14l2 3v5h-2a2 2 0 11-4 0H9a2 2 0 11-4 0H3V9zM6 17h8M19 12h2"
        />
      </svg>
    );
  }

  if (categoryId === "moto") {
    return (
      <svg className="size-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M5 14h4l2-3h3l2 3h3M7 17a2 2 0 11-4 0 2 2 0 014 0zm14 0a2 2 0 11-4 0 2 2 0 014 0zM10 11l1-3h2"
        />
      </svg>
    );
  }

  return (
    <svg className="size-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 13h16l-1.5-4.5A2 2 0 0016.6 7H7.4a2 2 0 00-1.9 1.5L4 13zm2 0v2m12-2v2M8 17a2 2 0 11-4 0 2 2 0 014 0zm12 0a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

export function Step1Category({
  formData,
  updateFormData,
  errors,
}: WizardStepProps) {
  const t = useTranslations("addListing");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-xl font-semibold text-primary">{t("selectCategory")}</h2>
        <p className="text-secondary">{t("whatVehicleType")}</p>
      </div>

      <fieldset
        className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"
        aria-describedby={errors.category ? "listing-category-error" : undefined}
      >
        <legend className="sr-only">{t("selectCategory")}</legend>
        {CATEGORY_OPTIONS.map((category) => (
          <button
            key={category.id}
            type="button"
            role="radio"
            aria-label={t(category.labelKey)}
            aria-checked={formData.category === category.id}
            data-testid={`listing-category-${category.id}`}
            onClick={() => updateFormData("category", category.id)}
            className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all sm:flex-col sm:gap-3 sm:p-6 sm:text-center ${
              formData.category === category.id
                ? "border-accent bg-accent/5"
                : "border-border hover:border-accent/30 hover:bg-surface"
            }`}
          >
            <div className="rounded-xl border border-border-subtle bg-background-muted p-3 text-accent">
              <CategoryGlyph categoryId={category.id} />
            </div>
            <div className="min-w-0 sm:text-center">
              <p className="font-semibold text-primary">{t(category.labelKey)}</p>
              <p className="mt-1 text-sm text-secondary">{t(category.descKey)}</p>
            </div>
          </button>
        ))}
      </fieldset>

      {errors.category && <p id="listing-category-error" className="text-sm text-error">{errors.category}</p>}
    </div>
  );
}
