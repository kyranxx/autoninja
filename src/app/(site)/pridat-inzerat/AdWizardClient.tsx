"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMarketCode } from "@/context/MarketContext";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocale, useTranslations } from "next-intl";
import { uploadImageToCloudflare } from "@/utils/upload";
import { AdFormData } from "@/types/wizard";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { createCsrfHeaders } from "@/lib/security/client-csrf";
import {
  LockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/ui/Icons";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ModerationEmailPreference } from "@/components/account/ModerationEmailPreference";
import {
  INITIAL_FORM_DATA,
  EQUIPMENT_OPTIONS,
  STEPS,
} from "@/components/wizard/constants";
import { WizardProgress } from "@/components/wizard/WizardProgress";
import { Step1Category } from "@/components/wizard/steps/Step1Category";
import { Step2Vehicle } from "@/components/wizard/steps/Step2Vehicle";
import { Step3Technical } from "@/components/wizard/steps/Step3Technical";
import { Step4Details } from "@/components/wizard/steps/Step4Details";
import { Step5PhotosPrice } from "@/components/wizard/steps/Step5PhotosPrice";
import { usePublicVehicleTaxonomy } from "@/lib/vehicle-taxonomy/client";
import type { VehicleTaxonomy } from "@/lib/vehicle-taxonomy/types";
import { LISTING_LIMITS, listingMutationSchema } from "@/lib/validation/listings";
import type { DecodedListingVinData } from "@/lib/vin/decode";
import type { ListingActionOperation } from "@/lib/pricing/config";

type AdWizardMode = "create" | "edit";
type WizardErrors = Record<string, string>;
const LISTING_DRAFT_STORAGE_PREFIX = "ab123_listing_draft_v1";
const LISTING_DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function getAdWizardInlineCopy(locale: string) {
  if (locale.toLowerCase().startsWith("ro")) {
    return {
      localeTag: "ro-RO" as const,
      editTitle: "Editează anunțul",
      editSubtitle: "Actualizează datele vehiculului fără să creezi un anunț nou.",
      draftFound: "Am găsit un anunț în lucru.",
      draftLastSaved: (savedAt: string) =>
        `Ultima salvare: ${savedAt}. Vrei să continui de unde ai rămas?`,
      resumeDraft: "Reia anunțul în lucru",
      startOver: "Începe din nou",
      basicPrice: "Gratuit / 28 de zile",
      basicDescription: "Publicare obișnuită a anunțului.",
      premiumPrice: "4,99 € / 28 de zile",
      premiumDescription: "Promovat deasupra anunțurilor obișnuite.",
      topPrice: "9,99 € / 28 de zile",
      topDescription: "Homepage și primul bloc în rezultate pe prima pagină.",
    };
  }

  return {
    localeTag: "sk-SK" as const,
    editTitle: "Upraviť inzerát",
    editSubtitle: "Aktualizujte údaje o vozidle bez vytvárania nového inzerátu.",
    draftFound: "Našli sme rozpracovaný inzerát.",
    draftLastSaved: (savedAt: string) =>
      `Posledné uloženie: ${savedAt}. Chcete pokračovať tam, kde ste skončili?`,
    resumeDraft: "Obnoviť rozpracovaný inzerát",
    startOver: "Začať odznova",
    basicPrice: "Zadarmo / 28 dní",
    basicDescription: "Bežné zverejnenie inzerátu.",
    premiumPrice: "4,99 € / 28 dní",
    premiumDescription: "Zvýraznené nad bežnými inzerátmi.",
    topPrice: "9,99 € / 28 dní",
    topDescription: "Homepage a prvý blok vo výsledkoch na 1. strane.",
  };
}

interface AdWizardClientProps {
  mode?: AdWizardMode;
  adId?: string;
  embedded?: boolean;
  vinDecodingEnabled?: boolean;
}

interface WizardState {
  currentStep: number;
  formData: AdFormData;
  errors: WizardErrors;
  isSubmitting: boolean;
  isAdLoading: boolean;
  loadError: string | null;
  photoFilesByUrl: Record<string, File>;
}

interface ListingDraftPayload {
  savedAt: string;
  currentStep: number;
  formData: AdFormData;
}

async function loadListingPricingSummary(): Promise<{
  basic?: string;
  premium?: string;
  top?: string;
} | null> {
  const response = await fetch("/api/pricing/config", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | {
        summary?: {
          basic?: string;
          premium?: string;
          top?: string;
        };
      }
    | null;

  return response.ok ? (payload?.summary ?? null) : null;
}

type WizardAction =
  | { type: "setStep"; step: number }
  | { type: "nextStep" }
  | { type: "previousStep" }
  | { type: "setErrors"; errors: WizardErrors }
  | { type: "setSubmitting"; isSubmitting: boolean }
  | { type: "setSubmitError"; message: string }
  | { type: "hydrateFromDraft"; formData: AdFormData; currentStep: number }
  | { type: "startAdLoad" }
  | { type: "failAdLoad"; message: string }
  | { type: "hydrateFromAd"; formData: AdFormData }
  | {
      type: "updateField";
      key: keyof AdFormData;
      value: AdFormData[keyof AdFormData];
    }
  | {
      type: "applyFormPatch";
      patch: Partial<AdFormData>;
    }
  | {
      type: "appendPhotos";
      newUrls: string[];
      filesByUrl: Record<string, File>;
    }
  | { type: "removePhoto"; index: number; url: string }
  | { type: "toggleEquipment"; item: string };

function createInitialWizardState(isEditMode: boolean): WizardState {
  return {
    currentStep: 1,
    formData: INITIAL_FORM_DATA,
    errors: {},
    isSubmitting: false,
    isAdLoading: isEditMode,
    loadError: null,
    photoFilesByUrl: {},
  };
}

function getDraftStorageKey(userId: string): string {
  return `${LISTING_DRAFT_STORAGE_PREFIX}:${userId}`;
}

function hasMeaningfulDraftData(formData: AdFormData): boolean {
  return Boolean(
    formData.brand ||
      formData.model ||
      formData.year ||
      formData.price_eur ||
      formData.mileage_km ||
      formData.location_city ||
      formData.description.trim() ||
      formData.photoUrls.length > 0,
  );
}

function parseListingDraftPayload(raw: string | null): ListingDraftPayload | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ListingDraftPayload>;
    if (
      typeof parsed?.savedAt !== "string" ||
      typeof parsed?.currentStep !== "number" ||
      !parsed?.formData
    ) {
      return null;
    }

    const savedAtMs = Date.parse(parsed.savedAt);
    if (Number.isNaN(savedAtMs)) {
      return null;
    }

    if (Date.now() - savedAtMs > LISTING_DRAFT_TTL_MS) {
      return null;
    }

    const mergedFormData: AdFormData = {
      ...INITIAL_FORM_DATA,
      ...parsed.formData,
      photoUrls: Array.isArray(parsed.formData.photoUrls)
        ? parsed.formData.photoUrls.filter(
            (url): url is string =>
              typeof url === "string" && !url.startsWith("blob:"),
          )
        : [],
      equipment: Array.isArray(parsed.formData.equipment)
        ? parsed.formData.equipment.filter((item): item is string => typeof item === "string")
        : [],
    };

    return {
      savedAt: parsed.savedAt,
      currentStep: parsed.currentStep,
      formData: mergedFormData,
    };
  } catch {
    return null;
  }
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "setStep":
      return {
        ...state,
        currentStep: action.step,
      };
    case "nextStep":
      return {
        ...state,
        currentStep: Math.min(state.currentStep + 1, 5),
      };
    case "previousStep":
      return {
        ...state,
        currentStep: Math.max(state.currentStep - 1, 1),
      };
    case "setErrors":
      return {
        ...state,
        errors: action.errors,
      };
    case "setSubmitting":
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
    case "setSubmitError":
      return {
        ...state,
        errors: { ...state.errors, submit: action.message },
      };
    case "hydrateFromDraft":
      return {
        ...state,
        currentStep: Math.min(Math.max(action.currentStep, 1), 5),
        formData: action.formData,
        errors: {},
        isAdLoading: false,
        loadError: null,
        photoFilesByUrl: {},
      };
    case "startAdLoad":
      return {
        ...state,
        isAdLoading: true,
        loadError: null,
      };
    case "failAdLoad":
      return {
        ...state,
        isAdLoading: false,
        loadError: action.message,
      };
    case "hydrateFromAd":
      return {
        ...state,
        currentStep: 1,
        formData: action.formData,
        errors: {},
        isAdLoading: false,
        loadError: null,
        photoFilesByUrl: {},
      };
    case "updateField": {
      const nextErrors = { ...state.errors };
      delete nextErrors[action.key];

      return {
        ...state,
        formData: {
          ...state.formData,
          [action.key]: action.value,
        },
        errors: nextErrors,
      };
    }
    case "applyFormPatch": {
      const nextErrors = { ...state.errors };
      for (const key of Object.keys(action.patch) as Array<keyof AdFormData>) {
        delete nextErrors[key];
      }

      return {
        ...state,
        formData: {
          ...state.formData,
          ...action.patch,
        },
        errors: nextErrors,
      };
    }
    case "appendPhotos":
      return {
        ...state,
        formData: {
          ...state.formData,
          photoUrls: [...state.formData.photoUrls, ...action.newUrls],
        },
        photoFilesByUrl: {
          ...state.photoFilesByUrl,
          ...action.filesByUrl,
        },
      };
    case "removePhoto": {
      const nextPhotoFilesByUrl = { ...state.photoFilesByUrl };
      delete nextPhotoFilesByUrl[action.url];

      return {
        ...state,
        formData: {
          ...state.formData,
          photoUrls: state.formData.photoUrls.filter(
            (_, index) => index !== action.index,
          ),
        },
        photoFilesByUrl: nextPhotoFilesByUrl,
      };
    }
    case "toggleEquipment":
      return {
        ...state,
        formData: {
          ...state.formData,
          equipment: state.formData.equipment.includes(action.item)
            ? state.formData.equipment.filter((item) => item !== action.item)
            : [...state.formData.equipment, action.item],
        },
      };
    default:
      return state;
  }
}

function parseNumber(value: unknown) {
  return typeof value === "number" && !Number.isNaN(value) ? value : "";
}

function normalizeMatchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findMatchingBrandId(taxonomy: VehicleTaxonomy, makeName: string | null): string {
  if (!makeName) {
    return "";
  }

  const normalizedMake = normalizeMatchValue(makeName);
  const exactMatch = taxonomy.brands.find(
    (brand) => normalizeMatchValue(brand.name) === normalizedMake,
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  const partialMatch = taxonomy.brands.find((brand) => {
    const normalizedBrandName = normalizeMatchValue(brand.name);
    return (
      normalizedBrandName.includes(normalizedMake)
      || normalizedMake.includes(normalizedBrandName)
    );
  });

  return partialMatch?.id || "";
}

function findMatchingModelId(
  taxonomy: VehicleTaxonomy,
  brandId: string,
  modelName: string | null,
): string {
  if (!brandId || !modelName) {
    return "";
  }

  const normalizedModel = normalizeMatchValue(modelName);
  const models = taxonomy.modelsByBrandId[brandId] || [];
  const exactMatch = models.find(
    (model) => normalizeMatchValue(model.name) === normalizedModel,
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  const partialMatch = models.find((model) => {
    const normalizedModelName = normalizeMatchValue(model.name);
    return (
      normalizedModelName.includes(normalizedModel)
      || normalizedModel.includes(normalizedModelName)
    );
  });

  return partialMatch?.id || "";
}

function mapAdDataToFormData(
  data: Record<string, unknown>,
  taxonomy: VehicleTaxonomy,
): AdFormData {
  const brandName =
    (data.brands as { name?: string } | null | undefined)?.name ??
    (data.brand as string) ??
    "";
  const modelName =
    (data.models as { name?: string } | null | undefined)?.name ??
    (data.model as string) ??
    "";
  const matchedBrand = taxonomy.brands.find((brand) => brand.name === brandName);
  const mappedBrandId = matchedBrand?.id ?? ((data.brand_id as string) || "");
  const mappedModelId = mappedBrandId
    ? taxonomy.modelsByBrandId[mappedBrandId]?.find(
        (model) => model.name === modelName,
      )?.id ?? ((data.model_id as string) || "")
    : ((data.model_id as string) || "");

  return {
    ...INITIAL_FORM_DATA,
    category: data.body_style === "commercial" ? "commercial" : "personal",
    brand_id: mappedBrandId,
    model_id: mappedModelId,
    brand: brandName,
    model: modelName,
    generation: (data.generation as string) ?? "",
    year: parseNumber(data.year),
    vin: (data.vin as string) ?? "",
    fuel: (data.fuel as string) ?? "",
    transmission: (data.transmission as string) ?? "",
    body_style: (data.body_style as string) ?? "",
    power_kw: parseNumber(data.power_kw),
    engine_volume_cm3: parseNumber(data.engine_volume_cm3),
    mileage_km: parseNumber(data.mileage_km),
    drive_type: (data.drive_type as string) ?? "",
    color: (data.color as string) ?? "",
    is_bought_in_sk: Boolean(data.is_bought_in_sk),
    is_vat_deductible: Boolean(data.is_vat_deductible),
    has_service_book: Boolean(data.has_service_book),
    full_service_history: Boolean(data.full_service_history),
    originality_check: Boolean(data.originality_check),
    garage_kept: Boolean(data.garage_kept),
    not_crashed: Boolean(data.not_crashed),
    is_imported: Boolean(data.is_imported),
    stk_valid_until: (data.warranty_expiration as string) ?? "",
    description: (data.description as string) ?? "",
    location_city: (data.location_city as string) ?? "",
    location_district: (data.location_district as string) ?? "",
    photos: [],
    photoUrls: Array.isArray(data.photos_json)
      ? (data.photos_json as string[])
      : [],
    equipment: Array.isArray(data.equipment_json)
      ? (data.equipment_json as string[])
      : [],
    price_eur: parseNumber(data.price_eur),
  };
}

function buildStepErrors(
  step: number,
  formData: AdFormData,
  t: ReturnType<typeof useTranslations>,
) {
  const nextErrors: WizardErrors = {};

  switch (step) {
    case 1:
      if (!formData.category) nextErrors.category = t("errorSelectCategory");
      break;
    case 2:
      if (!formData.brand) nextErrors.brand = t("errorSelectBrand");
      if (!formData.model) nextErrors.model = t("errorSelectModel");
      if (!formData.year) nextErrors.year = t("errorEnterYear");
      break;
    case 3:
      if (!formData.fuel) nextErrors.fuel = t("errorSelectFuel");
      if (!formData.transmission)
        nextErrors.transmission = t("errorSelectTransmission");
      if (!formData.mileage_km) nextErrors.mileage_km = t("errorEnterMileage");
      break;
    case 4:
      if (!formData.location_city) nextErrors.location_city = t("errorEnterCity");
      break;
    case 5:
      if (!formData.price_eur) nextErrors.price_eur = t("errorEnterPrice");
      if (formData.photoUrls.length === 0) nextErrors.photos = t("errorAddPhoto");
      break;
  }

  return nextErrors;
}

function isBlobUrl(url: string) {
  return url.startsWith("blob:");
}

function buildListingMutationPayload(formData: AdFormData, photoUrls: string[]) {
  return {
    brandId: formData.brand_id,
    modelId: formData.model_id,
    vin: formData.vin,
    year: Number(formData.year),
    priceEur: Number(formData.price_eur),
    mileageKm: Number(formData.mileage_km),
    fuel: formData.fuel,
    transmission: formData.transmission,
    bodyStyle: formData.body_style,
    powerKw: typeof formData.power_kw === "number" ? formData.power_kw : null,
    engineVolumeCm3:
      typeof formData.engine_volume_cm3 === "number"
        ? formData.engine_volume_cm3
        : null,
    generation: formData.generation,
    driveType: formData.drive_type,
    color: formData.color,
    locationCity: formData.location_city,
    locationDistrict: formData.location_district,
    description: formData.description,
    stkValidUntil: formData.stk_valid_until,
    isBoughtInSk: formData.is_bought_in_sk,
    isVatDeductible: formData.is_vat_deductible,
    hasServiceBook: formData.has_service_book,
    fullServiceHistory: formData.full_service_history,
    originalityCheck: formData.originality_check,
    garageKept: formData.garage_kept,
    notCrashed: formData.not_crashed,
    isImported: formData.is_imported,
    photoUrls,
    equipment: formData.equipment,
  };
}

function mapListingValidationErrors(formData: AdFormData, payload: unknown) {
  const parsed = listingMutationSchema.safeParse(payload);
  if (parsed.success) {
    return { ok: true as const, data: parsed.data };
  }

  const nextErrors: WizardErrors = {};

  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") {
      continue;
    }

      switch (field) {
        case "vin":
          nextErrors.vin = issue.message;
          break;
        case "brandId":
          nextErrors.brand = issue.message;
          break;
      case "modelId":
        nextErrors.model = issue.message;
        break;
      case "year":
        nextErrors.year = issue.message;
        break;
      case "priceEur":
        nextErrors.price_eur = issue.message;
        break;
      case "mileageKm":
        nextErrors.mileage_km = issue.message;
        break;
      case "locationCity":
        nextErrors.location_city = issue.message;
        break;
      case "photoUrls":
        nextErrors.photos = issue.message;
        break;
      default:
        break;
    }
  }

  if (!formData.body_style) {
    nextErrors.body_style = "Vyberte typ karosérie.";
  }

  if (!formData.transmission) {
    nextErrors.transmission = "Vyberte prevodovku.";
  }

  return { ok: false as const, errors: nextErrors };
}

function AuthRequiredView({
  tAuth,
  tCommon,
}: {
  tAuth: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="mx-auto max-w-lg px-4 text-center">
        <div className="size-16 mx-auto mb-6 rounded-full bg-accent/10 flex items-center justify-center">
          <LockIcon className="size-8 text-accent" />
        </div>
        <h1 className="text-2xl font-semibold text-primary mb-2">{tAuth("loginToAdd")}</h1>
        <p className="text-secondary mb-6">{tAuth("createFreeAccount")}</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/auth/login"
            className="px-6 py-3 rounded-full bg-accent text-white font-semibold hover:bg-accent-hover"
          >
            {tCommon("login")}
          </Link>
          <Link
            href="/auth/register"
            className="px-6 py-3 rounded-full border border-border text-primary font-semibold hover:bg-surface"
          >
            {tAuth("createAccount")}
          </Link>
        </div>
      </div>
    </main>
  );
}

function AdLoadingView() {
  return (
    <main className="pt-24 pb-16 min-h-screen flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="size-12 rounded-full bg-surface" />
        <div className="h-4 w-32 rounded bg-surface" />
      </div>
    </main>
  );
}

function LoadErrorView({
  message,
  tCommon,
}: {
  message: string;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="mx-auto max-w-lg px-4 text-center">
        <h1 className="text-2xl font-semibold text-primary mb-2">{tCommon("error")}</h1>
        <p className="text-secondary mb-6">{message}</p>
        <Link
          href="/moj-ucet?tab=ads"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-white font-semibold hover:bg-accent-hover"
        >
          {tCommon("back")}
        </Link>
      </div>
    </main>
  );
}

function WizardStepContent({
  currentStep,
  formData,
  errors,
  updateFormData,
  handleDecodeVin,
  vinDecodingEnabled,
  vinDecodeState,
  handlePhotoUpload,
  removePhoto,
  toggleEquipment,
  isEditMode,
  taxonomy,
  isTaxonomyLoading,
  taxonomyError,
  submitOperation,
  setSubmitOperation,
  pricingOptions,
}: {
  currentStep: number;
  formData: AdFormData;
  errors: WizardErrors;
  updateFormData: <K extends keyof AdFormData>(
    key: K,
    value: AdFormData[K],
  ) => void;
  handleDecodeVin: () => void;
  vinDecodingEnabled: boolean;
  vinDecodeState: {
    isLoading: boolean;
    message: string | null;
    tone: "success" | "error" | null;
  };
  handlePhotoUpload: (files: FileList | File[]) => void;
  removePhoto: (index: number) => void;
  toggleEquipment: (item: string) => void;
  isEditMode: boolean;
  taxonomy: VehicleTaxonomy;
  isTaxonomyLoading: boolean;
  taxonomyError: string | null;
  submitOperation: ListingActionOperation;
  setSubmitOperation: (operation: ListingActionOperation) => void;
  pricingOptions: Array<{
    operation: ListingActionOperation;
    label: string;
    priceLabel: string;
    description: string;
  }>;
}) {
  if (currentStep === 1) {
    return (
      <Step1Category
        formData={formData}
        updateFormData={updateFormData}
        errors={errors}
      />
    );
  }

  if (currentStep === 2) {
    return (
      <Step2Vehicle
        formData={formData}
        updateFormData={updateFormData}
        errors={errors}
        brands={taxonomy.brands}
        models={taxonomy.modelsByBrandId}
        isTaxonomyLoading={isTaxonomyLoading}
        taxonomyError={taxonomyError}
        onDecodeVin={handleDecodeVin}
        vinDecodingEnabled={vinDecodingEnabled}
        vinDecodeState={vinDecodeState}
      />
    );
  }

  if (currentStep === 3) {
    return (
      <Step3Technical
        formData={formData}
        updateFormData={updateFormData}
        errors={errors}
      />
    );
  }

  if (currentStep === 4) {
    return (
      <Step4Details
        formData={formData}
        updateFormData={updateFormData}
        errors={errors}
      />
    );
  }

  return (
    <Step5PhotosPrice
      formData={formData}
      updateFormData={updateFormData}
      errors={errors}
      handlePhotoUpload={handlePhotoUpload}
      removePhoto={removePhoto}
      equipmentOptions={EQUIPMENT_OPTIONS}
      toggleEquipment={toggleEquipment}
      showPublishPrice={!isEditMode}
      submitOptions={pricingOptions}
      selectedOperation={submitOperation}
      onSelectOperation={setSubmitOperation}
    />
  );
}

function WizardNavigation({
  currentStep,
  isEditMode,
  isSubmitting,
  errors,
  submitLabel,
  t,
  tCommon,
  onBack,
  disableContinue,
}: {
  currentStep: number;
  isEditMode: boolean;
  isSubmitting: boolean;
  errors: WizardErrors;
  submitLabel: string;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  onBack: () => void;
  disableContinue: boolean;
}) {
  const visibleErrors = Object.values(errors).filter(
    (message): message is string => Boolean(message),
  );

  return (
    <div className="sticky bottom-0 z-20 -mx-6 mt-8 border-t border-border bg-background/95 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-10px_30px_rgba(0,0,0,0.06)] backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-6 sm:shadow-none sm:backdrop-blur-none">
      {visibleErrors.length > 0 ? (
        <div
          id="listing-validation-summary"
          role="alert"
          tabIndex={-1}
          className="mb-5 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-medium text-error"
        >
          <ul className="list-disc space-y-1 pl-5">
            {visibleErrors.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        {!isEditMode && currentStep > 1 ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-base font-medium text-primary transition-all hover:bg-surface active:translate-y-0.5 active:scale-[0.98]"
          >
            <ChevronLeftIcon className="size-5" />
            {tCommon("back")}
          </button>
        ) : (
          <div />
        )}

        <button
          type="submit"
          data-testid="listing-submit"
          disabled={isSubmitting || disableContinue}
          aria-busy={isSubmitting}
          aria-describedby={visibleErrors.length > 0 ? "listing-validation-summary" : undefined}
          className="flex min-h-12 items-center gap-2 rounded-xl bg-accent px-8 py-3 text-base font-bold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-hover active:translate-y-0.5 active:scale-[0.98] active:shadow-none disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <>
              <LoadingSpinner className="size-5" />
              <span>{t("processing")}...</span>
            </>
          ) : currentStep === 5 ? (
            <>{submitLabel}</>
          ) : (
            <>
              {t("continue")}
              <ChevronRightIcon className="size-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SubmitErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-6 p-4 rounded-xl bg-error/10 border border-error/20 flex items-center gap-3 text-error">
      <svg
        className="size-5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="font-medium">{message}</p>
    </div>
  );
}

function useAdWizardController({
  mode = "create",
  adId,
  vinDecodingEnabled = false,
}: AdWizardClientProps, taxonomy: VehicleTaxonomy) {
  const locale = useLocale();
  const inlineCopy = useMemo(() => getAdWizardInlineCopy(locale), [locale]);
  const { user, loading } = useAuth();
  const marketCode = useMarketCode();
  const router = useRouter();
  const t = useTranslations("addListing");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const isEditMode = mode === "edit";
  const [state, dispatch] = useReducer(
    wizardReducer,
    isEditMode,
    createInitialWizardState,
  );
  const [draftPrompt, setDraftPrompt] = useState<ListingDraftPayload | null>(null);
  const [vinDecodeState, setVinDecodeState] = useState<{
    isLoading: boolean;
    message: string | null;
    tone: "success" | "error" | null;
  }>({
    isLoading: false,
    message: null,
    tone: null,
  });
  const [submitOperation, setSubmitOperation] =
    useState<ListingActionOperation>("publish_basic");
  const [pricingOptions, setPricingOptions] = useState<
    Array<{
      operation: ListingActionOperation;
      label: string;
      priceLabel: string;
      description: string;
    }>
  >([
    {
      operation: "publish_basic",
      label: "Basic",
      priceLabel: inlineCopy.basicPrice,
      description: inlineCopy.basicDescription,
    },
    {
      operation: "publish_premium",
      label: "Premium",
      priceLabel: inlineCopy.premiumPrice,
      description: inlineCopy.premiumDescription,
    },
    {
      operation: "publish_top",
      label: "Exclusive",
      priceLabel: inlineCopy.topPrice,
      description: inlineCopy.topDescription,
    },
  ]);
  const draftStorageKey = useMemo(
    () => (user ? getDraftStorageKey(user.id) : null),
    [user],
  );

  const updateFormData = <K extends keyof AdFormData>(
    key: K,
    value: AdFormData[K],
  ) => {
    if (key === "vin" && vinDecodeState.message) {
      setVinDecodeState({ isLoading: false, message: null, tone: null });
    }
    dispatch({
      type: "updateField",
      key,
      value,
    });
  };

  useEffect(() => {
    if (!isEditMode) return;
    if (loading) return;
    if (!user) return;

    if (!adId) {
      dispatch({ type: "failAdLoad", message: tErrors("notFound") });
      return;
    }

    let cancelled = false;

    const fetchAd = async () => {
      dispatch({ type: "startAdLoad" });

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("ads")
          .select("*, brands(name), models(name)")
          .eq("id", adId)
          .eq("market_code", marketCode)
          .single();

        if (cancelled) return;

        if (error || !data) {
          dispatch({ type: "failAdLoad", message: tErrors("notFound") });
          return;
        }

        if (data.seller_id !== user.id) {
          dispatch({ type: "failAdLoad", message: tErrors("unauthorized") });
          return;
        }

        dispatch({
          type: "hydrateFromAd",
          formData: mapAdDataToFormData(data as Record<string, unknown>, taxonomy),
        });
      } catch (error) {
        console.error("Error loading ad:", error);
        if (!cancelled) {
          dispatch({ type: "failAdLoad", message: tErrors("generic") });
        }
      }
    };

    fetchAd();

    return () => {
      cancelled = true;
    };
  }, [adId, isEditMode, loading, marketCode, tErrors, taxonomy, user]);

  useEffect(() => {
    if (isEditMode || loading || !draftStorageKey) {
      return;
    }

    const parsedDraft = parseListingDraftPayload(
      window.localStorage.getItem(draftStorageKey),
    );

    if (!parsedDraft || !hasMeaningfulDraftData(parsedDraft.formData)) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    setDraftPrompt(parsedDraft);
  }, [draftStorageKey, isEditMode, loading]);

  useEffect(() => {
    let cancelled = false;

    async function loadPricingOptions() {
      try {
        const summary = await loadListingPricingSummary();

        if (!summary || cancelled) {
          return;
        }

        setPricingOptions([
          {
            operation: "publish_basic",
            label: "Basic",
            priceLabel: summary.basic || inlineCopy.basicPrice,
            description: inlineCopy.basicDescription,
          },
          {
            operation: "publish_premium",
            label: "Premium",
            priceLabel: summary.premium || inlineCopy.premiumPrice,
            description: inlineCopy.premiumDescription,
          },
          {
            operation: "publish_top",
            label: "Exclusive",
            priceLabel: summary.top || inlineCopy.topPrice,
            description: inlineCopy.topDescription,
          },
        ]);
      } catch {
        // Keep local defaults.
      }
    }

    if (!isEditMode) {
      void loadPricingOptions();
    }

    return () => {
      cancelled = true;
    };
  }, [inlineCopy, isEditMode]);

  useEffect(() => {
    if (
      isEditMode ||
      loading ||
      !draftStorageKey ||
      state.isSubmitting ||
      state.isAdLoading
    ) {
      return;
    }

    if (!hasMeaningfulDraftData(state.formData)) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    const saveTimer = window.setTimeout(() => {
      const payload: ListingDraftPayload = {
        savedAt: new Date().toISOString(),
        currentStep: state.currentStep,
        formData: state.formData,
      };

      window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
    }, 450);

    return () => {
      window.clearTimeout(saveTimer);
    };
  }, [
    draftStorageKey,
    isEditMode,
    loading,
    state.currentStep,
    state.formData,
    state.isAdLoading,
    state.isSubmitting,
  ]);

  const validateStep = (step: number): boolean => {
    const nextErrors = buildStepErrors(step, state.formData, t);
    dispatch({ type: "setErrors", errors: nextErrors });
    return Object.keys(nextErrors).length === 0;
  };

  const validateForSubmit = (): boolean => {
    const stepsToValidate = isEditMode ? [1, 2, 3, 4, 5] : [state.currentStep];
    const nextErrors = stepsToValidate.reduce<WizardErrors>((errors, step) => {
      return { ...errors, ...buildStepErrors(step, state.formData, t) };
    }, {});
    dispatch({ type: "setErrors", errors: nextErrors });
    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(state.currentStep)) {
      dispatch({ type: "nextStep" });
    }
  };

  const handleBack = () => {
    dispatch({ type: "previousStep" });
  };

  const resumeSavedDraft = () => {
    if (!draftPrompt) {
      return;
    }

    dispatch({
      type: "hydrateFromDraft",
      formData: draftPrompt.formData,
      currentStep: draftPrompt.currentStep,
    });
    setDraftPrompt(null);
  };

  const discardSavedDraft = () => {
    if (draftStorageKey) {
      window.localStorage.removeItem(draftStorageKey);
    }
    setDraftPrompt(null);
  };

  const applyVinDecodedData = (decoded: DecodedListingVinData) => {
    const nextPatch: Partial<AdFormData> = {
      vin: decoded.vin,
    };

    const matchedBrandId = findMatchingBrandId(taxonomy, decoded.makeName);
    if (matchedBrandId) {
      const matchedBrand = taxonomy.brands.find((brand) => brand.id === matchedBrandId);
      nextPatch.brand_id = matchedBrandId;
      nextPatch.brand = matchedBrand?.name || "";

      const matchedModelId = findMatchingModelId(
        taxonomy,
        matchedBrandId,
        decoded.modelName,
      );
      if (matchedModelId) {
        const matchedModel = taxonomy.modelsByBrandId[matchedBrandId]?.find(
          (model) => model.id === matchedModelId,
        );
        nextPatch.model_id = matchedModelId;
        nextPatch.model = matchedModel?.name || "";
      } else {
        nextPatch.model_id = "";
        nextPatch.model = "";
      }
    }

    if (typeof decoded.modelYear === "number") {
      nextPatch.year = decoded.modelYear;
    }
    if (decoded.bodyStyle) {
      nextPatch.body_style = decoded.bodyStyle;
    }
    if (decoded.fuel) {
      nextPatch.fuel = decoded.fuel;
    }
    if (decoded.transmission) {
      nextPatch.transmission = decoded.transmission;
    }
    if (typeof decoded.engineVolumeCm3 === "number") {
      nextPatch.engine_volume_cm3 = decoded.engineVolumeCm3;
    }
    if (decoded.driveType) {
      nextPatch.drive_type = decoded.driveType;
    }

    dispatch({
      type: "applyFormPatch",
      patch: nextPatch,
    });

    const hasBrandModelMatch = Boolean(nextPatch.brand_id && nextPatch.model_id);
    setVinDecodeState({
      isLoading: false,
      tone: "success",
      message: hasBrandModelMatch
        ? t("vinDecodeApplied")
        : t("vinDecodeAppliedPartial"),
    });
  };

  const handleDecodeVin = async () => {
    if (!vinDecodingEnabled) {
      return;
    }

    const vin = state.formData.vin.trim();
    if (!vin) {
      setVinDecodeState({
        isLoading: false,
        tone: "error",
        message: t("vinDecodeFailed"),
      });
      return;
    }

    setVinDecodeState({
      isLoading: true,
      tone: null,
      message: null,
    });

    try {
      const response = await fetch("/api/vin/decode", {
        method: "POST",
        headers: createCsrfHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          vin,
          modelYear:
            typeof state.formData.year === "number" ? state.formData.year : null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            decoded?: DecodedListingVinData;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.decoded) {
        setVinDecodeState({
          isLoading: false,
          tone: "error",
          message: payload?.error || t("vinDecodeFailed"),
        });
        return;
      }

      applyVinDecodedData(payload.decoded);
    } catch (error) {
      console.error("VIN decode failed:", error);
      setVinDecodeState({
        isLoading: false,
        tone: "error",
        message: t("vinDecodeFailed"),
      });
    }
  };

  const resolvePhotoUrls = async () => {
    const resolved = await Promise.all(
      state.formData.photoUrls.map(async (url) => {
      if (isBlobUrl(url)) {
        const file = state.photoFilesByUrl[url];
          if (!file) return null;

        try {
          const publicUrl = await uploadImageToCloudflare(file);
            return publicUrl;
        } catch (error) {
          console.error("Photo upload error:", error);
            return null;
        }
      }

        return url;
      }),
    );

    return resolved.filter((url): url is string => Boolean(url));
  };

  const handleSubmit = async () => {
    if (!validateForSubmit()) return;
    if (!user) return;

    if (isEditMode && !adId) {
      dispatch({ type: "setSubmitError", message: tErrors("notFound") });
      return;
    }

    dispatch({ type: "setSubmitting", isSubmitting: true });

    try {
      const photoUrls = await resolvePhotoUrls();

      if (photoUrls.length === 0) {
        dispatch({
          type: "setErrors",
          errors: { photos: t("errorAddPhoto") },
        });
        return;
      }

      const validatedListing = mapListingValidationErrors(
        state.formData,
        buildListingMutationPayload(state.formData, photoUrls),
      );
      if (!validatedListing.ok) {
        dispatch({ type: "setErrors", errors: validatedListing.errors });
        return;
      }

      if (isEditMode) {
        const currentAdId = adId;
        if (!currentAdId) {
          throw new Error("Missing ad id for edit mode.");
        }

        const response = await fetch("/api/account/ads", {
          method: "PATCH",
          headers: createCsrfHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            mode: "full",
            adId: currentAdId,
            listing: validatedListing.data,
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || tErrors("generic"));
        }

        router.push("/moj-ucet?tab=ads&updated=1");
        return;
      }

      const response = await fetch("/api/account/ads", {
        method: "POST",
        headers: createCsrfHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          listing: validatedListing.data,
          operation: submitOperation,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | {
            adId?: string;
            error?: string;
            ok?: boolean;
            status?: string;
            checkoutRequired?: boolean;
            operation?: ListingActionOperation;
          }
        | null;

      if (!response.ok || !result?.ok) {
        dispatch({
          type: "setSubmitError",
          message: result?.error || t("errorCreating"),
        });
        return;
      }

      if (!result.adId) {
        throw new Error("Publish RPC did not return ad_id.");
      }

      trackAnalyticsEvent("listing_created", {
        adId: result.adId,
        isDealer:
          typeof window !== "undefined"
          && window.location.pathname.startsWith("/dealer"),
        photosCount: photoUrls.length,
      });

      const listingLifecyclePayload = {
        adId: result.adId,
        photosCount: photoUrls.length,
        brand: state.formData.brand || undefined,
        model: state.formData.model || undefined,
        locationCity: state.formData.location_city || undefined,
        locationDistrict: state.formData.location_district || undefined,
      };

      if (draftStorageKey) {
        window.localStorage.removeItem(draftStorageKey);
      }
      setDraftPrompt(null);

      if (result.checkoutRequired && result.operation) {
        const idempotencyKey =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `checkout-${result.operation}-${Date.now()}`;

        const checkoutResponse = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: createCsrfHeaders({
            "Content-Type": "application/json",
            "idempotency-key": idempotencyKey,
          }),
          body: JSON.stringify({
            type: "private_listing_action",
            adId: result.adId,
            operation: result.operation,
          }),
        });

        const checkoutResult = (await checkoutResponse.json().catch(() => null)) as
          | { error?: string; url?: string }
          | null;

        if (!checkoutResponse.ok || !checkoutResult?.url) {
          throw new Error(checkoutResult?.error || "Nepodarilo sa vytvoriť platbu.");
        }

        trackAnalyticsEvent("listing_submitted", listingLifecyclePayload);
        window.location.href = checkoutResult.url;
        return;
      }

      if (result.status === "active") {
        trackAnalyticsEvent("listing_published", listingLifecyclePayload);
      } else {
        trackAnalyticsEvent("listing_submitted", listingLifecyclePayload);
      }

      router.push(
        result.status === "active"
          ? "/moj-ucet?tab=ads&updated=1"
          : "/moj-ucet?tab=ads&submitted=1",
      );
    } catch (error) {
      console.error(
        isEditMode ? "Error updating ad:" : "Error creating ad:",
        error,
      );
      dispatch({
        type: "setSubmitError",
        message: isEditMode ? tErrors("generic") : t("errorCreating"),
      });
    } finally {
      dispatch({ type: "setSubmitting", isSubmitting: false });
    }
  };

  const handlePhotoUpload = (files: FileList | File[]) => {
    const remainingSlots = Math.max(
      LISTING_LIMITS.maxPhotos - state.formData.photoUrls.length,
      0,
    );
    if (remainingSlots === 0) return;

    const newPhotos = Array.from(files).slice(0, remainingSlots);
    const newUrls = newPhotos.map((file) => URL.createObjectURL(file));
    const filesByUrl = newPhotos.reduce<Record<string, File>>((acc, file, index) => {
      acc[newUrls[index]] = file;
      return acc;
    }, {});

    dispatch({
      type: "appendPhotos",
      newUrls,
      filesByUrl,
    });
  };

  const removePhoto = (index: number) => {
    const urlToRemove = state.formData.photoUrls[index];
    if (!urlToRemove) return;

    dispatch({ type: "removePhoto", index, url: urlToRemove });
    if (isBlobUrl(urlToRemove)) {
      URL.revokeObjectURL(urlToRemove);
    }
  };

  const toggleEquipment = (item: string) => {
    dispatch({ type: "toggleEquipment", item });
  };

  return {
    user,
    loading,
    state,
    t,
    tAuth,
    tCommon,
    isEditMode,
    dispatch,
    updateFormData,
    handlePhotoUpload,
    removePhoto,
    toggleEquipment,
    handleBack,
    handleNext,
    handleSubmit,
    handleDecodeVin,
    draftPrompt,
    resumeSavedDraft,
    discardSavedDraft,
    vinDecodeState,
    submitOperation,
    setSubmitOperation,
    pricingOptions,
  };
}

export default function AdWizardClient(props: AdWizardClientProps) {
  const locale = useLocale();
  const inlineCopy = useMemo(() => getAdWizardInlineCopy(locale), [locale]);
  const pathname = usePathname();
  const isEditPath = pathname.startsWith("/upravit-inzerat/");
  const fallbackAdId = isEditPath ? pathname.split("/").filter(Boolean).at(-1) : undefined;
  const {
    taxonomy,
    isLoading: isTaxonomyLoading,
    error: taxonomyError,
  } = usePublicVehicleTaxonomy();

  const resolvedProps: AdWizardClientProps = {
    ...props,
    mode: props.mode ?? (isEditPath ? "edit" : "create"),
    adId: props.adId ?? fallbackAdId,
  };

  const {
    user,
    loading,
    state,
    t,
    tAuth,
    tCommon,
    isEditMode,
    dispatch,
    updateFormData,
    handlePhotoUpload,
    removePhoto,
    toggleEquipment,
    handleBack,
    handleNext,
    handleSubmit,
    handleDecodeVin,
    draftPrompt,
    resumeSavedDraft,
    discardSavedDraft,
    vinDecodeState,
    submitOperation,
    setSubmitOperation,
    pricingOptions,
  } = useAdWizardController(resolvedProps, taxonomy);

  if (!loading && !user) return <AuthRequiredView tAuth={tAuth} tCommon={tCommon} />;
  if (loading || state.isAdLoading) return <AdLoadingView />;
  if (state.loadError) return <LoadErrorView message={state.loadError} tCommon={tCommon} />;

  const displayEditTitle = inlineCopy.editTitle;
  const displayEditSubtitle = inlineCopy.editSubtitle;

  const submitLabel = isEditMode ? tCommon("save") : t("publish");
  const pageTitle = isEditMode ? inlineCopy.editTitle : t("title");
  const pageSubtitle = isEditMode ? inlineCopy.editSubtitle : t("subtitle");

  const resolvedPageTitle = isEditMode ? inlineCopy.editTitle : pageTitle;
  const resolvedPageSubtitle = isEditMode
    ? inlineCopy.editSubtitle
    : pageSubtitle;

  const isEmbedded = Boolean(props.embedded);
  const shellClass = isEmbedded
    ? "mx-auto w-full max-w-6xl"
    : "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
  const headingClass = isEmbedded ? "hidden" : "py-8 text-center";
  const draftSavedLabel = draftPrompt
    ? new Date(draftPrompt.savedAt).toLocaleString(inlineCopy.localeTag)
    : "";
  const wizardStepProps = {
    formData: state.formData,
    updateFormData,
    errors: state.errors,
    handleDecodeVin,
    vinDecodingEnabled: Boolean(resolvedProps.vinDecodingEnabled),
    vinDecodeState,
    handlePhotoUpload,
    removePhoto,
    toggleEquipment,
    isEditMode,
    taxonomy,
    isTaxonomyLoading,
    taxonomyError,
    submitOperation,
    setSubmitOperation,
    pricingOptions,
  };

  const content = (
    <div className={shellClass}>
      <div className={headingClass}>
        <h1 className="text-2xl font-semibold text-primary sm:text-3xl">
          {isEditMode ? displayEditTitle : resolvedPageTitle}
        </h1>
        <p className="mt-2 text-secondary">
          {isEditMode ? displayEditSubtitle : resolvedPageSubtitle}
        </p>
      </div>

      {!isEditMode && draftPrompt ? (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning-subtle p-4">
          <p className="text-sm font-semibold text-text-primary">
            {inlineCopy.draftFound}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {inlineCopy.draftLastSaved(draftSavedLabel)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resumeSavedDraft}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover"
            >
              {inlineCopy.resumeDraft}
            </button>
            <button
              type="button"
              onClick={discardSavedDraft}
              className="rounded-lg border border-border-strong bg-background px-3 py-2 text-xs font-semibold text-text-primary hover:border-accent hover:text-accent"
            >
              {inlineCopy.startOver}
            </button>
          </div>
        </div>
      ) : null}

      {!isEditMode ? (
        <WizardProgress
          currentStep={state.currentStep}
          steps={STEPS}
          onStepClick={(step) => dispatch({ type: "setStep", step })}
        />
      ) : null}

      <div className="rounded-2xl border border-border bg-background overflow-hidden">
        <div className="p-6 sm:p-8 lg:p-10 [&_.form-input]:min-h-12 [&_.form-input]:text-base [&_h2]:!text-2xl [&_h3]:!text-lg [&_label]:!text-base sm:[&_h2]:!text-3xl">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (isEditMode || state.currentStep === 5) {
                void handleSubmit();
                return;
              }
              handleNext();
            }}
            className="space-y-0"
          >
            {isEditMode ? (
              <div className="space-y-10 divide-y divide-border [&>div+div]:pt-10">
                {[1, 2, 3, 4, 5].map((step) => (
                  <WizardStepContent key={step} {...wizardStepProps} currentStep={step} />
                ))}
              </div>
            ) : (
              <WizardStepContent {...wizardStepProps} currentStep={state.currentStep} />
            )}

            {!isEditMode && state.currentStep === 5 ? (
              <div className="mt-6">
                <ModerationEmailPreference compact />
              </div>
            ) : null}

            <WizardNavigation
              currentStep={isEditMode ? 5 : state.currentStep}
              isEditMode={isEditMode}
              isSubmitting={state.isSubmitting}
              errors={state.errors}
              submitLabel={submitLabel}
              t={t}
              tCommon={tCommon}
              onBack={handleBack}
              disableContinue={!isEditMode && state.currentStep === 1 && !state.formData.category}
            />
          </form>
        </div>
      </div>

      {state.errors.submit && <SubmitErrorBanner message={state.errors.submit} />}
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return <main className="pt-24 pb-16 min-h-screen">{content}</main>;
}
