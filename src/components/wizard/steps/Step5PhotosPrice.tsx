import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { WizardStepProps } from "@/types/wizard";
import { FormField } from "@/components/ui/FormField";
import { CameraIcon } from "@/components/ui/Icons";
import { LISTING_LIMITS } from "@/lib/validation/listings";
import type { ListingActionOperation } from "@/lib/pricing/config";

interface ListingSubmitOption {
  operation: ListingActionOperation;
  label: string;
  priceLabel: string;
  description: string;
}

interface Step5Props extends WizardStepProps {
  handlePhotoUpload: (files: FileList | File[]) => void;
  removePhoto: (index: number) => void;
  equipmentOptions: { groupKey: string; items: string[] }[];
  toggleEquipment: (item: string) => void;
  showPublishPrice?: boolean;
  submitOptions?: ListingSubmitOption[];
  selectedOperation?: ListingActionOperation;
  onSelectOperation?: (operation: ListingActionOperation) => void;
}

const EMPTY_SUBMIT_OPTIONS: ListingSubmitOption[] = [];

export function Step5PhotosPrice({
  formData,
  updateFormData,
  errors,
  handlePhotoUpload,
  removePhoto,
  equipmentOptions,
  toggleEquipment,
  showPublishPrice = true,
  submitOptions = EMPTY_SUBMIT_OPTIONS,
  selectedOperation = "publish_basic",
  onSelectOperation,
}: Step5Props) {
  const locale = useLocale();
  const localeTag = locale;
  const t = useTranslations("addListing");
  const tEquipment = useTranslations("equipment");
  const sectionClass =
    "rounded-2xl border border-border bg-background-secondary p-5 sm:p-7";

  return (
    <div className="space-y-6">
      {/* Photos */}
      <section className={sectionClass} aria-labelledby="listing-photos-heading">
        <h2 id="listing-photos-heading" className="mb-2 text-xl font-semibold text-primary">
          {t("photos")}
        </h2>
        <p className="text-secondary mb-4">{t("photosSubtitle")}</p>
        <ul className="mb-4 space-y-1 rounded-xl border border-primary/10 bg-primary/5 p-3 text-xs leading-5 text-secondary">
          <li>{t("photoQualityGuidance")}</li>
          <li>{t("photoWatermarkGuidance")}</li>
        </ul>

        {errors.photos && (
          <p className="mb-4 text-sm text-error">{errors.photos}</p>
        )}

        {formData.photoUrls.length < LISTING_LIMITS.maxPhotos && (
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handlePhotoUpload(event.dataTransfer.files);
            }}
            className="mb-4 flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5 px-6 py-8 text-center text-primary transition-colors hover:border-accent hover:bg-accent/10 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-sm">
              <CameraIcon className="size-7" />
            </span>
            <span className="text-base font-semibold">{t("uploadPhotos")}</span>
            <span className="text-sm text-secondary">{t("dragOrClick")}</span>
            <span className="text-xs text-secondary">{t("maxPhotos")}</span>
            <input
              type="file"
              data-testid="listing-photo-upload"
              accept="image/*"
              multiple
              onChange={(event) => {
                if (event.currentTarget.files) {
                  handlePhotoUpload(event.currentTarget.files);
                }
                event.currentTarget.value = "";
              }}
              className="sr-only"
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {formData.photoUrls.map((url, index) => (
            <div
              key={url}
              className="relative aspect-[4/3] rounded-xl overflow-hidden border border-border group"
            >
              <Image
                src={url}
                alt={t("vehiclePhotoAlt", { index: index + 1 })}
                fill
                sizes="(max-width: 768px) 33vw, 20vw"
                className="object-contain bg-background-muted"
              />
              <button
                type="button"
                data-testid={`listing-photo-remove-${index}`}
                aria-label={t("removePhoto", { index: index + 1 })}
                onClick={() => removePhoto(index)}
                className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-error text-white shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              >
                ×
              </button>
              {index === 0 && (
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs">
                  {t("mainPhoto")}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Equipment */}
      <section className={sectionClass} aria-labelledby="listing-equipment-heading">
        <h2 id="listing-equipment-heading" className="mb-2 text-xl font-semibold text-primary">
          {t("equipment")}
        </h2>
        <p className="text-secondary mb-4">{t("equipmentSubtitle")}</p>

        <div className="space-y-4">
          {equipmentOptions.map((group) => (
            <div key={group.groupKey}>
              <p className="text-sm font-medium text-secondary mb-2">
                {t(group.groupKey)}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={formData.equipment.includes(item)}
                    onClick={() => toggleEquipment(item)}
                    className={`rounded-full px-4 py-2 text-base font-medium transition-all active:scale-[0.98] ${
                      formData.equipment.includes(item)
                        ? "bg-accent text-white"
                        : "bg-surface text-primary hover:bg-surface-hover"
                    }`}
                  >
                    {tEquipment(item)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Price */}
      <section className={sectionClass} aria-labelledby="listing-price-heading">
        <h2 id="listing-price-heading" className="mb-2 text-xl font-semibold text-primary">
          {t("price")}
        </h2>

        <FormField label={t("sellingPrice")} required error={errors.price_eur}>
          <div className="relative">
            <input
              type="number"
              data-testid="listing-price"
              value={formData.price_eur}
              onChange={(e) =>
                updateFormData("price_eur", parseInt(e.target.value) || "")
              }
              placeholder="0"
              min={LISTING_LIMITS.priceMin}
              max={LISTING_LIMITS.priceMax}
              className="form-input pr-12 text-xl font-bold"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary font-bold">
              €
            </span>
          </div>
        </FormField>
      </section>

      {showPublishPrice && (
        <section className={sectionClass} aria-labelledby="listing-publication-heading">
          <h2
            id="listing-publication-heading"
            className="mb-2 text-xl font-semibold text-primary"
          >
            {t("publishChoice")}
          </h2>
          <p className="mb-4 text-secondary">{t("publishHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {submitOptions.map((option) => {
              const isActive = selectedOperation === option.operation;

              return (
                <button
                  key={option.operation}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSelectOperation?.(option.operation)}
                  className={`min-h-40 rounded-2xl border-2 p-5 text-left transition-all active:translate-y-0.5 active:scale-[0.99] ${
                    isActive
                      ? "border-accent bg-accent/10 shadow-sm"
                      : "border-border bg-background hover:border-accent/50"
                  }`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-lg font-bold text-primary">{option.label}</span>
                    {isActive ? (
                      <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
                        {t("selectedOption")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-3 block font-bold text-accent">
                    {option.priceLabel}
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-secondary">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Summary Card */}
      <section className="rounded-2xl border border-border bg-surface p-6" aria-labelledby="listing-summary-heading">
        <h3 id="listing-summary-heading" className="mb-4 font-semibold text-primary">{t("summary")}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-secondary">{t("vehicle")}:</span>
            <span className="font-medium text-primary">
              {formData.brand} {formData.model} {formData.generation}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">{t("year")}:</span>
            <span className="font-medium text-primary">
              {formData.year || "-"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">{t("kilometers")}:</span>
            <span className="font-medium text-primary">
              {formData.mileage_km
                ? `${Number(formData.mileage_km).toLocaleString(localeTag)} km`
                : "-"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">{t("photos")}:</span>
            <span className="font-medium text-primary" data-testid="listing-photo-count">
              {formData.photoUrls.length}
            </span>
          </div>
          <hr className="border-border my-3" />
          <div className="flex justify-between text-lg">
            <span className="font-semibold text-primary">{t("price")}:</span>
            <span className="font-bold text-accent">
              {formData.price_eur
                ? `${Number(formData.price_eur).toLocaleString(localeTag)} €`
                : "-"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
