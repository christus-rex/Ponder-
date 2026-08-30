"use client";

import { useRef, useState } from "react";
import { createBaseAccountSDK } from "@base-org/account";
import { encodeFunctionData, isAddress, parseUnits } from "viem";
import { BASE_SEPOLIA } from "@/lib/crypto/config";

const usdcAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const tipOptions = [1, 3, 5];

type BaseSdk = ReturnType<typeof createBaseAccountSDK>;

export function WalletPanel() {
  const sdkRef = useRef<BaseSdk | null>(null);
  const [address, setAddress] = useState<string>("");
  const [tipAmount, setTipAmount] = useState(3);
  const [status, setStatus] = useState<"idle" | "connecting" | "sending">("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const recipient = process.env.NEXT_PUBLIC_PONDER_TIP_RECIPIENT ?? "";
  const recipientReady = isAddress(recipient);

  async function connect() {
    setError("");
    setStatus("connecting");

    try {
      const sdk = createBaseAccountSDK({ appName: "Ponder+" });
      sdkRef.current = sdk;
      const provider = sdk.getProvider();

      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const first = Array.isArray(accounts) ? accounts[0] : undefined;

      if (!first || typeof first !== "string") {
        throw new Error("Base Account did not return an address.");
      }

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_SEPOLIA.chainIdHex }],
      });

      setAddress(first);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect Base Account.");
    } finally {
      setStatus("idle");
    }
  }

  async function sendTestTip() {
    if (!address || !sdkRef.current || !recipientReady) return;

    setError("");
    setTxHash("");
    setStatus("sending");

    try {
      const data = encodeFunctionData({
        abi: usdcAbi,
        functionName: "transfer",
        args: [recipient, parseUnits(String(tipAmount), BASE_SEPOLIA.usdcDecimals)],
      });

      const hash = await sdkRef.current.getProvider().request({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: BASE_SEPOLIA.usdcAddress,
            data,
          },
        ],
      });

      setTxHash(String(hash));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The test tip was not submitted.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="walletCard">
      <div className="walletTop">
        <div>
          <p className="sectionLabel">PONDER WALLET</p>
          <div className="walletAddress">
            {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "not connected"}
          </div>
        </div>
        <span className="walletBadge">TESTNET</span>
      </div>

      <div className="walletBalance">USDC</div>
      <p className="walletCaption">Base Sepolia · test assets have no monetary value</p>

      {!address ? (
        <button className="walletButton" type="button" onClick={connect} disabled={status !== "idle"}>
          {status === "connecting" ? "Connecting…" : "Connect Base Account"}
        </button>
      ) : (
        <>
          <p className="sectionLabel">TEST TIP</p>
          <div className="tipRow">
            {tipOptions.map((amount) => (
              <button
                className="tipAmount"
                data-active={tipAmount === amount}
                key={amount}
                type="button"
                onClick={() => setTipAmount(amount)}
              >
                ${amount}
              </button>
            ))}
          </div>
          <button
            className="walletButton"
            type="button"
            onClick={sendTestTip}
            disabled={status !== "idle" || !recipientReady}
          >
            {status === "sending" ? "Submitting…" : `Send ${tipAmount} test USDC`}
          </button>
        </>
      )}

      {!recipientReady && (
        <p className="walletNote">
          Configure NEXT_PUBLIC_PONDER_TIP_RECIPIENT with a Base Sepolia address to enable test tips.
        </p>
      )}
      {txHash && <p className="txHash">Submitted: {txHash}</p>}
      {error && <p className="walletError">{error}</p>}
    </div>
  );
}
