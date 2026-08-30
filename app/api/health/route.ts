import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "ponder-plus",
    status: "ok",
    milestone: "v0.1-crypto-foundation",
  });
}
