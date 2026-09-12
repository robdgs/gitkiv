"use client";
import { useState } from "react";

// Every other write in this app only ever creates a new entity. Starring
// patches the SAME star_count entity in place (see starRepoOnArkiv) — the
// entity key never changes, only its payload does.
export default function StarButton({ repoId, initialCount }: { repoId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justStarred, setJustStarred] = useState(false);

  async function star() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to star repository.");
      setCount(data.count);
      setJustStarred(true);
      setTimeout(() => setJustStarred(false), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={star}
        disabled={loading}
        className="px-3 py-1.5 rounded-md border border-[#6b4552] text-sm hover:border-[#f06fa8] cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
      >
        <span className={justStarred ? "text-[#f06fa8]" : "text-[#dfa8b7]"}>⭐</span>
        <span className="text-[#fff8fa]">{count}</span>
      </button>
      {error && <span className="text-xs font-semibold text-[#f06fa8]">{error}</span>}
    </span>
  );
}
