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
      <div className="mb-6 border border-[#f85149]/40 bg-[#f85149]/5 rounded-md px-4 py-2.5 text-sm text-[#f85149]">
        Could not reach Arkiv (Tiramisu) right now — retrying…
      </div>
    );
  }

  return (
    <div className="mb-6 border border-[#238636]/40 bg-[#238636]/5 rounded-md px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
      <span className="flex items-center gap-2 font-bold text-[#7ee787]">
        <span className="w-2 h-2 rounded-full bg-[#3fb950] inline-block animate-pulse" />
        Live on Arkiv — Tiramisu testnet
      </span>
      <span className="text-[#8b949e]">
        chain id <span className="text-[#c9d1d9]">{status?.chainId ?? "…"}</span>
      </span>
      <span className="text-[#8b949e]">
        block{" "}
        <span className={`text-[#c9d1d9] transition-colors ${justTicked ? "text-[#7ee787]" : ""}`}>
          #{status?.currentBlock ?? "…"}
        </span>
      </span>
      <span className="text-[#8b949e] text-xs">
        {lastChecked ? `checked ${lastChecked.toLocaleTimeString()}` : "connecting…"}
      </span>
      <a
        href="https://tiramisu.explorer.arkiv.network"
        target="_blank"
        rel="noreferrer"
        className="text-[#58a6ff] text-xs ml-auto"
      >
        View on explorer ↗
      </a>
    </div>
  );
}
