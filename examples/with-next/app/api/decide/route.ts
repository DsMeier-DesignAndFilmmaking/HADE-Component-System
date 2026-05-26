/**
 * Server-side decide endpoint — shows the headless `decide()` helper used
 * from a Next.js Route Handler. Works in Node and Edge runtimes.
 */
import { NextResponse } from "next/server";
import { decide } from "@hade/core";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "40.7128");
  const lng = parseFloat(searchParams.get("lng") ?? "-74.006");
  const intent = searchParams.get("intent") ?? "eat";

  const output = await decide({
    geo: { lat, lng },
    situation: { intent },
  });

  return NextResponse.json(output);
}
