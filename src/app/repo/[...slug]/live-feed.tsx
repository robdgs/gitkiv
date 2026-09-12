"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { watchRepoActivity, type ActivityEvent } from "@/lib/arkiv/live";

// Mission 03 (Live wire): a real WebSocket subscription to Arkiv, filtered
// to this app's own writes, then to this exact repo+branch. A matching
// event triggers router.refresh() — an event-triggered re-render, not a
// setInterval poll. An irrelevant event (wrong repo/branch) is shown too,
// proving the filter actually discriminates rather than refreshing blindly.
export default function LiveFeed({ repoId, branch }: { repoId: string; branch: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    let cancelled = false;

    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.writerAddress) return;
        unwatch = watchRepoActivity(repoId, branch, data.writerAddress, (event) => {
          setEvents((prev) => [event, ...prev].slice(0, 20));
          if (event.matched) router.refresh();
        });
        setConnected(true);
      })
      .catch(() => setConnected(false));

    return () => {
      cancelled = true;
      setConnected(false);
      unwatch?.();
    };
  }, [repoId, branch, router]);

  return (
    <div className="mt-4 border border-[#6b4552] rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-[#dfa8b7] mb-2 flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full inline-block ${
            connected ? "bg-[#f06fa8] animate-pulse" : "bg-[#6b4552]"
          }`}
        />
        Arkiv live feed — WebSocket, no polling
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-[#dfa8b7]">
          {connected ? "Connected — listening for new commits/locks…" : "Connecting…"}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs font-mono">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <span className={e.matched ? "text-[#f06fa8]" : "text-[#dfa8b7]"}>{e.matched ? "✓" : "·"}</span>
              <span className="text-[#dfa8b7] whitespace-nowrap">{new Date(e.time).toLocaleTimeString()}</span>
              <span className="text-[#fff8fa]">{e.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
