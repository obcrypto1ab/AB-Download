import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { analyzeUrl, toAnalysisError } from "@/lib/metadata-service";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import { BlockedUrlError, InvalidUrlError, TimeoutError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  url: z.string().min(1).max(2048)
});

export async function POST(request: NextRequest) {
  // Basic abuse guard: 20 analyses per minute per client.
  const rate = checkRateLimit(`analyze:${clientKeyFromHeaders(request.headers)}`, 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "rate-limited",
        message: `Too many analyses. Please wait ${rate.retryAfterSeconds}s and try again.`,
        retryable: true
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-url", message: "Malformed request body.", retryable: false },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid-url",
        message: "Provide a URL to analyze.",
        retryable: false
      },
      { status: 400 }
    );
  }

  try {
    const result = await analyzeUrl(parsed.data.url, {
      youtubeApiKey: process.env.YOUTUBE_API_KEY || null
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    // analyzeUrl handles its own provider errors; this is a last-resort net.
    if (error instanceof InvalidUrlError) {
      return NextResponse.json(
        { ok: false, code: "invalid-url", message: error.message, retryable: false },
        { status: 400 }
      );
    }
    if (error instanceof BlockedUrlError) {
      return NextResponse.json(
        { ok: false, code: "blocked-url", message: error.message, retryable: false },
        { status: 400 }
      );
    }
    if (error instanceof TimeoutError) {
      return NextResponse.json(
        { ok: false, code: "timeout", message: error.message, retryable: true },
        { status: 504 }
      );
    }
    const mapped = toAnalysisError(error);
    return NextResponse.json(mapped, {
      status: mapped.code === "internal-error" ? 500 : 502,
      headers: { "cache-control": "no-store" }
    });
  }
}
