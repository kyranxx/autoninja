"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/rbac";
import { assertAdminMfaAssurance } from "@/lib/auth/admin-mfa";
import {
  calculateStripeRevenueTotals,
  extractCheckoutAmountEur,
  type ProcessedCheckoutLog,
} from "@/lib/admin/revenue";
import {
  renderInvoiceEmail,
  renderModerationDecisionEmail,
  renderPasswordResetEmail,
  renderPaymentConfirmationEmail,
  renderPaymentFailureEmail,
  renderRegistrationConfirmationEmail,
  renderSavedAdAlertEmail,
  renderSavedSearchAlertEmail,
} from "@/lib/email/react-email-templates";
import { getEmailBrandName } from "@/lib/email/email-market";
import {
  enqueueModerationDecisionEmailJob,
  enqueuePasswordRecoveryEmailJob,
  scheduleQueuedEmailDrain,
} from "@/lib/email/jobs";
import { recordServerAnalyticsEvent } from "@/lib/analytics/server";
import { ADS_CACHE_TAGS } from "@/lib/cache/tags";
import { COMPANY_INFO } from "@/config/company";
import { getBaseUrl } from "@/lib/site-url";
import { getMarketPath, LEGACY_CREATE_LISTING_ROUTE } from "@/lib/routes";
import {
  DEFAULT_MARKET_CODE,
  getMarketConfig,
  isMarketCode,
} from "@/config/markets";
import { assertRuntimeEnvConfigured } from "@/lib/env";
import { sanitizePlainText } from "@/lib/security/sanitize-text";
import { LISTING_LIMITS } from "@/lib/validation/listings";
import { processAlgoliaSyncQueueBestEffort } from "@/lib/algolia/sync-queue";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

export interface AdminStats {
  totalUsers: number;
  totalAds: number;
  activeAds: number;
  pendingModeration: number;
  dealerAccounts: number;
  todayRegistrations: number;
  todayAds: number;
  soldToday: number;
}

export interface RevenueStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalDealerBalanceEur: number;
  stripeRevenue: number;
  stripeStatus?: RevenueStripeStatus;
}

interface RevenueStripeStatus {
  webhookStatus: "healthy" | "degraded" | "idle";
  lastProcessedAt: string | null;
  failedEventsLast24h: number;
  recentEvents: number;
}

export interface PendingAd {
  id: string;
  brand: string;
  model: string;
  seller: string;
  sellerId: string;
  sellerPhone: string | null;
  sellerCreatedAt: string | null;
  photos: number;
  price: number;
  created_at: string;
  status: "pending" | "active";
  reviewType: "submission" | "reported" | "submission_and_reported";
  moderationSubmittedAt: string | null;
  rejectionNote: string | null;
  reportCount: number;
  latestReportAt: string | null;
  reports: Array<{
    id: string;
    category: string;
    details: string;
    created_at: string;
    reporterId: string | null;
  }>;
  flags: string[];
}

export interface AdminListing {
  id: string;
  brand: string;
  model: string;
  brand_id: string | null;
  model_id: string | null;
  year: number | null;
  seller_id: string;
  seller_email: string;
  seller_name: string | null;
  dealer_name: string | null;
  status: string;
  price_eur: number;
  mileage_km: number | null;
  fuel: string | null;
  transmission: string | null;
  body_style: string | null;
  location_city: string | null;
  description: string | null;
  photos: number;
  created_at: string;
  published_at: string | null;
  expires_at: string | null;
}

export interface AdminListingFormOptions {
  sellers: Array<{
    id: string;
    email: string;
    name: string | null;
  }>;
  brands: Array<{
    id: string;
    name: string;
  }>;
  models: Array<{
    id: string;
    brandId: string;
    name: string;
  }>;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  is_dealer: boolean;
  dealer_id: string | null;
  dealer_is_verified: boolean;
  dealer_prepaid_balance_cents: number;
  ad_count: number;
  is_banned: boolean;
  role: "user" | "dealer" | "admin";
}

export interface CreateAdminUserInput {
  email: string;
  fullName?: string | null;
}

export interface UpdateAdminUserInput {
  userId: string;
  email: string;
  fullName?: string | null;
}

export interface AdminUserUpdateResult {
  id: string;
  email: string;
  full_name: string | null;
}

export interface AdminUserImpersonationLink {
  url: string;
  email: string;
  fullName: string | null;
}

export interface SiteSetting {
  key: string;
  value: string;
  updated_at: string;
}

export interface AdminSystemActionResult {
  success: boolean;
  message: string;
  count?: number;
  jobId?: AdminCronJobId;
  label?: string;
  details?: Record<string, unknown>;
}

const ADMIN_CACHE_PATHS = [
  "/",
  "/vysledky",
  "/ceny",
  LEGACY_CREATE_LISTING_ROUTE,
  "/moj-ucet",
  "/dealer",
  "/admin",
  "/admin/today",
  "/admin/ads",
  "/admin/settings",
] as const;

const ADMIN_CRON_JOBS = {
  "expire-ads": {
    label: "Kontrola expirovaných inzerátov",
    path: "/api/cron/expire-ads",
  },
  "sync-algolia": {
    label: "Synchronizácia vyhľadávania",
    path: "/api/cron/sync-algolia",
  },
  "cleanup-sold": {
    label: "Upratanie predaných inzerátov",
    path: "/api/cron/cleanup-sold",
  },
  "send-alerts": {
    label: "Upozornenia k uloženým autám",
    path: "/api/cron/send-alerts",
  },
  "process-email-jobs": {
    label: "Odoslanie čakajúcich e-mailov",
    path: "/api/cron/process-email-jobs",
  },
} as const;

export type AdminCronJobId = keyof typeof ADMIN_CRON_JOBS;

export interface DealerVerificationRequest {
  id: string;
  dealer_id: string;
  dealer_name: string;
  dealer_slug: string;
  owner_email: string;
  request_note: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AdminEmailDelivery {
  id: string;
  email_type: string;
  template_key: string;
  recipient_email: string;
  subject: string;
  status: "sent" | "failed";
  provider: string;
  provider_message_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  html_preview: string | null;
  created_at: string;
}

export interface AdminEmailTemplateExample {
  id: string;
  name: string;
  templateKey: string;
  subject: string;
  html: string;
}

export interface AdminNotification {
  id: string;
  kind: string;
  level: "info" | "warn" | "error" | "critical";
  category: string;
  source: "system";
  title: string;
  description: string;
  createdAt: string;
  requestId: string | null;
}

type AdminEmailDeliveryNotificationRow = {
  id: string;
  email_type: string;
  recipient_email: string;
  subject: string;
  status: "sent" | "failed";
  error_message: string | null;
  created_at: string;
};

type AdminPaymentNotificationRow = {
  id: string;
  transaction_id: string;
  notification_type: string;
  user_email: string;
  email_status: string;
  error_message: string | null;
  created_at: string;
};

type BillingTransactionRow = {
  operation_type?: string | null;
  amount_cents?: number | null;
  actor_user_id?: string | null;
  created_at?: string | null;
  transaction_kind?: string | null;
};

export interface FounderDashboardSummary {
  windowDays: number;
  paidAdsPosted: number;
  previousPaidAdsPosted: number;
  paidFeaturePurchases: number;
  previousPaidFeaturePurchases: number;
  revenueFromAdsAndFeatures: number;
  previousRevenueFromAdsAndFeatures: number;
  listingViews: number;
  previousListingViews: number;
  soldListings: number;
  previousSoldListings: number;
  medianDaysToSale: number | null;
  previousMedianDaysToSale: number | null;
  repeatSellers: number;
  previousRepeatSellers: number;
  repeatPayingSellers: number;
  previousRepeatPayingSellers: number;
  dailySeries: Array<{
    date: string;
    paidAdsPosted: number;
    paidFeaturePurchases: number;
    revenueFromAdsAndFeatures: number;
    listingViews: number;
    soldListings: number;
  }>;
}

type RequireAdminOptions = {
  requireMfa?: boolean;
};

type AdminAuthUserWithBan = {
  id?: string;
  banned_until?: string | null;
};

async function requireAuth(options: RequireAdminOptions = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required");
  await requireRole(user.id, "admin");

  if (options.requireMfa) {
    await assertAdminMfaAssurance(supabase);
  }

  return { userId: user.id, supabase };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function startOfRollingWindow(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseUtcDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return formatUtcDateKey(new Date(parsed));
}

function isFutureBan(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const parsed = Date.parse(bannedUntil);
  return !Number.isNaN(parsed) && parsed > Date.now();
}

const createAdminUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    fullName: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable()
      .transform((value) => {
        const normalized = sanitizePlainText(value || "").replace(/\s+/g, " ");
        return normalized.length > 0 ? normalized : null;
      }),
  })
  .strict();

const updateAdminUserSchema = createAdminUserSchema.extend({
  userId: z.string().trim().min(1),
});

const adminListingStatusSchema = z.enum([
  "draft",
  "pending",
  "active",
  "sold",
  "expired",
  "rejected",
  "banned",
]);

const adminListingFuelSchema = z.enum([
  "petrol",
  "diesel",
  "electric",
  "hybrid",
  "lpg",
  "cng",
  "hydrogen",
]);

const adminListingTransmissionSchema = z.enum(["manual", "automatic"]);

const adminListingBodyStyleSchema = z.enum([
  "sedan",
  "combi",
  "suv",
  "hatchback",
  "coupe",
  "cabriolet",
  "mpv",
  "pickup",
  "commercial",
]);

function normalizeAdminRequiredText(value: string) {
  return sanitizePlainText(value).replace(/\s+/g, " ").trim();
}

function normalizeAdminOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = sanitizePlainText(value)
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

const createAdminListingForUserSchema = z
  .object({
    sellerId: z.string().uuid(),
    brandId: z.string().uuid(),
    modelId: z.string().uuid(),
    year: z
      .number()
      .int()
      .min(LISTING_LIMITS.yearMin)
      .max(LISTING_LIMITS.yearMax),
    priceEur: z
      .number()
      .int()
      .min(LISTING_LIMITS.priceMin)
      .max(LISTING_LIMITS.priceMax),
    mileageKm: z
      .number()
      .int()
      .min(LISTING_LIMITS.mileageMin)
      .max(LISTING_LIMITS.mileageMax),
    fuel: adminListingFuelSchema,
    transmission: adminListingTransmissionSchema,
    bodyStyle: adminListingBodyStyleSchema,
    locationCity: z
      .string()
      .transform((value) => normalizeAdminRequiredText(value))
      .refine(
        (value) => value.length > 0 && value.length <= LISTING_LIMITS.cityMaxLength,
        "Mesto je povinné.",
      ),
    locationDistrict: z
      .string()
      .optional()
      .nullable()
      .transform((value) => normalizeAdminOptionalText(value))
      .refine(
        (value) =>
          value === null || value.length <= LISTING_LIMITS.districtMaxLength,
        "Okres je príliš dlhý.",
      ),
    description: z
      .string()
      .optional()
      .nullable()
      .transform((value) => normalizeAdminOptionalText(value))
      .refine(
        (value) =>
          value === null || value.length <= LISTING_LIMITS.descriptionMaxLength,
        "Popis je príliš dlhý.",
      ),
  })
  .strict();

const updateAdminListingSchema = z
  .object({
    adId: z.string().uuid(),
    priceEur: z
      .number()
      .int()
      .min(LISTING_LIMITS.priceMin)
      .max(LISTING_LIMITS.priceMax),
    mileageKm: z
      .number()
      .int()
      .min(LISTING_LIMITS.mileageMin)
      .max(LISTING_LIMITS.mileageMax),
    description: z
      .string()
      .optional()
      .nullable()
      .transform((value) => normalizeAdminOptionalText(value))
      .refine(
        (value) =>
          value === null || value.length <= LISTING_LIMITS.descriptionMaxLength,
        "Popis je príliš dlhý.",
      ),
    status: adminListingStatusSchema.optional(),
  })
  .strict();

const bulkUpdateAdminListingsSchema = z
  .object({
    adIds: z.array(z.string().uuid()).min(1).max(100),
    status: adminListingStatusSchema,
  })
  .strict();

export type CreateAdminListingForUserInput = z.input<
  typeof createAdminListingForUserSchema
>;
export type UpdateAdminListingInput = z.input<typeof updateAdminListingSchema>;
export type BulkUpdateAdminListingsInput = z.input<
  typeof bulkUpdateAdminListingsSchema
>;
export type AdminListingStatus = z.infer<typeof adminListingStatusSchema>;

function buildAdminPasswordResetUrl(tokenHash: string): string {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: "recovery",
  });

  return `${getBaseUrl()}/auth/reset-password?${params.toString()}`;
}

async function getSiteAdminIds(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<Set<string>> {
  const { data, error } = await adminClient
    .from("site_admins")
    .select("user_id");

  if (error) {
    throw new Error(error.message);
  }

  return new Set(((data as Array<{ user_id: string }> | null) || []).map((row) => row.user_id));
}

async function getBannedAuthUserIds(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  userIds: string[],
) {
  const remainingIds = new Set(userIds);
  const bannedIds = new Set<string>();
  const perPage = 1000;

  for (let page = 1; page <= 10 && remainingIds.size > 0; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const users = ((data?.users || []) as AdminAuthUserWithBan[]);
    for (const authUser of users) {
      if (!authUser.id || !remainingIds.has(authUser.id)) continue;
      remainingIds.delete(authUser.id);
      if (isFutureBan(authUser.banned_until)) {
        bannedIds.add(authUser.id);
      }
    }

    if (users.length < perPage) {
      break;
    }
  }

  for (const userId of remainingIds) {
    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (error) {
      throw new Error(error.message);
    }

    const authUser = data?.user as AdminAuthUserWithBan | null | undefined;
    if (isFutureBan(authUser?.banned_until)) {
      bannedIds.add(userId);
    }
  }

  return bannedIds;
}

function revalidateAdSurfaces() {
  for (const tag of ADS_CACHE_TAGS) {
    revalidateTag(tag, "max");
  }
}

function requireAdminServiceClient() {
  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("Server nie je nakonfigurovaný.");
  }
  return adminClient;
}

async function processAdminAlgoliaSyncQueue() {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return;
  }

  await processAlgoliaSyncQueueBestEffort({ supabase: adminClient });
}

function revalidateAdminAds() {
  revalidateAdSurfaces();
  revalidatePath("/admin");
  revalidatePath("/admin/ads");
}

function revalidateAdminCacheSurfaces() {
  revalidateAdSurfaces();
  for (const path of ADMIN_CACHE_PATHS) {
    revalidatePath(path);
  }
}

async function readActionResponseJson(response: Response) {
  try {
    const value = await response.json();
    return asRecord(value) ?? {};
  } catch {
    return {};
  }
}

function getActionResponseMessage(
  payload: Record<string, unknown>,
  fallback: string,
) {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

async function recordAdminSystemAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action,
    target_type: "system",
    target_id: targetId,
    details,
    created_at: new Date().toISOString(),
  });
}

function buildAdminListingStatusUpdate(
  status: AdminListingStatus,
  adminId: string,
  nowIso: string,
) {
  const update: Record<string, string | null> = {
    status,
    updated_at: nowIso,
  };

  if (status === "active") {
    update.published_at = nowIso;
    update.expires_at = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    update.moderation_reviewed_at = nowIso;
    update.moderation_reviewed_by = adminId;
    update.moderation_rejection_note = null;
  }

  if (status === "pending") {
    update.published_at = null;
    update.expires_at = null;
    update.moderation_submitted_at = nowIso;
  }

  if (status === "draft") {
    update.published_at = null;
    update.expires_at = null;
  }

  if (status === "rejected" || status === "banned") {
    update.published_at = null;
    update.expires_at = null;
    update.moderation_reviewed_at = nowIso;
    update.moderation_reviewed_by = adminId;
  }

  if (status === "sold") {
    update.sold_at = nowIso;
  }

  if (status === "expired") {
    update.expires_at = nowIso;
  }

  return update;
}

async function resolveAdminListingReferences(params: {
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>;
  sellerId: string;
  brandId: string;
  modelId: string;
}) {
  const [sellerResult, brandResult, modelResult, dealerResult] = await Promise.all([
    params.adminClient
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", params.sellerId)
      .maybeSingle(),
    params.adminClient
      .from("brands")
      .select("id, name")
      .eq("id", params.brandId)
      .maybeSingle(),
    params.adminClient
      .from("models")
      .select("id, name, brand_id")
      .eq("id", params.modelId)
      .maybeSingle(),
    params.adminClient
      .from("dealers")
      .select("id")
      .eq("owner_id", params.sellerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (sellerResult.error) {
    throw new Error(sellerResult.error.message);
  }
  if (brandResult.error) {
    throw new Error(brandResult.error.message);
  }
  if (modelResult.error) {
    throw new Error(modelResult.error.message);
  }
  if (dealerResult.error) {
    throw new Error(dealerResult.error.message);
  }

  const seller = sellerResult.data as { id?: string } | null;
  const brand = brandResult.data as { name?: string | null } | null;
  const model = modelResult.data as {
    name?: string | null;
    brand_id?: string | null;
  } | null;
  const dealer = dealerResult.data as { id?: string | null } | null;

  if (!seller?.id) {
    throw new Error("Predajca sa nenašiel.");
  }
  if (!brand?.name) {
    throw new Error("Značka sa nenašla.");
  }
  if (!model?.name || model.brand_id !== params.brandId) {
    throw new Error("Model nepatrí k vybranej značke.");
  }

  return {
    brandName: brand.name,
    modelName: model.name,
    dealerId: dealer?.id || null,
  };
}

const STRIPE_LOG_PAGE_SIZE = 1000;
const STRIPE_LOG_MAX_PAGES = 50;

type CheckoutLogRow = {
  processed_at: string | null;
  metadata: unknown;
};

async function fetchProcessedCheckoutLogs(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ProcessedCheckoutLog[]> {
  const logs: ProcessedCheckoutLog[] = [];

  for (let page = 0; page < STRIPE_LOG_MAX_PAGES; page += 1) {
    const from = page * STRIPE_LOG_PAGE_SIZE;
    const to = from + STRIPE_LOG_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("stripe_webhook_logs")
      .select("processed_at, metadata")
      .in("event_type", [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ])
      .eq("status", "processed")
      .order("processed_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data as CheckoutLogRow[] | null) || [];
    logs.push(
      ...rows.map((row) => ({
        processedAt: row.processed_at,
        metadata: row.metadata,
      })),
    );

    if (rows.length < STRIPE_LOG_PAGE_SIZE) {
      break;
    }
  }

  return logs;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { supabase } = await requireAuth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [
    { count: totalUsers },
    { count: totalAds },
    { count: activeAds },
    { count: pendingCount },
    { count: dealerCount },
    { count: todayRegs },
    { count: todayAdsCount },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("ads").select("id", { count: "exact", head: true }),
    supabase
      .from("ads")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("ads")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("dealers")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("ads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
  ]);

  return {
    totalUsers: totalUsers || 0,
    totalAds: totalAds || 0,
    activeAds: activeAds || 0,
    pendingModeration: pendingCount || 0,
    dealerAccounts: dealerCount || 0,
    todayRegistrations: todayRegs || 0,
    todayAds: todayAdsCount || 0,
    soldToday: 0,
  };
}

export async function getFounderDashboardSummary(days = 30): Promise<FounderDashboardSummary> {
  const { supabase } = await requireAuth();
  const now = new Date();
  const windowDays = [7, 30, 90].includes(days) ? days : 30;
  const currentStart = startOfRollingWindow(now, windowDays);
  const previousStart = startOfRollingWindow(currentStart, windowDays);
  const currentStartIso = currentStart.toISOString();
  const previousStartIso = previousStart.toISOString();
  const processedCheckoutLogsPromise = fetchProcessedCheckoutLogs(supabase);

  const [
    { data: monthlyTransactions, error: transactionsError },
    { data: publishedAdsRows, error: publishedAdsError },
    { data: monthlySoldAds, error: soldError },
    { data: sellerAds, error: sellerAdsError },
    { data: topUpHistoryRows, error: topUpHistoryError },
    { data: analyticsEvents, error: analyticsEventsError },
    processedCheckoutLogs,
  ] = await Promise.all([
    supabase
      .from("billing_transactions")
      .select("operation_type, amount_cents, actor_user_id, created_at, transaction_kind")
      .gte("created_at", previousStartIso),
    supabase
      .from("ads")
      .select("published_at")
      .not("published_at", "is", null)
      .gte("published_at", previousStartIso),
    supabase
      .from("ads")
      .select("published_at, sold_at")
      .not("sold_at", "is", null)
      .gte("sold_at", previousStartIso),
    supabase
      .from("ads")
      .select("seller_id, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("billing_transactions")
      .select("actor_user_id, created_at, transaction_kind")
      .in("transaction_kind", ["dealer_topup", "private_listing_purchase"])
      .gt("amount_cents", 0),
    supabase
      .from("analytics_events")
      .select("event_name, created_at")
      .gte("created_at", previousStartIso),
    processedCheckoutLogsPromise,
  ]);

  if (transactionsError) throw new Error(transactionsError.message);
  if (publishedAdsError) throw new Error(publishedAdsError.message);
  if (soldError) throw new Error(soldError.message);
  if (sellerAdsError) throw new Error(sellerAdsError.message);
  if (topUpHistoryError) throw new Error(topUpHistoryError.message);
  if (analyticsEventsError) throw new Error(analyticsEventsError.message);

  const paidFeatureActionTypes = new Set([
    "publish_premium",
    "publish_top",
    "prolong_premium",
    "prolong_top",
  ]);

  const monthlyRows =
    (monthlyTransactions as BillingTransactionRow[] | null) || [];
  const publishedRows =
    (publishedAdsRows as { published_at?: string | null }[] | null) || [];
  const soldRows =
    (monthlySoldAds as {
      published_at?: string | null;
      sold_at?: string | null;
    }[] | null) || [];
  const sellerAdRows =
    (sellerAds as { seller_id?: string | null; created_at?: string | null }[] | null) || [];
  const topUpHistory =
    ((topUpHistoryRows as BillingTransactionRow[] | null) || []).filter(
      (row) =>
        row.transaction_kind === "dealer_topup" ||
        row.transaction_kind === "private_listing_purchase",
    );
  const analyticsEventRows =
    (analyticsEvents as { event_name?: string | null; created_at?: string | null }[] | null) || [];

  const isCurrentWindow = (iso: string | null | undefined) =>
    Boolean(iso && iso >= currentStartIso);
  const isPreviousWindow = (iso: string | null | undefined) =>
    Boolean(iso && iso >= previousStartIso && iso < currentStartIso);

  const paidAdsPosted = publishedRows.filter(
    (row) => isCurrentWindow(row.published_at),
  ).length;
  const previousPaidAdsPosted = publishedRows.filter(
    (row) => isPreviousWindow(row.published_at),
  ).length;

  const paidFeaturePurchases = monthlyRows.filter(
    (row) =>
      paidFeatureActionTypes.has(row.operation_type || "") &&
      isCurrentWindow(row.created_at),
  ).length;
  const previousPaidFeaturePurchases = monthlyRows.filter(
    (row) =>
      paidFeatureActionTypes.has(row.operation_type || "") &&
      isPreviousWindow(row.created_at),
  ).length;

  let revenueFromAdsAndFeatures = 0;
  let previousRevenueFromAdsAndFeatures = 0;

  for (const log of processedCheckoutLogs) {
    if (!log.processedAt) {
      continue;
    }

    const amountEur = extractCheckoutAmountEur(log.metadata);
    if (amountEur === null) {
      continue;
    }

    if (isCurrentWindow(log.processedAt)) {
      revenueFromAdsAndFeatures += amountEur;
      continue;
    }

    if (isPreviousWindow(log.processedAt)) {
      previousRevenueFromAdsAndFeatures += amountEur;
    }
  }

  revenueFromAdsAndFeatures = Number(revenueFromAdsAndFeatures.toFixed(2));
  previousRevenueFromAdsAndFeatures = Number(
    previousRevenueFromAdsAndFeatures.toFixed(2),
  );

  const listingViews = analyticsEventRows.filter(
    (row) => row.event_name === "listing_viewed" && isCurrentWindow(row.created_at),
  ).length;
  const previousListingViews = analyticsEventRows.filter(
    (row) => row.event_name === "listing_viewed" && isPreviousWindow(row.created_at),
  ).length;

  const soldListings = soldRows.filter((row) => isCurrentWindow(row.sold_at)).length;
  const previousSoldListings = soldRows.filter((row) =>
    isPreviousWindow(row.sold_at),
  ).length;

  const currentDaysToSaleValues = soldRows.flatMap((row) => {
    if (!row.published_at || !row.sold_at) return [];
    const publishedMs = Date.parse(row.published_at);
    const confirmedMs = Date.parse(row.sold_at);
    if (
      Number.isNaN(publishedMs) ||
      Number.isNaN(confirmedMs) ||
      confirmedMs < publishedMs ||
      !isCurrentWindow(row.sold_at)
    ) {
      return [];
    }
    return [(confirmedMs - publishedMs) / (1000 * 60 * 60 * 24)];
  });
  const previousDaysToSaleValues = soldRows.flatMap((row) => {
    if (!row.published_at || !row.sold_at) return [];
    const publishedMs = Date.parse(row.published_at);
    const confirmedMs = Date.parse(row.sold_at);
    if (
      Number.isNaN(publishedMs) ||
      Number.isNaN(confirmedMs) ||
      confirmedMs < publishedMs ||
      !isPreviousWindow(row.sold_at)
    ) {
      return [];
    }
    return [(confirmedMs - publishedMs) / (1000 * 60 * 60 * 24)];
  });

  const currentWindowSellers = new Set(
    sellerAdRows
      .filter((row) => row.created_at && row.created_at >= currentStartIso && row.seller_id)
      .map((row) => row.seller_id as string),
  );
  const priorSellers = new Set(
    sellerAdRows
      .filter((row) => row.created_at && row.created_at < currentStartIso && row.seller_id)
      .map((row) => row.seller_id as string),
  );
  const repeatSellers = Array.from(currentWindowSellers).filter((sellerId) =>
    priorSellers.has(sellerId),
  ).length;

  const previousWindowSellers = new Set(
    sellerAdRows
      .filter(
        (row) =>
          row.created_at &&
          row.created_at >= previousStartIso &&
          row.created_at < currentStartIso &&
          row.seller_id,
      )
      .map((row) => row.seller_id as string),
  );
  const olderSellers = new Set(
    sellerAdRows
      .filter((row) => row.created_at && row.created_at < previousStartIso && row.seller_id)
      .map((row) => row.seller_id as string),
  );
  const previousRepeatSellers = Array.from(previousWindowSellers).filter((sellerId) =>
    olderSellers.has(sellerId),
  ).length;

  const currentWindowPayers = new Set(
    topUpHistory
      .filter(
        (row) =>
          row.created_at &&
          row.created_at >= currentStartIso &&
          row.actor_user_id,
      )
      .map((row) => row.actor_user_id as string),
  );
  const priorPayers = new Set(
    topUpHistory
      .filter(
        (row) =>
          row.created_at &&
          row.created_at < currentStartIso &&
          row.actor_user_id,
      )
      .map((row) => row.actor_user_id as string),
  );
  const repeatPayingSellers = Array.from(currentWindowPayers).filter((userId) =>
    priorPayers.has(userId),
  ).length;

  const previousWindowPayers = new Set(
    topUpHistory
      .filter(
        (row) =>
          row.created_at &&
          row.created_at >= previousStartIso &&
          row.created_at < currentStartIso &&
          row.actor_user_id,
      )
      .map((row) => row.actor_user_id as string),
  );
  const olderPayers = new Set(
    topUpHistory
      .filter(
        (row) =>
          row.created_at &&
          row.created_at < previousStartIso &&
          row.actor_user_id,
      )
      .map((row) => row.actor_user_id as string),
  );
  const previousRepeatPayingSellers = Array.from(previousWindowPayers).filter((userId) =>
    olderPayers.has(userId),
  ).length;

  const dailySeriesMap = new Map<
    string,
    {
      date: string;
      paidAdsPosted: number;
      paidFeaturePurchases: number;
      revenueFromAdsAndFeatures: number;
      listingViews: number;
      soldListings: number;
    }
  >();

  for (let index = windowDays - 1; index >= 0; index -= 1) {
    const day = new Date(now.getTime() - index * 24 * 60 * 60 * 1000);
    const dateKey = formatUtcDateKey(day);
    dailySeriesMap.set(dateKey, {
      date: dateKey,
      paidAdsPosted: 0,
      paidFeaturePurchases: 0,
      revenueFromAdsAndFeatures: 0,
      listingViews: 0,
      soldListings: 0,
    });
  }

  for (const row of publishedRows) {
    if (!isCurrentWindow(row.published_at)) continue;
    const dateKey = parseUtcDateKey(row.published_at);
    if (!dateKey) continue;
    const current = dailySeriesMap.get(dateKey);
    if (!current) continue;

    current.paidAdsPosted += 1;
  }

  for (const row of monthlyRows) {
    if (!isCurrentWindow(row.created_at)) continue;
    const dateKey = parseUtcDateKey(row.created_at);
    if (!dateKey) continue;
    const current = dailySeriesMap.get(dateKey);
    if (!current) continue;

    if (paidFeatureActionTypes.has(row.operation_type || "")) {
      current.paidFeaturePurchases += 1;
    }
  }

  for (const log of processedCheckoutLogs) {
    if (!isCurrentWindow(log.processedAt)) continue;

    const amountEur = extractCheckoutAmountEur(log.metadata);
    if (amountEur === null) continue;

    const dateKey = parseUtcDateKey(log.processedAt);
    if (!dateKey) continue;
    const current = dailySeriesMap.get(dateKey);
    if (!current) continue;
    current.revenueFromAdsAndFeatures = Number(
      (current.revenueFromAdsAndFeatures + amountEur).toFixed(2),
    );
  }

  for (const row of analyticsEventRows) {
    if (!isCurrentWindow(row.created_at)) continue;
    if (row.event_name !== "listing_viewed") continue;
    const dateKey = parseUtcDateKey(row.created_at);
    if (!dateKey) continue;
    const current = dailySeriesMap.get(dateKey);
    if (!current) continue;
    current.listingViews += 1;
  }

  for (const row of soldRows) {
    if (!isCurrentWindow(row.sold_at)) continue;
    const dateKey = parseUtcDateKey(row.sold_at);
    if (!dateKey) continue;
    const current = dailySeriesMap.get(dateKey);
    if (!current) continue;
    current.soldListings += 1;
  }

  return {
    windowDays,
    paidAdsPosted,
    previousPaidAdsPosted,
    paidFeaturePurchases,
    previousPaidFeaturePurchases,
    revenueFromAdsAndFeatures,
    previousRevenueFromAdsAndFeatures,
    listingViews,
    previousListingViews,
    soldListings,
    previousSoldListings,
    medianDaysToSale: calculateMedian(currentDaysToSaleValues),
    previousMedianDaysToSale: calculateMedian(previousDaysToSaleValues),
    repeatSellers,
    previousRepeatSellers,
    repeatPayingSellers,
    previousRepeatPayingSellers,
    dailySeries: Array.from(dailySeriesMap.values()),
  };
}

export async function getRevenueStats(): Promise<RevenueStats> {
  const { supabase } = await requireAuth();
  const now = new Date();
  const last24HoursIso = new Date(
    now.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const processedCheckoutLogsPromise = fetchProcessedCheckoutLogs(supabase);

  const [
    { data: dealers },
    { data: latestWebhook },
    { count: failedWebhooksCount },
    { count: recentWebhooksCount },
    processedCheckoutLogs,
  ] = await Promise.all([
    supabase.from("dealers").select("prepaid_balance_cents"),
    supabase
      .from("stripe_webhook_logs")
      .select("processed_at")
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stripe_webhook_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("processed_at", last24HoursIso),
    supabase
      .from("stripe_webhook_logs")
      .select("id", { count: "exact", head: true })
      .gte("processed_at", last24HoursIso),
    processedCheckoutLogsPromise,
  ]);

  const totalDealerBalanceEur = (dealers || []).reduce(
    (sum, dealer) => sum + (dealer.prepaid_balance_cents || 0) / 100,
    0,
  );
  const revenueTotals = calculateStripeRevenueTotals(processedCheckoutLogs, now);

  const failedEventsLast24h = failedWebhooksCount || 0;
  const recentEvents = recentWebhooksCount || 0;
  const stripeStatus: RevenueStripeStatus = {
    webhookStatus:
      recentEvents === 0 && !latestWebhook?.processed_at
        ? "idle"
        : failedEventsLast24h > 0
          ? "degraded"
          : "healthy",
    lastProcessedAt: latestWebhook?.processed_at || null,
    failedEventsLast24h,
    recentEvents,
  };

  return {
    today: revenueTotals.today,
    thisWeek: revenueTotals.thisWeek,
    thisMonth: revenueTotals.thisMonth,
    totalDealerBalanceEur,
    stripeRevenue: revenueTotals.total,
    stripeStatus,
  };
}

export async function getPendingAds(): Promise<PendingAd[]> {
  const { supabase } = await requireAuth();
  const [{ data: pendingAdsData, error: pendingAdsError }, { data: openReportsData, error: openReportsError }] =
    await Promise.all([
      supabase
        .from("ads")
        .select(
          `
          id,
          status,
          price_eur,
          photos_json,
          created_at,
          description,
          moderation_submitted_at,
          moderation_rejection_note,
          brands:brand_id (name),
          models:model_id (name),
          profiles:seller_id (id, email, phone, created_at)
        `,
        )
        .eq("status", "pending")
        .order("moderation_submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("listing_reports")
        .select("id, ad_id, category, details, created_at, reporter_id")
        .in("status", ["open", "reviewing"])
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  if (pendingAdsError) {
    throw new Error(pendingAdsError.message);
  }

  if (openReportsError) {
    throw new Error(openReportsError.message);
  }

  const pendingRows = (pendingAdsData as Record<string, unknown>[] | null) || [];
  const openReports =
    ((openReportsData as {
      id: string;
      ad_id: string;
      category: string;
      details: string;
      created_at: string;
      reporter_id: string | null;
    }[] | null) || []);

  const reportMap = new Map<string, typeof openReports>();
  for (const report of openReports) {
    const reports = reportMap.get(report.ad_id) || [];
    reports.push(report);
    reportMap.set(report.ad_id, reports);
  }

  const reportOnlyAdIds = [...new Set(openReports.map((report) => report.ad_id))].filter(
    (adId) => !pendingRows.some((ad) => ad.id === adId),
  );

  let reportedAdsRows: Record<string, unknown>[] = [];
  if (reportOnlyAdIds.length > 0) {
    const { data: reportedAdsData, error: reportedAdsError } = await supabase
      .from("ads")
      .select(
        `
        id,
        status,
        price_eur,
        photos_json,
        created_at,
        description,
        moderation_submitted_at,
        moderation_rejection_note,
        brands:brand_id (name),
        models:model_id (name),
        profiles:seller_id (id, email, phone, created_at)
      `,
      )
      .in("id", reportOnlyAdIds)
      .order("created_at", { ascending: false });

    if (reportedAdsError) {
      throw new Error(reportedAdsError.message);
    }

    reportedAdsRows = (reportedAdsData as Record<string, unknown>[] | null) || [];
  }

  const combinedRows = [...pendingRows, ...reportedAdsRows];
  if (combinedRows.length === 0) return [];

  const sellerIds = [...new Set(
    combinedRows
      .map((ad) => {
        const profile = ad.profiles as { id?: string } | null;
        return profile?.id || null;
      })
      .filter((value): value is string => Boolean(value)),
  )];

  const { data: sellerAdsData, error: sellerAdsError } = await supabase
    .from("ads")
    .select("seller_id, status")
    .in("seller_id", sellerIds);

  if (sellerAdsError) {
    throw new Error(sellerAdsError.message);
  }

  const sellerStats = new Map<
    string,
    { active: number; pending: number; rejected: number; total: number }
  >();

  for (const row of ((sellerAdsData as { seller_id: string; status: string }[] | null) || [])) {
    const current = sellerStats.get(row.seller_id) || {
      active: 0,
      pending: 0,
      rejected: 0,
      total: 0,
    };
    current.total += 1;
    if (row.status === "active") current.active += 1;
    if (row.status === "pending") current.pending += 1;
    if (row.status === "rejected") current.rejected += 1;
    sellerStats.set(row.seller_id, current);
  }

  return combinedRows.map((ad) => {
    const brands = ad.brands as { name?: string } | null;
    const models = ad.models as { name?: string } | null;
    const profile = ad.profiles as {
      id?: string;
      email?: string;
      phone?: string | null;
      created_at?: string | null;
    } | null;
    const photos = ad.photos_json as string[] | null;
    const sellerId = profile?.id || "";
    const sellerSummary = sellerStats.get(sellerId) || {
      active: 0,
      pending: 0,
      rejected: 0,
      total: 0,
    };
    const reports = reportMap.get((ad.id as string) || "") || [];
    const reportCount = reports.length;
    const reviewType =
      (ad.status as string) === "pending"
        ? reportCount > 0
          ? "submission_and_reported"
          : "submission"
        : "reported";

    const sellerCreatedAt = profile?.created_at || null;
    const sellerAgeDays = sellerCreatedAt
      ? Math.floor(
          (Date.now() - new Date(sellerCreatedAt).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    const flags: string[] = [];
    if (reportCount > 0) flags.push("reported");
    if (reportCount >= 3) flags.push("multiple_reports");
    if (sellerAgeDays !== null && sellerAgeDays <= 7) flags.push("new_seller");
    if (((ad.price_eur as number) || 0) >= 40000) flags.push("high_value");
    if ((photos?.length || 0) < 2) flags.push("low_photos");
    if (!profile?.phone) flags.push("no_phone");
    if (sellerSummary.rejected >= 2) flags.push("seller_rejections");
    if (typeof ad.description === "string" && ad.description.length > 1600) {
      flags.push("long_description");
    }
    if (
      typeof ad.description === "string" &&
      /(whatsapp|telegram|western union|wire transfer|crypto|gift card|prepayment|deposit in advance)/i.test(
        ad.description,
      )
    ) {
      flags.push("suspicious_terms");
    }
    if (
      typeof ad.description === "string" &&
      /(https?:\/\/|www\.|@gmail\.|@hotmail\.|@outlook\.)/i.test(ad.description)
    ) {
      flags.push("external_contact");
    }
    if (typeof ad.description === "string" && /([!?.,])\1{4,}/.test(ad.description)) {
      flags.push("excessive_characters");
    }

    return {
      id: ad.id as string,
      brand: brands?.name || "Neznáma",
      model: models?.name || "Model",
      seller: profile?.email || "N/A",
      sellerId,
      sellerPhone: profile?.phone || null,
      sellerCreatedAt,
      photos: photos?.length || 0,
      price: (ad.price_eur as number) || 0,
      created_at: ad.created_at as string,
      status: ((ad.status as string) === "pending" ? "pending" : "active") as
        | "pending"
        | "active",
      reviewType,
      moderationSubmittedAt: (ad.moderation_submitted_at as string | null) || null,
      rejectionNote: (ad.moderation_rejection_note as string | null) || null,
      reportCount,
      latestReportAt: reports[0]?.created_at || null,
      reports: reports.map((report) => ({
        id: report.id,
        category: report.category,
        details: report.details,
        created_at: report.created_at,
        reporterId: report.reporter_id,
      })),
      flags,
    };
  });
}

export async function getAdminListings(limit = 100): Promise<AdminListing[]> {
  const { supabase } = await requireAuth();
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const { data, error } = await supabase
    .from("ads")
    .select(
      `
      id,
      brand,
      model,
      brand_id,
      model_id,
      year,
      seller_id,
      status,
      price_eur,
      mileage_km,
      fuel,
      transmission,
      body_style,
      location_city,
      description,
      photos_json,
      created_at,
      published_at,
      expires_at,
      profiles:seller_id (email, full_name),
      dealers:dealer_id (name)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Record<string, unknown>[] | null) || []).map((row) => {
    const profile = row.profiles as
      | { email?: string | null; full_name?: string | null }
      | null;
    const dealer = row.dealers as { name?: string | null } | null;
    const photos = Array.isArray(row.photos_json) ? row.photos_json : [];

    return {
      id: row.id as string,
      brand: (row.brand as string | null) || "Neznáma značka",
      model: (row.model as string | null) || "Model",
      brand_id: (row.brand_id as string | null) || null,
      model_id: (row.model_id as string | null) || null,
      year: typeof row.year === "number" ? row.year : null,
      seller_id: row.seller_id as string,
      seller_email: profile?.email || "bez emailu",
      seller_name: profile?.full_name || null,
      dealer_name: dealer?.name || null,
      status: (row.status as string | null) || "draft",
      price_eur: Number(row.price_eur || 0),
      mileage_km:
        typeof row.mileage_km === "number" ? row.mileage_km : null,
      fuel: (row.fuel as string | null) || null,
      transmission: (row.transmission as string | null) || null,
      body_style: (row.body_style as string | null) || null,
      location_city: (row.location_city as string | null) || null,
      description: (row.description as string | null) || null,
      photos: photos.length,
      created_at: row.created_at as string,
      published_at: (row.published_at as string | null) || null,
      expires_at: (row.expires_at as string | null) || null,
    };
  });
}

export async function getAdminListingFormOptions(): Promise<AdminListingFormOptions> {
  const { supabase } = await requireAuth();

  const [sellersResult, brandsResult, modelsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .order("email", { ascending: true })
      .limit(500),
    supabase
      .from("brands")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("models")
      .select("id, name, brand_id")
      .order("name", { ascending: true }),
  ]);

  if (sellersResult.error) {
    throw new Error(sellersResult.error.message);
  }
  if (brandsResult.error) {
    throw new Error(brandsResult.error.message);
  }
  if (modelsResult.error) {
    throw new Error(modelsResult.error.message);
  }

  return {
    sellers: ((sellersResult.data as Record<string, unknown>[] | null) || [])
      .filter((seller) => typeof seller.id === "string" && typeof seller.email === "string")
      .map((seller) => ({
        id: seller.id as string,
        email: seller.email as string,
        name: (seller.full_name as string | null) || null,
      })),
    brands: ((brandsResult.data as Record<string, unknown>[] | null) || [])
      .filter((brand) => typeof brand.id === "string" && typeof brand.name === "string")
      .map((brand) => ({
        id: brand.id as string,
        name: brand.name as string,
      })),
    models: ((modelsResult.data as Record<string, unknown>[] | null) || [])
      .filter(
        (model) =>
          typeof model.id === "string" &&
          typeof model.brand_id === "string" &&
          typeof model.name === "string",
      )
      .map((model) => ({
        id: model.id as string,
        brandId: model.brand_id as string,
        name: model.name as string,
      })),
  };
}

export async function createAdminListingForUser(
  input: CreateAdminListingForUserInput,
) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const parsed = createAdminListingForUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Neplatné údaje inzerátu.");
  }

  const adminClient = requireAdminServiceClient();
  const nowIso = new Date().toISOString();
  const references = await resolveAdminListingReferences({
    adminClient,
    sellerId: parsed.data.sellerId,
    brandId: parsed.data.brandId,
    modelId: parsed.data.modelId,
  });

  const { data, error } = await adminClient
    .from("ads")
    .insert({
      seller_id: parsed.data.sellerId,
      dealer_id: references.dealerId,
      brand_id: parsed.data.brandId,
      model_id: parsed.data.modelId,
      brand: references.brandName,
      model: references.modelName,
      year: parsed.data.year,
      price_eur: parsed.data.priceEur,
      mileage_km: parsed.data.mileageKm,
      fuel: parsed.data.fuel,
      transmission: parsed.data.transmission,
      body_style: parsed.data.bodyStyle,
      location_city: parsed.data.locationCity,
      location_district: parsed.data.locationDistrict,
      description: parsed.data.description,
      photos_json: [],
      equipment_json: [],
      status: "draft",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "Inzerát sa nepodarilo vytvoriť.");
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: "create_ad",
    target_type: "ad",
    target_id: data.id,
    details: {
      sellerId: parsed.data.sellerId,
      status: "draft",
    },
    created_at: nowIso,
  });

  await processAdminAlgoliaSyncQueue();
  revalidateAdminAds();
  return { success: true, adId: data.id as string };
}

export async function updateAdminListing(input: UpdateAdminListingInput) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const parsed = updateAdminListingSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Neplatné údaje inzerátu.");
  }

  const adminClient = requireAdminServiceClient();
  const nowIso = new Date().toISOString();
  const statusUpdate = parsed.data.status
    ? buildAdminListingStatusUpdate(parsed.data.status, userId, nowIso)
    : {};

  const { error } = await adminClient
    .from("ads")
    .update({
      ...statusUpdate,
      price_eur: parsed.data.priceEur,
      mileage_km: parsed.data.mileageKm,
      description: parsed.data.description,
      updated_at: nowIso,
    })
    .eq("id", parsed.data.adId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: "update_ad",
    target_type: "ad",
    target_id: parsed.data.adId,
    details: {
      priceEur: parsed.data.priceEur,
      mileageKm: parsed.data.mileageKm,
      status: parsed.data.status || null,
    },
    created_at: nowIso,
  });

  await processAdminAlgoliaSyncQueue();
  revalidateAdminAds();
  return { success: true };
}

export async function bulkUpdateAdminListings(
  input: BulkUpdateAdminListingsInput,
) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const parsed = bulkUpdateAdminListingsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Vyberte aspoň jeden inzerát.");
  }

  const adIds = Array.from(new Set(parsed.data.adIds));
  const adminClient = requireAdminServiceClient();
  const nowIso = new Date().toISOString();
  const update = buildAdminListingStatusUpdate(parsed.data.status, userId, nowIso);

  const { error } = await adminClient
    .from("ads")
    .update(update)
    .in("id", adIds);

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: "bulk_update_ads",
    target_type: "ad",
    target_id: null,
    details: {
      count: adIds.length,
      status: parsed.data.status,
      adIds,
    },
    created_at: nowIso,
  });

  await processAdminAlgoliaSyncQueue();
  revalidateAdminAds();
  return { success: true, count: adIds.length };
}

export async function approveAd(adId: string) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const nowIso = new Date().toISOString();
  const { data: currentAd, error: currentAdError } = await supabase
    .from("ads")
    .select("status, published_at, expires_at, brand, model, seller_id, dealer_id, market_code")
    .eq("id", adId)
    .single();

  if (currentAdError || !currentAd) {
    throw new Error(currentAdError?.message || "Ad not found");
  }

  const adMarketCode = isMarketCode(currentAd.market_code)
    ? currentAd.market_code
    : DEFAULT_MARKET_CODE;
  const dashboardUrl = `${getMarketConfig(adMarketCode).origin}${getMarketPath(
    "/moj-ucet?tab=ads",
    adMarketCode,
  )}`;

  const shouldActivate = currentAd.status !== "active";
  const expiresAtIso = shouldActivate
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : currentAd.expires_at;

  const { error } = await supabase
    .from("ads")
    .update({
      status: "active",
      published_at: shouldActivate ? nowIso : currentAd.published_at,
      expires_at: expiresAtIso,
      moderation_reviewed_at: nowIso,
      moderation_reviewed_by: userId,
      moderation_rejection_note: null,
      updated_at: nowIso,
    })
    .eq("id", adId);

  if (error) throw new Error(error.message);

  const { error: reportsError } = await supabase
    .from("listing_reports")
    .update({
      status: "dismissed",
      reviewed_at: nowIso,
      reviewed_by: userId,
      resolution_note: "Approved during moderation review.",
      updated_at: nowIso,
    })
    .eq("ad_id", adId)
    .in("status", ["open", "reviewing"]);

  if (reportsError) {
    throw new Error(reportsError.message);
  }

  const { data: sellerProfile } = await supabase
    .from("profiles")
    .select("email, full_name, notify_moderation_email")
    .eq("id", currentAd.seller_id)
    .maybeSingle();

  if (sellerProfile?.email && sellerProfile.notify_moderation_email !== false) {
    const emailJob = await enqueueModerationDecisionEmailJob({
      to: sellerProfile.email,
      fullName: sellerProfile.full_name,
      adTitle: `${currentAd.brand} ${currentAd.model}`.trim(),
      decision: "approved",
      dashboardUrl,
      marketCode: adMarketCode,
    });

    if (!emailJob.ok) {
      console.error("Failed to queue moderation approval email:", emailJob.error);
    } else {
      scheduleQueuedEmailDrain({
        batchSize: 5,
        jobTypes: ["moderation_decision"],
      });
    }
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: "approve_ad",
    target_type: "ad",
    target_id: adId,
    created_at: new Date().toISOString(),
  });

  await recordServerAnalyticsEvent("listing_approved", {
    adId,
    approvalMethod: "admin_moderation",
    sellerType: currentAd.dealer_id ? "dealer" : "private",
  });

  await processAdminAlgoliaSyncQueue();
  revalidateAdSurfaces();
  revalidatePath("/admin");
  return { success: true };
}

export async function rejectAd(adId: string, reason?: string) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const nowIso = new Date().toISOString();
  const { data: currentAd, error: currentAdError } = await supabase
    .from("ads")
    .select("brand, model, seller_id, dealer_id, market_code")
    .eq("id", adId)
    .single();

  if (currentAdError || !currentAd) {
    throw new Error(currentAdError?.message || "Ad not found");
  }

  const adMarketCode = isMarketCode(currentAd.market_code)
    ? currentAd.market_code
    : DEFAULT_MARKET_CODE;
  const dashboardUrl = `${getMarketConfig(adMarketCode).origin}${getMarketPath(
    "/moj-ucet?tab=ads",
    adMarketCode,
  )}`;

  const { error } = await supabase
    .from("ads")
    .update({
      status: "rejected",
      published_at: null,
      expires_at: null,
      moderation_reviewed_at: nowIso,
      moderation_reviewed_by: userId,
      moderation_rejection_note: reason?.trim() || null,
      updated_at: nowIso,
    })
    .eq("id", adId);

  if (error) throw new Error(error.message);

  const { error: reportsError } = await supabase
    .from("listing_reports")
    .update({
      status: "resolved",
      reviewed_at: nowIso,
      reviewed_by: userId,
      resolution_note: reason?.trim() || "Rejected during moderation review.",
      updated_at: nowIso,
    })
    .eq("ad_id", adId)
    .in("status", ["open", "reviewing"]);

  if (reportsError) throw new Error(reportsError.message);

  const { data: sellerProfile } = await supabase
    .from("profiles")
    .select("email, full_name, notify_moderation_email")
    .eq("id", currentAd.seller_id)
    .maybeSingle();

  if (sellerProfile?.email && sellerProfile.notify_moderation_email !== false) {
    const emailJob = await enqueueModerationDecisionEmailJob({
      to: sellerProfile.email,
      fullName: sellerProfile.full_name,
      adTitle: `${currentAd.brand} ${currentAd.model}`.trim(),
      decision: "rejected",
      reviewNote: reason?.trim() || null,
      dashboardUrl,
      marketCode: adMarketCode,
    });

    if (!emailJob.ok) {
      console.error("Failed to queue moderation rejection email:", emailJob.error);
    } else {
      scheduleQueuedEmailDrain({
        batchSize: 5,
        jobTypes: ["moderation_decision"],
      });
    }
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: "reject_ad",
    target_type: "ad",
    target_id: adId,
    details: { reason },
    created_at: new Date().toISOString(),
  });

  await recordServerAnalyticsEvent("listing_removed_by_moderation", {
    adId,
    removalReason: "admin_rejection",
    sellerType: currentAd.dealer_id ? "dealer" : "private",
  });

  await processAdminAlgoliaSyncQueue();
  revalidateAdSurfaces();
  revalidatePath("/admin");
  return { success: true };
}

export async function dismissListingReports(adId: string, note?: string) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("listing_reports")
    .update({
      status: "dismissed",
      reviewed_at: nowIso,
      reviewed_by: userId,
      resolution_note: note?.trim() || "Reports dismissed after moderation review.",
      updated_at: nowIso,
    })
    .eq("ad_id", adId)
    .in("status", ["open", "reviewing"]);

  if (error) throw new Error(error.message);

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: "approve_ad",
    target_type: "ad",
    target_id: adId,
    details: { reportDisposition: "dismissed", note: note?.trim() || null },
    created_at: nowIso,
  });

  revalidateAdSurfaces();
  revalidatePath("/admin");
  return { success: true };
}

export async function getAdminUsers(
  search?: string,
  limit = 100,
): Promise<AdminUser[]> {
  const { supabase } = await requireAuth();

  let query = supabase
    .from("profiles")
    .select("id, email, full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data: profiles, error: profilesError } = await query;
  if (profilesError) {
    throw new Error(profilesError.message);
  }

  if (!profiles || profiles.length === 0) return [];

  const profileIds = profiles.map((profile) => profile.id);
  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin role lookup");
  }

  const { data: admins, error: adminsError } = await adminClient
    .from("site_admins")
    .select("user_id");
  if (adminsError) {
    throw new Error(adminsError.message);
  }
  const adminIds = new Set(admins?.map((a) => a.user_id) || []);
  const bannedIds = await getBannedAuthUserIds(adminClient, profileIds);

  const { data: dealerRows, error: dealerRowsError } = await supabase
    .from("dealers")
    .select("id, owner_id, is_verified, prepaid_balance_cents")
    .in("owner_id", profileIds);
  if (dealerRowsError) {
    throw new Error(dealerRowsError.message);
  }
  const dealerOwnerIds = new Set(dealerRows?.map((dealer) => dealer.owner_id) || []);
  const dealerMetaByOwnerId = new Map(
    (dealerRows || []).map((dealer) => [dealer.owner_id, dealer]),
  );

  const { data: adData, error: adDataError } = await supabase
    .from("ads")
    .select("seller_id")
    .in("seller_id", profileIds);
  if (adDataError) {
    throw new Error(adDataError.message);
  }

  const adCountMap = new Map<string, number>();
  adData?.forEach((ad) => {
    adCountMap.set(ad.seller_id, (adCountMap.get(ad.seller_id) || 0) + 1);
  });

  return profiles.map(
    (profile) => {
      const isDealer = dealerOwnerIds.has(profile.id);

      return {
        ...profile,
        is_dealer: isDealer,
        dealer_id: dealerMetaByOwnerId.get(profile.id)?.id || null,
        dealer_is_verified: Boolean(dealerMetaByOwnerId.get(profile.id)?.is_verified),
        dealer_prepaid_balance_cents:
          dealerMetaByOwnerId.get(profile.id)?.prepaid_balance_cents || 0,
        ad_count: adCountMap.get(profile.id) || 0,
        is_banned: bannedIds.has(profile.id),
        role: adminIds.has(profile.id)
          ? "admin"
          : isDealer
            ? "dealer"
            : "user",
      } as AdminUser;
    },
  );
}

export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<AdminUser> {
  assertRuntimeEnvConfigured("authEmail");
  const { userId: adminId, supabase } = await requireAuth({ requireMfa: true });
  const parsed = createAdminUserSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error("Zadajte platný e-mail a meno.");
  }

  const { email, fullName } = parsed.data;
  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for user creation");
  }

  const { data: createdData, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        created_by_admin: true,
        ...(fullName ? { full_name: fullName } : {}),
      },
    });

  if (createError || !createdData.user) {
    throw new Error(createError?.message || "Používateľa sa nepodarilo vytvoriť.");
  }

  const createdUser = createdData.user;
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${getBaseUrl()}/auth/reset-password`,
      },
    });

  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    throw new Error(linkError?.message || "Link na nastavenie hesla sa nepodarilo vytvoriť.");
  }

  const enqueueResult = await enqueuePasswordRecoveryEmailJob({
    email,
    fullName: fullName || undefined,
    resetUrl: buildAdminPasswordResetUrl(tokenHash),
  });

  if (!enqueueResult.ok) {
    throw new Error(enqueueResult.error || "E-mail na nastavenie hesla sa nepodarilo zaradiť.");
  }

  scheduleQueuedEmailDrain({
    batchSize: 5,
    jobTypes: ["auth_password_reset"],
  });

  await supabase.from("admin_audit_logs").insert({
    admin_id: adminId,
    action: "create_user",
    target_type: "user",
    target_id: createdUser.id,
    details: { email, fullName },
    created_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");

  return {
    id: createdUser.id,
    email: createdUser.email || email,
    full_name: fullName,
    created_at: createdUser.created_at || new Date().toISOString(),
    is_dealer: false,
    dealer_id: null,
    dealer_is_verified: false,
    dealer_prepaid_balance_cents: 0,
    ad_count: 0,
    is_banned: false,
    role: "user",
  };
}

export async function deleteAdminUser(userId: string) {
  const targetUserId = userId.trim();
  if (!targetUserId) {
    throw new Error("Chýba ID používateľa.");
  }

  const { userId: adminId, supabase } = await requireAuth({ requireMfa: true });
  if (targetUserId === adminId) {
    throw new Error("Nemôžete vymazať vlastný admin účet.");
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for user deletion");
  }

  const adminIds = await getSiteAdminIds(adminClient);
  if (adminIds.has(targetUserId)) {
    throw new Error("Admin účet najprv odstráňte zo zoznamu adminov.");
  }

  const { error: authError } = await adminClient.auth.admin.deleteUser(targetUserId);
  if (authError) {
    throw new Error(authError.message);
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: adminId,
    action: "delete_user",
    target_type: "user",
    target_id: targetUserId,
    created_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { success: true };
}

export async function updateAdminUser(
  input: UpdateAdminUserInput,
): Promise<AdminUserUpdateResult> {
  const parsed = updateAdminUserSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Zadajte platný e-mail a meno.");
  }

  const { userId: targetUserId, email, fullName } = parsed.data;
  const { userId: adminId, supabase } = await requireAuth({ requireMfa: true });

  if (targetUserId === adminId) {
    throw new Error("Nemôžete upraviť vlastný admin účet.");
  }

  const adminClient = requireAdminServiceClient();
  const adminIds = await getSiteAdminIds(adminClient);
  if (adminIds.has(targetUserId)) {
    throw new Error("Admin účet nie je možné upraviť v zozname používateľov.");
  }

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", targetUserId)
    .maybeSingle();

  if (currentProfileError) {
    throw new Error(currentProfileError.message);
  }

  if (!currentProfile?.email) {
    throw new Error("Používateľ nemá profil.");
  }

  const { data: authData, error: authReadError } =
    await adminClient.auth.admin.getUserById(targetUserId);
  if (authReadError || !authData?.user) {
    throw new Error(authReadError?.message || "Používateľ nemá prihlasovací účet.");
  }

  const { error: authUpdateError } =
    await adminClient.auth.admin.updateUserById(targetUserId, {
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

  if (authUpdateError) {
    throw new Error(authUpdateError.message);
  }

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({ email, full_name: fullName })
    .eq("id", targetUserId);

  if (profileUpdateError) {
    throw new Error(profileUpdateError.message);
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: adminId,
    action: "update_user",
    target_type: "user",
    target_id: targetUserId,
    details: {
      previousEmail: currentProfile.email,
      nextEmail: email,
      previousFullName: currentProfile.full_name,
      nextFullName: fullName,
    },
    created_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");

  return {
    id: targetUserId,
    email,
    full_name: fullName,
  };
}

export async function createAdminUserImpersonationLink(
  userId: string,
): Promise<AdminUserImpersonationLink> {
  const targetUserId = userId.trim();
  if (!targetUserId) {
    throw new Error("Chýba ID používateľa.");
  }

  const { userId: adminId, supabase } = await requireAuth({ requireMfa: true });
  if (targetUserId === adminId) {
    throw new Error("Nemôžete sa prihlásiť ako vlastný admin účet.");
  }

  const adminClient = requireAdminServiceClient();
  const adminIds = await getSiteAdminIds(adminClient);
  if (adminIds.has(targetUserId)) {
    throw new Error("Admin účet nie je možné otvoriť cez prihlásenie používateľa.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile?.email) {
    throw new Error("Používateľ nemá e-mail v profile.");
  }

  const { data: authData, error: authError } =
    await adminClient.auth.admin.getUserById(targetUserId);

  if (authError || !authData?.user) {
    throw new Error(authError?.message || "Používateľ nemá prihlasovací účet.");
  }

  if (authData.user.email !== profile.email) {
    throw new Error("E-mail profilu sa nezhoduje s prihlasovacím účtom.");
  }

  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: {
        redirectTo: `${getBaseUrl()}/moj-ucet`,
      },
    });

  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) {
    throw new Error(linkError?.message || "Prihlasovací odkaz sa nepodarilo vytvoriť.");
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: adminId,
    action: "create_user_impersonation_link",
    target_type: "user",
    target_id: targetUserId,
    details: {
      email: profile.email,
      fullName: profile.full_name,
    },
    created_at: new Date().toISOString(),
  });

  return {
    url: actionLink,
    email: profile.email,
    fullName: profile.full_name,
  };
}

export async function setDealerVerification(
  dealerId: string,
  isVerified: boolean,
) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });

  const { error } = await supabase
    .from("dealers")
    .update({ is_verified: isVerified })
    .eq("id", dealerId);

  if (error) throw new Error(error.message);

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: isVerified ? "verify_dealer" : "unverify_dealer",
    target_type: "dealer",
    target_id: dealerId,
    details: { isVerified },
    created_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function banUser(userId: string, reason?: string) {
  const { userId: adminId, supabase } = await requireAuth({ requireMfa: true });
  if (userId === adminId) {
    throw new Error("Nemôžete zablokovať vlastný admin účet.");
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for user blocking");
  }

  const { error: authError } = await adminClient.auth.admin.updateUserById(
    userId,
    { ban_duration: "876000h" },
  );
  if (authError) {
    throw new Error(authError.message);
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: adminId,
    action: "ban_user",
    target_type: "user",
    target_id: userId,
    details: { reason },
    created_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function unbanUser(userId: string) {
  const { userId: adminId, supabase } = await requireAuth({ requireMfa: true });

  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for user unblocking");
  }

  const { error: authError } = await adminClient.auth.admin.updateUserById(
    userId,
    { ban_duration: "none" },
  );
  if (authError) {
    throw new Error(authError.message);
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: adminId,
    action: "unban_user",
    target_type: "user",
    target_id: userId,
    created_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function getSiteSettings(): Promise<SiteSetting[]> {
  const { supabase } = await requireAuth();

  const { data } = await supabase
    .from("site_settings")
    .select("key, value, updated_at")
    .order("key", { ascending: true });

  return (data as SiteSetting[]) || [];
}

export async function updateSiteSetting(key: string, value: string) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });

  const { data: existing } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .single();

  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: "update_site_settings",
    target_type: "setting",
    target_id: key,
    details: { previousValue: existing?.value, newValue: value },
    created_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  if (key === "pricing_config_v1") {
    revalidatePath("/");
    revalidatePath("/ceny");
    revalidatePath(LEGACY_CREATE_LISTING_ROUTE);
    revalidatePath("/moj-ucet");
    revalidatePath("/dealer");
    revalidatePath("/vysledky");
  }
  return { success: true };
}

export async function clearAdminCache(): Promise<AdminSystemActionResult> {
  const { userId, supabase } = await requireAuth({ requireMfa: true });

  revalidateAdminCacheSurfaces();
  await recordAdminSystemAction(supabase, userId, "clear_admin_cache", "cache", {
    paths: [...ADMIN_CACHE_PATHS],
    tags: [...ADS_CACHE_TAGS],
  });

  return {
    success: true,
    message:
      "Cache stránok bola obnovená. Nemaže to dáta, iba vynúti čerstvé zobrazenie.",
    details: {
      paths: [...ADMIN_CACHE_PATHS],
      tags: [...ADS_CACHE_TAGS],
    },
  };
}

export async function syncAdminSearchIndex(): Promise<AdminSystemActionResult> {
  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const syncSecret = process.env.ALGOLIA_SYNC_SECRET?.trim();

  if (!syncSecret) {
    const message =
      "Reindex Algolie nie je nastavený. Chýba serverový ALGOLIA_SYNC_SECRET.";
    await recordAdminSystemAction(
      supabase,
      userId,
      "sync_search_index",
      "algolia",
      { status: "missing_config", message },
    );
    return { success: false, message };
  }

  const response = await fetch(`${getBaseUrl()}/api/algolia/sync`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${syncSecret}`,
    },
    cache: "no-store",
  });
  const payload = await readActionResponseJson(response);
  const count = typeof payload.count === "number" ? payload.count : undefined;

  if (!response.ok || payload.success === false) {
    const message = getActionResponseMessage(
      payload,
      "Reindex Algolie zlyhal.",
    );
    await recordAdminSystemAction(
      supabase,
      userId,
      "sync_search_index",
      "algolia",
      { status: "failed", httpStatus: response.status, response: payload },
    );
    return { success: false, message, count, details: payload };
  }

  revalidateAdSurfaces();
  await recordAdminSystemAction(
    supabase,
    userId,
    "sync_search_index",
    "algolia",
    { status: "success", count, response: payload },
  );

  return {
    success: true,
    message:
      typeof count === "number"
        ? `Algolia bola reindexovaná. Aktívne inzeráty: ${count}.`
        : "Algolia bola reindexovaná.",
    count,
    details: payload,
  };
}

export async function runAdminCronJob(
  jobId: AdminCronJobId,
): Promise<AdminSystemActionResult> {
  const job = ADMIN_CRON_JOBS[jobId];
  if (!job) {
    throw new Error("Neznámy cron job");
  }

  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const cronSecret = process.env.CRON_SECRET?.trim();
  const headers: Record<string, string> = {};
  if (cronSecret) {
    headers["x-cron-secret"] = cronSecret;
  }

  const response = await fetch(`${getBaseUrl()}${job.path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const payload = await readActionResponseJson(response);

  if (!response.ok) {
    const message = `${job.label} zlyhalo: ${getActionResponseMessage(
      payload,
      "cron route vrátila chybu",
    )}`;
    await recordAdminSystemAction(supabase, userId, "run_cron_job", jobId, {
      status: "failed",
      httpStatus: response.status,
      response: payload,
    });
    return {
      success: false,
      message,
      jobId,
      label: job.label,
      details: payload,
    };
  }

  await recordAdminSystemAction(supabase, userId, "run_cron_job", jobId, {
    status: "success",
    response: payload,
  });

  return {
    success: true,
    message: `${job.label} bolo spustené.`,
    jobId,
    label: job.label,
    details: payload,
  };
}

export async function getDealerVerificationRequests(): Promise<DealerVerificationRequest[]> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("dealer_verification_requests")
    .select(
      `
        id,
        dealer_id,
        request_note,
        status,
        admin_note,
        created_at,
        reviewed_at,
        dealers:dealer_id (name, slug, owner_id),
        profiles:requester_user_id (email)
      `,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<Record<string, unknown>> | null) || []).map((row) => {
    const dealer = row.dealers as { name?: string; slug?: string } | null;
    const profile = row.profiles as { email?: string } | null;

    return {
      id: row.id as string,
      dealer_id: row.dealer_id as string,
      dealer_name: dealer?.name || "Dealer",
      dealer_slug: dealer?.slug || "",
      owner_email: profile?.email || "unknown",
      request_note: (row.request_note as string) || "",
      status: (row.status as DealerVerificationRequest["status"]) || "pending",
      admin_note: (row.admin_note as string | null) || null,
      created_at: row.created_at as string,
      reviewed_at: (row.reviewed_at as string | null) || null,
    };
  });
}

export async function reviewDealerVerificationRequest(
  requestId: string,
  dealerId: string,
  decision: "approved" | "rejected",
  adminNote?: string,
) {
  const { userId, supabase } = await requireAuth({ requireMfa: true });
  const nowIso = new Date().toISOString();

  const { error: requestError } = await supabase
    .from("dealer_verification_requests")
    .update({
      status: decision,
      admin_note: adminNote?.trim() || null,
      reviewed_at: nowIso,
      reviewed_by: userId,
    })
    .eq("id", requestId);

  if (requestError) {
    throw new Error(requestError.message);
  }

  if (decision === "approved") {
    const { error: dealerError } = await supabase
      .from("dealers")
      .update({ is_verified: true })
      .eq("id", dealerId);

    if (dealerError) {
      throw new Error(dealerError.message);
    }
  }

  await supabase.from("admin_audit_logs").insert({
    admin_id: userId,
    action: decision === "approved" ? "verify_dealer" : "unverify_dealer",
    target_type: "dealer",
    target_id: dealerId,
    details: {
      requestId,
      decision,
      adminNote: adminNote?.trim() || null,
    },
    created_at: nowIso,
  });

  revalidatePath("/admin");
  return { success: true };
}

function normalizeNotificationLevel(value: string | null | undefined): AdminNotification["level"] {
  if (value === "info" || value === "warn" || value === "error" || value === "critical") {
    return value;
  }
  return "info";
}

function toMetadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function mapSystemLogToNotification(log: {
  id: string;
  level: string;
  category: string;
  message: string;
  request_id: string | null;
  metadata: unknown;
  created_at: string;
}): AdminNotification {
  const metadata = toMetadataRecord(log.metadata);
  const level = normalizeNotificationLevel(log.level);

  return {
    id: log.id,
    kind: log.message,
    level,
    category: log.category,
    source: "system",
    title: log.message,
    description:
      typeof metadata?.errorMessage === "string"
        ? metadata.errorMessage
        : "System notification",
    createdAt: log.created_at,
    requestId: log.request_id,
  };
}

function mapEmailDeliveryToNotification(
  delivery: AdminEmailDeliveryNotificationRow,
): AdminNotification {
  return {
    id: delivery.id,
    kind: `email_delivery_${delivery.status}`,
    level: delivery.status === "failed" ? "error" : "info",
    category: "email",
    source: "system",
    title: `Email delivery failed: ${delivery.email_type}`,
    description: delivery.error_message
      ? `${delivery.subject} -> ${delivery.recipient_email} (${delivery.error_message})`
      : `${delivery.subject} -> ${delivery.recipient_email}`,
    createdAt: delivery.created_at,
    requestId: null,
  };
}

function mapPaymentNotificationToAdminNotification(
  notification: AdminPaymentNotificationRow,
): AdminNotification {
  const isFailure =
    notification.email_status === "failed" || notification.notification_type === "failure";

  return {
    id: notification.id,
    kind: `payment_notification_${notification.notification_type}_${notification.email_status}`,
    level: isFailure ? "error" : "info",
    category: "payment",
    source: "system",
    title: isFailure
      ? `Payment notification failed: ${notification.notification_type}`
      : `Payment notification: ${notification.notification_type}`,
    description: notification.error_message
      ? `${notification.user_email} (${notification.error_message})`
      : notification.user_email,
    createdAt: notification.created_at,
    requestId: notification.transaction_id,
  };
}

export async function getAdminNotifications(limit = 80): Promise<AdminNotification[]> {
  const { supabase } = await requireAuth();
  const safeLimit = Math.min(Math.max(Math.round(limit), 10), 200);

  const [systemLogsResult, emailFailuresResult, paymentFailuresResult] = await Promise.all([
    supabase
      .from("system_logs")
      .select("id, level, category, message, request_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit),
    supabase
      .from("email_deliveries")
      .select("id, email_type, recipient_email, subject, status, error_message, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(Math.min(safeLimit, 40)),
    supabase
      .from("payment_notifications")
      .select("id, transaction_id, notification_type, user_email, email_status, error_message, created_at")
      .or("email_status.eq.failed,notification_type.eq.failure")
      .order("created_at", { ascending: false })
      .limit(Math.min(safeLimit, 40)),
  ]);

  if (systemLogsResult.error) {
    throw new Error(systemLogsResult.error.message);
  }
  if (emailFailuresResult.error) {
    throw new Error(emailFailuresResult.error.message);
  }
  if (paymentFailuresResult.error) {
    throw new Error(paymentFailuresResult.error.message);
  }

  const rows =
    (systemLogsResult.data as {
      id: string;
      level: string;
      category: string;
      message: string;
      request_id: string | null;
      metadata: unknown;
      created_at: string;
    }[] | null) || [];

  const notifications = [
    ...rows
      .filter((row) => {
        return (
          row.level === "warn" ||
          row.level === "error" ||
          row.level === "critical"
        );
      })
      .map(mapSystemLogToNotification),
    ...(((emailFailuresResult.data as AdminEmailDeliveryNotificationRow[] | null) || []).map(
      mapEmailDeliveryToNotification,
    )),
    ...(((paymentFailuresResult.data as AdminPaymentNotificationRow[] | null) || []).map(
      mapPaymentNotificationToAdminNotification,
    )),
  ];

  return notifications
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, 40);
}

const EMAIL_SORT_FIELDS = ["created_at", "email_type", "status"] as const;

type EmailSortField = (typeof EMAIL_SORT_FIELDS)[number];
type SortDirection = "asc" | "desc";

function normalizeEmailSortField(sortBy?: string): EmailSortField {
  if (sortBy && EMAIL_SORT_FIELDS.includes(sortBy as EmailSortField)) {
    return sortBy as EmailSortField;
  }

  return "created_at";
}

function normalizeSortDirection(direction?: string): SortDirection {
  return direction === "asc" ? "asc" : "desc";
}

function getBaseAppUrl() {
  return getBaseUrl();
}

export async function getEmailDeliveries(options?: {
  emailType?: string;
  status?: "sent" | "failed";
  sortBy?: string;
  direction?: "asc" | "desc";
  limit?: number;
}): Promise<AdminEmailDelivery[]> {
  const { supabase } = await requireAuth();
  const sortBy = normalizeEmailSortField(options?.sortBy);
  const direction = normalizeSortDirection(options?.direction);
  const limit = Math.min(Math.max(options?.limit || 200, 1), 500);

  let query = supabase
    .from("email_deliveries")
    .select("*")
    .order(sortBy, { ascending: direction === "asc" })
    .limit(limit);

  if (options?.emailType && options.emailType !== "all") {
    query = query.eq("email_type", options.emailType);
  }

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data as AdminEmailDelivery[] | null) || [];
}

export async function getEmailTemplateExamples(): Promise<AdminEmailTemplateExample[]> {
  await requireAuth();
  const appUrl = getBaseAppUrl();

  const [
    registrationHtml,
    passwordResetHtml,
    adApprovedHtml,
    adRejectedHtml,
    paymentConfirmationHtml,
    paymentFailureHtml,
    invoiceHtml,
    savedSearchHtml,
    savedAdHtml,
  ] = await Promise.all([
    renderRegistrationConfirmationEmail({
      userName: "Test Používateľ",
      confirmationUrl: `${appUrl}/auth/confirm?token=sample-token`,
      loginUrl: `${appUrl}/auth/login`,
    }),
    renderPasswordResetEmail({
      userName: "Test Používateľ",
      resetUrl: `${appUrl}/auth/reset-password?token=sample-token`,
      supportEmail: COMPANY_INFO.supportEmail,
    }),
    renderModerationDecisionEmail({
      userName: "Test Používateľ",
      adTitle: "Škoda Octavia 2.0 TDI",
      decision: "approved",
      dashboardUrl: `${appUrl}/moj-ucet`,
      supportEmail: COMPANY_INFO.supportEmail,
    }),
    renderModerationDecisionEmail({
      userName: "Test Používateľ",
      adTitle: "Škoda Octavia 2.0 TDI",
      decision: "rejected",
      dashboardUrl: `${appUrl}/moj-ucet`,
      reviewNote: "Chýba reálna fotka vozidla.",
      supportEmail: COMPANY_INFO.supportEmail,
    }),
    renderPaymentConfirmationEmail({
      userName: "Test Používateľ",
      summaryLabel: "Služba",
      summaryValue: "Exclusive 28 dní",
      amount: 89.99,
      currency: "eur",
      invoiceUrl: `${appUrl}/faktury/sample`,
      transactionId: "txn_sample_123",
      dashboardUrl: `${appUrl}/moj-ucet`,
    }),
    renderPaymentFailureEmail({
      userName: "Test Používateľ",
      amount: 24.99,
      currency: "eur",
      reason: "Nedostatočný zostatok",
      retryUrl: `${appUrl}/ceny`,
    }),
    renderInvoiceEmail({
      userName: "Test Používateľ",
      invoiceUrl: `${appUrl}/faktury/sample`,
    }),
    renderSavedSearchAlertEmail({
      userName: "Test Používateľ",
      label: "Škoda Octavia do 15 000 €",
      resultsPageUrl: `${appUrl}/vysledky?brand=skoda&model=octavia`,
      listings: [
        {
          title: "Škoda Octavia 2.0 TDI",
          priceEur: 14990,
          locationCity: "Bratislava",
          href: `${appUrl}/auto/sample-octavia`,
        },
      ],
    }),
    renderSavedAdAlertEmail({
      userName: "Test Používateľ",
      adTitle: "Škoda Octavia 2.0 TDI",
      adUrl: `${appUrl}/auto/sample-octavia`,
      priceDropAmount: 500,
      currentPriceEur: 14990,
      statusLabel: "Aktívny",
    }),
  ]);

  const brandName = getEmailBrandName();

  return [
    {
      id: "auth-register-confirmation",
      name: "Potvrdenie registrácie",
      templateKey: "registration_confirmation",
      subject: `Potvrdenie registrácie - ${brandName}`,
      html: registrationHtml,
    },
    {
      id: "auth-password-reset",
      name: "Obnovenie hesla",
      templateKey: "password_reset",
      subject: `Obnovenie hesla - ${brandName}`,
      html: passwordResetHtml,
    },
    {
      id: "ad-approved",
      name: "Inzerát schválený",
      templateKey: "ad_approved",
      subject: `Váš inzerát bol schválený - ${brandName}`,
      html: adApprovedHtml,
    },
    {
      id: "ad-rejected",
      name: "Inzerát potrebuje úpravu",
      templateKey: "ad_rejected",
      subject: `Váš inzerát potrebuje úpravu - ${brandName}`,
      html: adRejectedHtml,
    },
    {
      id: "payment-confirmation",
      name: "Potvrdenie platby",
      templateKey: "payment_confirmation",
      subject: "Platba potvrdená",
      html: paymentConfirmationHtml,
    },
    {
      id: "payment-failure",
      name: "Neúspešná platba",
      templateKey: "payment_failure",
      subject: "Platba sa nepodarila",
      html: paymentFailureHtml,
    },
    {
      id: "invoice",
      name: "Faktúra",
      templateKey: "invoice",
      subject: "Vaša faktúra",
      html: invoiceHtml,
    },
    {
      id: "saved-search-alert",
      name: "Uložené vyhľadávanie",
      templateKey: "saved_search_alert",
      subject: "Nové ponuky pre uložené vyhľadávanie",
      html: savedSearchHtml,
    },
    {
      id: "saved-ad-alert",
      name: "Uložený inzerát",
      templateKey: "saved_ad_alert",
      subject: "Zmena na uloženom inzeráte",
      html: savedAdHtml,
    },
  ];
}
