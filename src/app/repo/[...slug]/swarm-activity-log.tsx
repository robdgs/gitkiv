"use client";
import { useSwarmLog } from "@/lib/swarm-id";

const STATUS_COLOR: Record<string, string> = {
  start: "text-[#8b949e]",
  ok: "text-[#7ee787]",
  error: "text-[#f85149]",
};

const STATUS_ICON: Record<string, string> = {
  start: "…",
  ok: "✓",
  error: "✗",
};

// Every real call to the Swarm ID SDK (init, connect, upload, download)
// lands here as it happens — proof this app is actually talking to Swarm,
// not returning canned data. Also mirrored to the browser console.
export default function SwarmActivityLog() {
  const entries = useSwarmLog();
  if (entries.length === 0) return null;

  return (
    <div className="mt-4 border border-[#30363d] rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-[#8b949e] mb-2">
        Swarm activity (live SDK calls)
      </div>
      <ul className="flex flex-col gap-1 text-xs font-mono">
        {entries.map((e) => (
          <li key={e.id} className="flex items-start gap-2">
            <span className={STATUS_COLOR[e.status]}>{STATUS_ICON[e.status]}</span>
            <span className="text-[#8b949e] whitespace-nowrap">
              {new Date(e.time).toLocaleTimeString()}
            </span>
            <span className="text-[#d29922]">{e.action}</span>
            <span className="text-[#c9d1d9] break-all">{e.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
