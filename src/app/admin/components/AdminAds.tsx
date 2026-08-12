"use client";

import { useLocale } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { Input } from "@/components/ui/shadcn/input";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { buildAdminPreviewAdPath } from "@/lib/cars/ad-path";
import {
  bulkUpdateAdminListings,
  createAdminListingForUser,
  getAdminListingFormOptions,
  getAdminListings,
  getAdminStats,
  updateAdminListing,
  type AdminListing,
  type AdminListingFormOptions,
  type AdminListingStatus,
  type AdminStats,
} from "../actions";
import { AdminModeration } from "./AdminModeration";

type AdminFuel =
  | "petrol"
  | "diesel"
  | "electric"
  | "hybrid"
  | "lpg"
  | "cng"
  | "hydrogen";
type AdminTransmission = "manual" | "automatic";
type AdminBodyStyle =
  | "sedan"
  | "combi"
  | "suv"
  | "hatchback"
  | "coupe"
  | "cabriolet"
  | "mpv"
  | "pickup"
  | "commercial";

type AdminAdsState = {
  listings: AdminListing[];
  stats: AdminStats | null;
  loading: boolean;
  error: string | null;
};

type Notice = {
  type: "success" | "error";
  text: string;
} | null;

type CreateListingForm = {
  sellerId: string;
  brandId: string;
  modelId: string;
  year: string;
  priceEur: string;
  mileageKm: string;
  fuel: AdminFuel;
  transmission: AdminTransmission;
  bodyStyle: AdminBodyStyle;
  locationCity: string;
  description: string;
};

type EditListingForm = {
  priceEur: string;
  mileageKm: string;
  description: string;
  status: AdminListingStatus;
};

const EMPTY_STATS: AdminStats = {
  totalUsers: 0,
  totalAds: 0,
  activeAds: 0,
  pendingModeration: 0,
  dealerAccounts: 0,
  todayRegistrations: 0,
  todayAds: 0,
  soldToday: 0,
};

type AdminAdsLocale = "sk" | "en";

type AdminAdsCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  createListing: string;
  statsAll: string;
  statsAllHelper: string;
  statsActive: string;
  statsActiveHelper: string;
  statsPending: string;
  statsPendingHelper: string;
  statsToday: string;
  statsTodayHelper: string;
  moderationTitle: string;
  moderationHelp: string;
  allListingsTitle: string;
  allListingsHelp: string;
  listingsInList: (count: number) => string;
  searchPlaceholder: string;
  statusFilter: string;
  allStatuses: string;
  bulkTitle: string;
  selectedCount: (count: number) => string;
  bulkStatus: string;
  saveBulkChange: string;
  emptyListings: string;
  selectAllListings: string;
  selectListing: (label: string) => string;
  tableCar: string;
  tableSeller: string;
  tableStatus: string;
  tablePrice: string;
  tableMileage: string;
  tablePhotos: string;
  tableCreated: string;
  tableActions: string;
  edit: string;
  openListing: string;
  loadError: string;
  actionFailed: string;
  createSuccess: string;
  editSuccess: string;
  bulkSuccess: string;
  createDialogTitle: string;
  createDialogDescription: string;
  manualCreationNote: string;
  user: string;
  brand: string;
  model: string;
  year: string;
  price: string;
  mileage: string;
  fuel: string;
  transmission: string;
  bodyStyle: string;
  city: string;
  description: string;
  cancel: string;
  createDraft: string;
  editDialogTitle: string;
  selectedListingFallback: string;
  save: string;
  statusLabels: Record<string, string>;
  fuelLabels: Record<AdminFuel, string>;
  bodyStyleLabels: Record<AdminBodyStyle, string>;
  transmissionLabels: Record<AdminTransmission, string>;
};

const ADMIN_ADS_COPY: Record<AdminAdsLocale, AdminAdsCopy> = {
  sk: {
    eyebrow: "Inzeráty",
    title: "Správa inzerátov",
    subtitle:
      "Schvaľovanie, úpravy, hromadné zmeny a ručné vytvorenie inzerátu pre používateľa.",
    createListing: "Vytvoriť inzerát",
    statsAll: "Všetky inzeráty",
    statsAllHelper: "Celý katalóg",
    statsActive: "Aktívne",
    statsActiveHelper: "Viditeľné pre návštevníkov",
    statsPending: "Čaká na schválenie",
    statsPendingHelper: "Treba pozrieť",
    statsToday: "Nové dnes",
    statsTodayHelper: "Pridané za dnešok",
    moderationTitle: "Čaká na kontrolu",
    moderationHelp: "Schvaľovanie nových inzerátov a otvorené hlásenia.",
    allListingsTitle: "Všetky inzeráty",
    allListingsHelp: "Posledných 120 inzerátov v katalógu.",
    listingsInList: (count) => `${count} v zozname`,
    searchPlaceholder: "Hľadať auto alebo predajcu",
    statusFilter: "Stav",
    allStatuses: "Všetky stavy",
    bulkTitle: "Hromadná zmena",
    selectedCount: (count) => `Vybrané: ${count}`,
    bulkStatus: "Nový stav",
    saveBulkChange: "Uložiť zmenu",
    emptyListings: "Nenašli sa žiadne inzeráty.",
    selectAllListings: "Vybrať všetky inzeráty",
    selectListing: (label) => `Vybrať ${label}`,
    tableCar: "Auto",
    tableSeller: "Predajca",
    tableStatus: "Stav",
    tablePrice: "Cena",
    tableMileage: "Km",
    tablePhotos: "Fotky",
    tableCreated: "Vytvorené",
    tableActions: "Akcie",
    edit: "Upraviť",
    openListing: "Otvoriť",
    loadError: "Inzeráty sa nepodarilo načítať.",
    actionFailed: "Akcia zlyhala.",
    createSuccess: "Koncept inzerátu vytvorený.",
    editSuccess: "Inzerát uložený.",
    bulkSuccess: "Hromadná zmena uložená.",
    createDialogTitle: "Vytvoriť inzerát",
    createDialogDescription: "Vytvorí sa koncept pre vybraného používateľa.",
    manualCreationNote:
      "Ručné vytvorenie používajte, keď zákazník pošle inzerát e-mailom alebo telefonicky.",
    user: "Používateľ",
    brand: "Značka",
    model: "Model",
    year: "Rok",
    price: "Cena",
    mileage: "Kilometre",
    fuel: "Palivo",
    transmission: "Prevodovka",
    bodyStyle: "Karoséria",
    city: "Mesto",
    description: "Popis",
    cancel: "Zrušiť",
    createDraft: "Vytvoriť koncept",
    editDialogTitle: "Upraviť inzerát",
    selectedListingFallback: "Vybraný inzerát",
    save: "Uložiť",
    statusLabels: {
      draft: "Koncept",
      pending: "Čaká",
      active: "Aktívny",
      sold: "Predané",
      expired: "Expirovaný",
      rejected: "Zamietnutý",
      banned: "Stiahnutý",
    },
    fuelLabels: {
      diesel: "Diesel",
      petrol: "Benzín",
      hybrid: "Hybrid",
      electric: "Elektro",
      lpg: "LPG",
      cng: "CNG",
      hydrogen: "Vodík",
    },
    bodyStyleLabels: {
      combi: "Kombi",
      sedan: "Sedan",
      suv: "SUV",
      hatchback: "Hatchback",
      coupe: "Kupé",
      cabriolet: "Kabriolet",
      mpv: "MPV",
      pickup: "Pickup",
      commercial: "Úžitkové",
    },
    transmissionLabels: {
      manual: "Manuál",
      automatic: "Automat",
    },
  },
  en: {
    eyebrow: "Listings",
    title: "Listing workbench",
    subtitle:
      "Review, edit, bulk update, and manually create listings for a user.",
    createListing: "Create listing",
    statsAll: "All listings",
    statsAllHelper: "Full catalog",
    statsActive: "Active",
    statsActiveHelper: "Visible to visitors",
    statsPending: "Waiting for approval",
    statsPendingHelper: "Needs review",
    statsToday: "New today",
    statsTodayHelper: "Added today",
    moderationTitle: "Needs review",
    moderationHelp: "New listing approvals and open reports.",
    allListingsTitle: "All listings",
    allListingsHelp: "Latest 120 listings in the catalog.",
    listingsInList: (count) => `${count} in list`,
    searchPlaceholder: "Search car or seller",
    statusFilter: "Status",
    allStatuses: "All statuses",
    bulkTitle: "Bulk edit",
    selectedCount: (count) => `Selected: ${count}`,
    bulkStatus: "New status",
    saveBulkChange: "Save change",
    emptyListings: "No listings found.",
    selectAllListings: "Select all listings",
    selectListing: (label) => `Select ${label}`,
    tableCar: "Car",
    tableSeller: "Seller",
    tableStatus: "Status",
    tablePrice: "Price",
    tableMileage: "Km",
    tablePhotos: "Photos",
    tableCreated: "Created",
    tableActions: "Actions",
    edit: "Edit",
    openListing: "Open listing",
    loadError: "Listings could not be loaded.",
    actionFailed: "Action failed.",
    createSuccess: "Listing draft created.",
    editSuccess: "Listing saved.",
    bulkSuccess: "Bulk change saved.",
    createDialogTitle: "Create listing",
    createDialogDescription: "Creates a draft for the selected user.",
    manualCreationNote:
      "Manual ad creation is for customers who send listing details by email or phone.",
    user: "User",
    brand: "Brand",
    model: "Model",
    year: "Year",
    price: "Price",
    mileage: "Kilometers",
    fuel: "Fuel",
    transmission: "Transmission",
    bodyStyle: "Body style",
    city: "City",
    description: "Description",
    cancel: "Cancel",
    createDraft: "Create draft",
    editDialogTitle: "Edit listing",
    selectedListingFallback: "Selected listing",
    save: "Save",
    statusLabels: {
      draft: "Draft",
      pending: "Pending",
      active: "Active",
      sold: "Sold",
      expired: "Expired",
      rejected: "Rejected",
      banned: "Hidden",
    },
    fuelLabels: {
      diesel: "Diesel",
      petrol: "Petrol",
      hybrid: "Hybrid",
      electric: "Electric",
      lpg: "LPG",
      cng: "CNG",
      hydrogen: "Hydrogen",
    },
    bodyStyleLabels: {
      combi: "Estate",
      sedan: "Sedan",
      suv: "SUV",
      hatchback: "Hatchback",
      coupe: "Coupe",
      cabriolet: "Convertible",
      mpv: "MPV",
      pickup: "Pickup",
      commercial: "Commercial",
    },
    transmissionLabels: {
      manual: "Manual",
      automatic: "Automatic",
    },
  },
};

function getAdminAdsLocale(locale: string): AdminAdsLocale {
  return locale === "en" ? "en" : "sk";
}

const STATUS_OPTIONS: AdminListingStatus[] = [
  "draft",
  "pending",
  "active",
  "sold",
  "expired",
  "rejected",
  "banned",
];

const FUEL_OPTIONS: Array<[AdminFuel, string]> = [
  ["diesel", "Diesel"],
  ["petrol", "Benzín"],
  ["hybrid", "Hybrid"],
  ["electric", "Elektro"],
  ["lpg", "LPG"],
  ["cng", "CNG"],
  ["hydrogen", "Vodík"],
];

const BODY_STYLE_OPTIONS: Array<[AdminBodyStyle, string]> = [
  ["combi", "Kombi"],
  ["sedan", "Sedan"],
  ["suv", "SUV"],
  ["hatchback", "Hatchback"],
  ["coupe", "Kupé"],
  ["cabriolet", "Kabriolet"],
  ["mpv", "MPV"],
  ["pickup", "Pickup"],
  ["commercial", "Úžitkové"],
];

const EMPTY_CREATE_FORM: CreateListingForm = {
  sellerId: "",
  brandId: "",
  modelId: "",
  year: String(new Date().getFullYear()),
  priceEur: "",
  mileageKm: "",
  fuel: "diesel",
  transmission: "manual",
  bodyStyle: "combi",
  locationCity: "",
  description: "",
};

function statusVariant(status: string) {
  switch (status) {
    case "active":
      return "success" as const;
    case "pending":
      return "warning" as const;
    case "rejected":
    case "banned":
      return "error" as const;
    case "sold":
      return "accent" as const;
    default:
      return "secondary" as const;
  }
}

function formatAdminAdsNumber(locale: AdminAdsLocale, value: number) {
  return value.toLocaleString(locale === "en" ? "en-GB" : "sk-SK");
}

function formatCurrency(locale: AdminAdsLocale, value: number) {
  return `${formatAdminAdsNumber(locale, value)} €`;
}

function formatAdminAdsDate(locale: AdminAdsLocale, value: string) {
  return new Date(value).toLocaleDateString(locale === "en" ? "en-GB" : "sk-SK");
}

function toInteger(value: string) {
  return Number.parseInt(value, 10);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeAdminStatus(status: string): AdminListingStatus {
  return STATUS_OPTIONS.includes(status as AdminListingStatus)
    ? (status as AdminListingStatus)
    : "draft";
}

function StatBox({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background-secondary p-4">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <p className="mt-2 text-3xl font-bold text-text-primary">{value}</p>
      <p className="mt-2 text-sm text-text-muted">{helper}</p>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
      {label}
      {children}
    </label>
  );
}

function ListingRows({
  listings,
  copy,
  locale,
  selectedIds,
  allSelected,
  onToggleAll,
  onToggleListing,
  onEdit,
}: {
  listings: AdminListing[];
  copy: AdminAdsCopy;
  locale: AdminAdsLocale;
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleListing: (listingId: string) => void;
  onEdit: (listing: AdminListing) => void;
}) {
  if (listings.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-text-secondary">
        {copy.emptyListings}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px]">
        <thead>
          <tr className="border-b border-border-subtle bg-background-tertiary">
            <th className="w-12 px-4 py-3 text-left">
              <input
                type="checkbox"
                aria-label={copy.selectAllListings}
                checked={allSelected}
                onChange={onToggleAll}
                className="size-4 rounded border-border"
              />
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">
              {copy.tableCar}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">
              {copy.tableSeller}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">
              {copy.tableStatus}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">
              {copy.tablePrice}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">
              {copy.tableMileage}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">
              {copy.tablePhotos}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">
              {copy.tableCreated}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">
              {copy.tableActions}
            </th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => {
            const adPath = buildAdminPreviewAdPath({
              id: listing.id,
              brand: listing.brand,
              model: listing.model,
              year: listing.year,
            });

            return (
              <tr
                key={listing.id}
                className="border-b border-border-subtle transition-colors hover:bg-surface-hover"
              >
                <td className="px-4 py-4">
                  <input
                    type="checkbox"
                    aria-label={copy.selectListing(
                      `${listing.brand} ${listing.model}`,
                    )}
                    checked={selectedIds.has(listing.id)}
                    onChange={() => onToggleListing(listing.id)}
                    className="size-4 rounded border-border"
                  />
                </td>
                <td className="px-4 py-4">
                  <p className="font-semibold text-text-primary">
                    {listing.brand} {listing.model}
                  </p>
                  {listing.year ? (
                    <p className="mt-1 text-sm text-text-muted">{listing.year}</p>
                  ) : null}
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm font-medium text-text-primary">
                    {listing.dealer_name || listing.seller_name || listing.seller_email}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">{listing.seller_email}</p>
                </td>
                <td className="px-4 py-4">
                  <Badge variant={statusVariant(listing.status)}>
                    {copy.statusLabels[listing.status] || listing.status}
                  </Badge>
                </td>
                <td className="px-4 py-4 font-semibold text-text-primary">
                  {formatCurrency(locale, listing.price_eur)}
                </td>
                <td className="px-4 py-4 text-text-primary">
                  {listing.mileage_km === null
                    ? "-"
                    : formatAdminAdsNumber(locale, listing.mileage_km)}
                </td>
                <td className="px-4 py-4 text-text-primary">{listing.photos}</td>
                <td className="px-4 py-4 text-sm text-text-secondary">
                  {formatAdminAdsDate(locale, listing.created_at)}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(listing)}
                    >
                      {copy.edit}
                    </Button>
                    <Link
                      href={adPath}
                      target="_blank"
                      className="inline-flex h-8 items-center justify-center rounded-md border border-border-subtle px-3 text-sm font-medium text-text-primary transition-colors hover:border-accent hover:text-accent"
                    >
                      {copy.openListing}
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdminAds() {
  const locale = getAdminAdsLocale(useLocale());
  const copy = ADMIN_ADS_COPY[locale];
  const [state, setState] = useState<AdminAdsState>({
    listings: [],
    stats: null,
    loading: true,
    error: null,
  });
  const [formOptions, setFormOptions] =
    useState<AdminListingFormOptions | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notice, setNotice] = useState<Notice>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<AdminListingStatus>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateListingForm>(EMPTY_CREATE_FORM);
  const [editListing, setEditListing] = useState<AdminListing | null>(null);
  const [editForm, setEditForm] = useState<EditListingForm>({
    priceEur: "",
    mileageKm: "",
    description: "",
    status: "draft",
  });
  const [pendingAction, setPendingAction] = useState<
    "create" | "edit" | "bulk" | null
  >(null);

  const refreshAds = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }

    try {
      const [listings, stats, options] = await Promise.all([
        getAdminListings(120),
        getAdminStats(),
        getAdminListingFormOptions(),
      ]);
      setState({ listings, stats, loading: false, error: null });
      setFormOptions(options);
    } catch (error) {
      console.error("Failed to load admin ads:", error);
      setState({
        listings: [],
        stats: null,
        loading: false,
        error: copy.loadError,
      });
    }
  }, [copy.loadError]);

  useEffect(() => {
    void refreshAds();
  }, [refreshAds]);

  useEffect(() => {
    if (!formOptions) return;

    setCreateForm((current) => {
      const nextBrandId = current.brandId || formOptions.brands[0]?.id || "";
      const nextModelId =
        current.modelId ||
        formOptions.models.find((model) => model.brandId === nextBrandId)?.id ||
        "";
      const nextSellerId = current.sellerId || formOptions.sellers[0]?.id || "";

      if (
        nextBrandId === current.brandId &&
        nextModelId === current.modelId &&
        nextSellerId === current.sellerId
      ) {
        return current;
      }

      return {
        ...current,
        sellerId: nextSellerId,
        brandId: nextBrandId,
        modelId: nextModelId,
      };
    });
  }, [formOptions]);

  const filteredListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return state.listings.filter((listing) => {
      const matchesStatus =
        statusFilter === "all" || listing.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${listing.brand} ${listing.model} ${listing.seller_email} ${
          listing.dealer_name || ""
        }`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, state.listings, statusFilter]);

  const selectedModelOptions = useMemo(() => {
    if (!formOptions) return [];
    return formOptions.models.filter((model) => model.brandId === createForm.brandId);
  }, [createForm.brandId, formOptions]);

  const stats = state.stats ?? EMPTY_STATS;
  const statusOptions = Array.from(
    new Set([...state.listings.map((listing) => listing.status), ...STATUS_OPTIONS]),
  ).sort();
  const allFilteredSelected =
    filteredListings.length > 0 &&
    filteredListings.every((listing) => selectedIds.has(listing.id));
  const selectedCount = selectedIds.size;

  function toggleListing(listingId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(listingId)) {
        next.delete(listingId);
      } else {
        next.add(listingId);
      }
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const listing of filteredListings) {
          next.delete(listing.id);
        }
      } else {
        for (const listing of filteredListings) {
          next.add(listing.id);
        }
      }
      return next;
    });
  }

  function openEdit(listing: AdminListing) {
    setEditListing(listing);
    setEditForm({
      priceEur: String(listing.price_eur || ""),
      mileageKm: listing.mileage_km === null ? "" : String(listing.mileage_km),
      description: listing.description || "",
      status: normalizeAdminStatus(listing.status),
    });
  }

  async function handleCreateAd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("create");
    setNotice(null);

    try {
      await createAdminListingForUser({
        sellerId: createForm.sellerId,
        brandId: createForm.brandId,
        modelId: createForm.modelId,
        year: toInteger(createForm.year),
        priceEur: toInteger(createForm.priceEur),
        mileageKm: toInteger(createForm.mileageKm),
        fuel: createForm.fuel,
        transmission: createForm.transmission,
        bodyStyle: createForm.bodyStyle,
        locationCity: createForm.locationCity,
        description: createForm.description,
      });
      setNotice({ type: "success", text: copy.createSuccess });
      toast.success(copy.createSuccess);
      setCreateOpen(false);
      setCreateForm((current) => ({
        ...EMPTY_CREATE_FORM,
        sellerId: current.sellerId,
        brandId: current.brandId,
        modelId: current.modelId,
      }));
      await refreshAds(false);
    } catch (error) {
      const message = getErrorMessage(error, copy.actionFailed);
      setNotice({ type: "error", text: message });
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleEditAd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editListing) return;

    setPendingAction("edit");
    setNotice(null);

    try {
      const nextStatus =
        editForm.status === normalizeAdminStatus(editListing.status)
          ? undefined
          : editForm.status;
      await updateAdminListing({
        adId: editListing.id,
        priceEur: toInteger(editForm.priceEur),
        mileageKm: toInteger(editForm.mileageKm),
        description: editForm.description,
        status: nextStatus,
      });
      setNotice({ type: "success", text: copy.editSuccess });
      toast.success(copy.editSuccess);
      setEditListing(null);
      await refreshAds(false);
    } catch (error) {
      const message = getErrorMessage(error, copy.actionFailed);
      setNotice({ type: "error", text: message });
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleBulkUpdate() {
    setPendingAction("bulk");
    setNotice(null);

    try {
      await bulkUpdateAdminListings({
        adIds: Array.from(selectedIds),
        status: bulkStatus,
      });
      setNotice({ type: "success", text: copy.bulkSuccess });
      toast.success(copy.bulkSuccess);
      setSelectedIds(new Set());
      await refreshAds(false);
    } catch (error) {
      const message = getErrorMessage(error, copy.actionFailed);
      setNotice({ type: "error", text: message });
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border-subtle bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-accent">
              {copy.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              {copy.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              {copy.subtitle}
            </p>
          </div>
          <Button
            type="button"
            variant="accent"
            onClick={() => setCreateOpen(true)}
          >
            {copy.createListing}
          </Button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {state.loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`admin-ads-stat-loading-${index + 1}`}
              className="rounded-lg border border-border-subtle bg-background-secondary p-4"
            >
              <Skeleton className="mb-3 h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-3 h-3 w-28" />
            </div>
          ))
        ) : (
          <>
            <StatBox
              label={copy.statsAll}
              value={formatAdminAdsNumber(locale, stats.totalAds)}
              helper={copy.statsAllHelper}
            />
            <StatBox
              label={copy.statsActive}
              value={formatAdminAdsNumber(locale, stats.activeAds)}
              helper={copy.statsActiveHelper}
            />
            <StatBox
              label={copy.statsPending}
              value={formatAdminAdsNumber(locale, stats.pendingModeration)}
              helper={copy.statsPendingHelper}
            />
            <StatBox
              label={copy.statsToday}
              value={formatAdminAdsNumber(locale, stats.todayAds)}
              helper={copy.statsTodayHelper}
            />
          </>
        )}
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            {copy.moderationTitle}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {copy.moderationHelp}
          </p>
        </div>
        <AdminModeration />
      </section>

      <Card padding="none">
        <CardHeader className="border-b border-border-subtle">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>{copy.allListingsTitle}</CardTitle>
              <p className="mt-1 text-sm text-text-secondary">
                {copy.allListingsHelp}
              </p>
            </div>
            <Badge variant="secondary">
              {copy.listingsInList(filteredListings.length)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[240px] flex-1">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
              />
            </div>
            <FormField label={copy.statusFilter}>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 min-w-[180px] rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
              >
                <option value="all">{copy.allStatuses}</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {copy.statusLabels[status] || status}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {selectedCount > 0 ? (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-accent/25 bg-accent/5 p-3">
              <div className="min-w-[160px] flex-1">
                <p className="text-sm font-semibold text-text-primary">
                  {copy.bulkTitle}
                </p>
                <p className="text-sm text-text-secondary">
                  {copy.selectedCount(selectedCount)}
                </p>
              </div>
              <FormField label={copy.bulkStatus}>
                <select
                  value={bulkStatus}
                  onChange={(event) =>
                    setBulkStatus(event.target.value as AdminListingStatus)
                  }
                  className="h-10 min-w-[180px] rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {copy.statusLabels[status]}
                    </option>
                  ))}
                </select>
              </FormField>
              <Button
                type="button"
                onClick={() => void handleBulkUpdate()}
                loading={pendingAction === "bulk"}
              >
                {copy.saveBulkChange}
              </Button>
            </div>
          ) : null}

          {notice ? (
            <div
              className={
                notice.type === "success"
                  ? "rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success"
                  : "rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
              }
            >
              {notice.text}
            </div>
          ) : null}

          {state.error ? (
            <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
              {state.error}
            </div>
          ) : null}

          {state.loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <ListingRows
              listings={filteredListings}
              copy={copy}
              locale={locale}
              selectedIds={selectedIds}
              allSelected={allFilteredSelected}
              onToggleAll={toggleAllFiltered}
              onToggleListing={toggleListing}
              onEdit={openEdit}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{copy.createDialogTitle}</DialogTitle>
            <DialogDescription>
              {copy.createDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border-subtle bg-background-secondary p-3 text-sm text-text-secondary">
            {copy.manualCreationNote}
          </div>
          <form className="space-y-4" onSubmit={(event) => void handleCreateAd(event)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={copy.user}>
                <select
                  value={createForm.sellerId}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      sellerId: event.target.value,
                    }))
                  }
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
                  required
                >
                  {formOptions?.sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.email}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={copy.brand}>
                <select
                  value={createForm.brandId}
                  onChange={(event) => {
                    const brandId = event.target.value;
                    const firstModelId =
                      formOptions?.models.find((model) => model.brandId === brandId)
                        ?.id || "";
                    setCreateForm((current) => ({
                      ...current,
                      brandId,
                      modelId: firstModelId,
                    }));
                  }}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
                  required
                >
                  {formOptions?.brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={copy.model}>
                <select
                  value={createForm.modelId}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      modelId: event.target.value,
                    }))
                  }
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
                  required
                >
                  {selectedModelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={copy.year}>
                <Input
                  type="number"
                  value={createForm.year}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      year: event.target.value,
                    }))
                  }
                  required
                />
              </FormField>
              <FormField label={copy.price}>
                <Input
                  type="number"
                  value={createForm.priceEur}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      priceEur: event.target.value,
                    }))
                  }
                  required
                />
              </FormField>
              <FormField label={copy.mileage}>
                <Input
                  type="number"
                  value={createForm.mileageKm}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      mileageKm: event.target.value,
                    }))
                  }
                  required
                />
              </FormField>
              <FormField label={copy.fuel}>
                <select
                  value={createForm.fuel}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      fuel: event.target.value as AdminFuel,
                    }))
                  }
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
                >
                  {FUEL_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {copy.fuelLabels[value] || label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={copy.transmission}>
                <select
                  value={createForm.transmission}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      transmission: event.target.value as AdminTransmission,
                    }))
                  }
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
                >
                  <option value="manual">{copy.transmissionLabels.manual}</option>
                  <option value="automatic">
                    {copy.transmissionLabels.automatic}
                  </option>
                </select>
              </FormField>
              <FormField label={copy.bodyStyle}>
                <select
                  value={createForm.bodyStyle}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      bodyStyle: event.target.value as AdminBodyStyle,
                    }))
                  }
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
                >
                  {BODY_STYLE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {copy.bodyStyleLabels[value] || label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={copy.city}>
                <Input
                  value={createForm.locationCity}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      locationCity: event.target.value,
                    }))
                  }
                  required
                />
              </FormField>
            </div>
            <FormField label={copy.description}>
              <textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-24 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {copy.cancel}
              </Button>
              <Button type="submit" loading={pendingAction === "create"}>
                {copy.createDraft}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editListing)} onOpenChange={(open) => !open && setEditListing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{copy.editDialogTitle}</DialogTitle>
            <DialogDescription>
              {editListing
                ? `${editListing.brand} ${editListing.model}`
                : copy.selectedListingFallback}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void handleEditAd(event)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={copy.price}>
                <Input
                  type="number"
                  value={editForm.priceEur}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      priceEur: event.target.value,
                    }))
                  }
                  required
                />
              </FormField>
              <FormField label={copy.mileage}>
                <Input
                  type="number"
                  value={editForm.mileageKm}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      mileageKm: event.target.value,
                    }))
                  }
                  required
                />
              </FormField>
              <FormField label={copy.statusFilter}>
                <select
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value as AdminListingStatus,
                    }))
                  }
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {copy.statusLabels[status]}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FormField label={copy.description}>
              <textarea
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-24 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditListing(null)}
              >
                {copy.cancel}
              </Button>
              <Button type="submit" loading={pendingAction === "edit"}>
                {copy.save}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
