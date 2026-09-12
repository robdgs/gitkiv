"use client";
import { useEffect, useRef, useState } from "react";

type Status = {
  chainId: number;
  currentBlock: string;
  currentBlockTime: number;
  blockDuration: number;
};

// Proof of life: polls Arkiv's real block height on an interval so the
// number visibly ticks up while you watch — not a static badge, not a
// value frozen at the last full page load.
//
// This polls rather than subscribing over the WebSocket used elsewhere in
// the app (see lib/arkiv/live.ts): watchEntityEvents (a `logs` subscription)
// works fine on this node, but watchBlockNumber (a `newHeads` subscription)
// never delivered a single update in testing — consistently, even alone in
// a fresh tab — so it's an endpoint gap, not something a retry loop fixes.
// Worth flagging in Arkiv feedback; not worth blocking this card on.
export default function ArkivStatusCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [ok, setOk] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const prevBlock = useRef<string | null>(null);
  const [justTicked, setJustTicked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setOk(false);
          return;
        }
        setOk(true);
        setLastChecked(new Date());
        if (prevBlock.current && prevBlock.current !== data.currentBlock) {
          setJustTicked(true);
          setTimeout(() => setJustTicked(false), 600);
        }
        prevBlock.current = data.currentBlock;
        setStatus(data);
      } catch {
        if (!cancelled) setOk(false);
      }
    }

    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!ok) {
    return (
      <div className="mb-6 border border-[#f06fa8]/40 bg-[#f06fa8]/10 rounded-md px-4 py-2.5 text-sm font-semibold text-[#f06fa8]">
        Could not reach Arkiv (Tiramisu) right now — retrying…
      </div>
    );
  }

  return (
    <div className="mb-6 border border-[#f06fa8]/40 bg-[#f06fa8]/10 rounded-md px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
      <span className="flex items-center gap-2 font-bold text-[#f06fa8]">
        <span className="w-2 h-2 rounded-full bg-[#f06fa8] inline-block animate-pulse" />
        Live on Arkiv — Tiramisu testnet
      </span>
      <span className="text-[#dfa8b7]">
        chain id <span className="text-[#fff8fa]">{status?.chainId ?? "…"}</span>
      </span>
      <span className="text-[#dfa8b7]">
        block{" "}
        <span className={`text-[#fff8fa] transition-colors ${justTicked ? "text-[#f06fa8]" : ""}`}>
          #{status?.currentBlock ?? "…"}
        </span>
      </span>
      <span className="text-[#dfa8b7] text-xs">
        {lastChecked ? `checked ${lastChecked.toLocaleTimeString()}` : "connecting…"}
      </span>
      <a
        href="https://tiramisu.explorer.arkiv.network"
        target="_blank"
        rel="noreferrer"
        className="text-[#f06fa8] text-xs ml-auto"
      >
        View on explorer ↗
      </a>
    </div>
  );
}
