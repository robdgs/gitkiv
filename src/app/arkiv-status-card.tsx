"use client";
import { useEffect, useRef, useState } from "react";
import { watchLiveBlockNumber, TIRAMISU_CHAIN_ID } from "@/lib/arkiv/live";

// Proof of life, Mission-03 style: the block number is pushed over a
// WebSocket subscription (watchBlockNumber), not fetched on a timer. It
// still visibly ticks up while you watch — now because the chain told us,
// not because we asked again.
export default function ArkivStatusCard() {
  const [block, setBlock] = useState<bigint | null>(null);
  const [ok, setOk] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const prevBlock = useRef<bigint | null>(null);
  const [justTicked, setJustTicked] = useState(false);

  useEffect(() => {
    const unwatch = watchLiveBlockNumber(
      (n) => {
        setOk(true);
        setLastUpdate(new Date());
        if (prevBlock.current !== null && prevBlock.current !== n) {
          setJustTicked(true);
          setTimeout(() => setJustTicked(false), 600);
        }
        prevBlock.current = n;
        setBlock(n);
      },
      () => setOk(false)
    );
    return () => unwatch();
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
        chain id <span className="text-[#fff8fa]">{TIRAMISU_CHAIN_ID}</span>
      </span>
      <span className="text-[#dfa8b7]">
        block{" "}
        <span className={`text-[#fff8fa] transition-colors ${justTicked ? "text-[#f06fa8]" : ""}`}>
          #{block?.toString() ?? "…"}
        </span>
      </span>
      <span className="text-[#dfa8b7] text-xs">
        {lastUpdate ? `pushed ${lastUpdate.toLocaleTimeString()}` : "connecting…"}
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
