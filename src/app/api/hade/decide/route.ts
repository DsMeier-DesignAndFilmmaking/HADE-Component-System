import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (serverEnv.hadeApiKey && serverEnv.hadeApiKey !== "your_secret_here") {
      headers["x-api-key"] = serverEnv.hadeApiKey;
    }

    const upstream = await fetch(`${serverEnv.hadeUpstreamUrl}/hade/decide`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") ?? "application/json";

    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to process HADE decision request.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
