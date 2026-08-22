import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createCronAdminClientMock,
  rejectWhenInvalidCronRequestMock,
} = vi.hoisted(() => ({
  createCronAdminClientMock: vi.fn(),
  rejectWhenInvalidCronRequestMock: vi.fn(),
}));

vi.mock("@/lib/cron/route-helpers", () => ({
  createCronAdminClient: createCronAdminClientMock,
  rejectWhenInvalidCronRequest: rejectWhenInvalidCronRequestMock,
}));

import { GET } from "./route";

function createRequest() {
  return new NextRequest("http://localhost/api/cron/cleanup-telemetry", {
    method: "GET",
  });
}

describe("GET /api/cron/cleanup-telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rejectWhenInvalidCronRequestMock.mockReturnValue(null);
  });

  it("runs both system-log and telemetry retention jobs", async () => {
    const rpc = vi.fn((functionName: string) =>
      Promise.resolve({
        data: functionName === "cleanup_telemetry_retention" ? { web_vitals: 2 } : null,
        error: null,
      }),
    );
    createCronAdminClientMock.mockReturnValue({ rpc });

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("cleanup_old_logs");
    expect(rpc).toHaveBeenCalledWith("cleanup_telemetry_retention");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      telemetry: { web_vitals: 2 },
    });
  });

  it("returns the shared authorization response before calling Supabase", async () => {
    const unauthorized = new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
    rejectWhenInvalidCronRequestMock.mockReturnValue(unauthorized);

    const response = await GET(createRequest());

    expect(response).toBe(unauthorized);
    expect(createCronAdminClientMock).not.toHaveBeenCalled();
  });
});
