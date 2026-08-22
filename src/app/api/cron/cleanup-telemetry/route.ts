import { NextRequest, NextResponse } from "next/server";
import {
  createCronAdminClient,
  rejectWhenInvalidCronRequest,
} from "@/lib/cron/route-helpers";
import { isExpectedPrerenderBailout } from "@/lib/next/prerender-bailout";

type RetentionResult = Record<string, number>;

// Keeps diagnostic logs and high-volume telemetry within their explicit
// retention windows. Scheduled daily in vercel.json.
export async function GET(request: NextRequest) {
  try {
    const cronError = rejectWhenInvalidCronRequest(request);
    if (cronError) return cronError;

    const supabase = createCronAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Cron admin client is not configured" },
        { status: 500 },
      );
    }

    const [logsResult, telemetryResult] = await Promise.all([
      supabase.rpc("cleanup_old_logs"),
      supabase.rpc("cleanup_telemetry_retention"),
    ]);

    if (logsResult.error || telemetryResult.error) {
      console.error("Telemetry retention cleanup failed", {
        logsError: logsResult.error?.message,
        telemetryError: telemetryResult.error?.message,
      });
      return NextResponse.json({ error: "Telemetry retention cleanup failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      telemetry: (telemetryResult.data ?? {}) as RetentionResult,
    });
  } catch (error) {
    if (!isExpectedPrerenderBailout(error)) {
      console.error("Unexpected telemetry retention cleanup failure", error);
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
