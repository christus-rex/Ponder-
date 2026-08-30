import { NextResponse } from "next/server";
import { BASE_SEPOLIA } from "@/lib/crypto/config";

export function GET() {
  return NextResponse.json({
    network: BASE_SEPOLIA.name,
    chainId: BASE_SEPOLIA.chainId,
    asset: "USDC",
    tokenAddress: BASE_SEPOLIA.usdcAddress,
    mode: BASE_SEPOLIA.mode,
    realFundsEnabled: false,
  });
}
