import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAdminClient,
  getCarsIndexName,
  transformCarToAlgoliaRecord,
} from "@/lib/algolia";
import {
  configureCarsIndex,
} from "@/lib/algolia/admin-config";
import { rejectWhenRuntimeEnvMissing } from "@/lib/api/runtime-env";
import { assertRuntimeEnvConfigured, getTrimmedEnv } from "@/lib/env";
import { checkStrictRateLimit } from "@/lib/ratelimit";
import { createRateLimitIdentifier } from "@/lib/request-fingerprint";
import { MARKET_CODES } from "@/config/markets";

// Server-side Supabase client with service role for admin operations
function createAdminSupabase() {
  const url = getTrimmedEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getTrimmedEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing Supabase admin configuration");
  }
  return createClient(url, key);
}

interface SupabaseAd {
  id: string;
  market_code?: string;
  brand?: string;
  model?: string;
  generation?: string;
  description?: string;
  year?: number;
  price_eur?: number;
  mileage_km?: number;
  fuel?: string;
  transmission?: string;
  body_style?: string;
  power_kw?: number;
  location_city?: string;
  photos_json?: string[];
  promotion_tier?: "none" | "premium" | "top";
  is_top_ad?: boolean;
  is_highlighted?: boolean;
  is_vat_deductible?: boolean;
  has_service_book?: boolean;
  not_crashed?: boolean;
  is_bought_in_sk?: boolean;
  created_at?: string;
  brands?: { name: string };
  models?: { name: string };
}

/**
 * POST /api/algolia/sync
 * Replaces the shared Algolia inventory with all visible active ads from all
 * configured markets. The market_code facet is what isolates .sk and .ro at
 * query time; a host-specific full replace would delete the other market.
 * Protected by API key header
 */
export async function POST(request: NextRequest) {
  const rate = await checkStrictRateLimit(
    createRateLimitIdentifier("algolia_sync", request.headers),
  );
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const configError = rejectWhenRuntimeEnvMissing(
    "algoliaSync",
    "Algolia sync is not configured",
  );
  if (configError) {
    return configError;
  }

  // Verify authorization
  const authHeader = request.headers.get("authorization");
  const expectedKey = getTrimmedEnv("ALGOLIA_SYNC_SECRET");

  if (!expectedKey) {
    return NextResponse.json(
      { error: "Server misconfigured: missing ALGOLIA_SYNC_SECRET" },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    assertRuntimeEnvConfigured("algoliaSync");
    const supabase = createAdminSupabase();
    const algolia = getAdminClient();
    const carsIndexName = getCarsIndexName();

    const PAGE_SIZE = 1000;
    const records: ReturnType<typeof transformCarToAlgoliaRecord>[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: ads, error } = await supabase
        .from("ads")
        .select(
          `
                    id,
                    market_code,
                    brand,
                    model,
                    generation,
                    description,
                    year,
                    price_eur,
                    mileage_km,
                    fuel,
                    transmission,
                    body_style,
                    power_kw,
                    location_city,
                    photos_json,
                    promotion_tier,
                    is_top_ad,
                    is_highlighted,
                    is_vat_deductible,
                    has_service_book,
                    not_crashed,
                    is_bought_in_sk,
                    created_at,
                    brands:brand_id (name),
                    models:model_id (name)
                `,
        )
        .eq("status", "active")
        .eq("is_hidden", false)
        .in("market_code", MARKET_CODES)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Error fetching ads:", error);
        return NextResponse.json(
          { error: "Failed to fetch ads from database" },
          { status: 500 },
        );
      }

      if (ads && ads.length > 0) {
        records.push(
          ...(ads as unknown as SupabaseAd[]).map(transformCarToAlgoliaRecord),
        );
      }

      hasMore = (ads?.length || 0) === PAGE_SIZE;
      from += PAGE_SIZE;
    }

    await configureCarsIndex(algolia, carsIndexName);

    const replaceTasks = await algolia.replaceAllObjects({
      indexName: carsIndexName,
      objects: records,
    });

    const marketCounts = records.reduce<Record<string, number>>(
      (counts, record) => {
        counts[record.market_code] = (counts[record.market_code] ?? 0) + 1;
        return counts;
      },
      {},
    );

    return NextResponse.json({
      success: true,
      message: `Synced ${records.length} visible active ads across all markets to Algolia`,
      markets: MARKET_CODES,
      marketCounts,
      indexName: carsIndexName,
      count: records.length,
      taskIDs: [
        replaceTasks.copyOperationResponse.taskID,
        ...replaceTasks.batchResponses.map((entry) => entry.taskID),
        replaceTasks.moveOperationResponse.taskID,
      ],
    });
  } catch (error) {
    console.error("Algolia sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync to Algolia" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/algolia/sync
 * Clears all records from Algolia index
 * Protected by API key header
 */
export async function DELETE(request: NextRequest) {
  const rate = await checkStrictRateLimit(
    createRateLimitIdentifier("algolia_sync", request.headers),
  );
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const configError = rejectWhenRuntimeEnvMissing(
    "algoliaSync",
    "Algolia sync is not configured",
  );
  if (configError) {
    return configError;
  }

  const authHeader = request.headers.get("authorization");
  const expectedKey = getTrimmedEnv("ALGOLIA_SYNC_SECRET");

  if (!expectedKey) {
    return NextResponse.json(
      { error: "Server misconfigured: missing ALGOLIA_SYNC_SECRET" },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    assertRuntimeEnvConfigured("algoliaSync");
    const algolia = getAdminClient();
    await algolia.clearObjects({ indexName: getCarsIndexName() });

    return NextResponse.json({
      success: true,
      message: "Cleared all records from Algolia index",
    });
  } catch (error) {
    console.error("Algolia clear error:", error);
    return NextResponse.json(
      { error: "Failed to clear Algolia index" },
      { status: 500 },
    );
  }
}
