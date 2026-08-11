import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getCarsIndexName } from "@/lib/algolia";
import { configureCarsIndex } from "@/lib/algolia/admin-config";
import {
  createCronAdminClient,
  rejectWhenInvalidCronRequest,
} from "@/lib/cron/route-helpers";
import { processAlgoliaSyncQueue } from "@/lib/algolia/sync-queue";

export async function GET(request: NextRequest) {
  const cronError = rejectWhenInvalidCronRequest(request);
  if (cronError) {
    return cronError;
  }

  const supabase = createCronAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Cron admin client is not configured" },
      { status: 500 },
    );
  }

  try {
    const algolia = getAdminClient();
    await configureCarsIndex(algolia, getCarsIndexName());
    const result = await processAlgoliaSyncQueue({
      supabase,
      algolia,
      batchSize: 100,
    });

    return NextResponse.json(
      {
        success: result.failed === 0,
        ...result,
      },
      { status: result.failed > 0 ? 502 : 200 },
    );
  } catch (error) {
    console.error("Algolia queue cron failed:", error);
    return NextResponse.json(
      { error: "Failed to process Algolia sync queue" },
      { status: 500 },
    );
  }
}
