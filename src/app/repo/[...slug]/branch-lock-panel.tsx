"use client";
import { useEffect, useState } from "react";
import NewCommitForm from "./new-commit-form";

type Lock = { repoId: string; branch: string; author: string; lockedAt: number; expiresAt: string };
type Receipt = { entityKey: string; txHash: string };

const inputClass =
  "bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]";

// Mission 02 (Built to expire): while a lock entity is queryable, commits
// are blocked. Nothing here ever deletes it — this panel just polls the
// same query the read path uses, and reacts when Arkiv stops returning it
// on its own once the expiry block arrives.
export default function BranchLockPanel({ repoId, branch }: { repoId: string; branch: string }) {
  const [lock, setLock] = useState<Lock | null>(null);
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [checked, setChecked] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [wasLocked, setWasLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [lockRes, statusRes] = await Promise.all([
          fetch(`/api/locks?repo=${encodeURIComponent(repoId)}&branch=${encodeURIComponent(branch)}`, {
            cache: "no-store",
          }),
          fetch("/api/status", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const lockData = await lockRes.json();
        const statusData = await statusRes.json();
        if (lockRes.ok) {
          setLock(lockData.lock);
          if (lockData.lock) setWasLocked(true);
        }
        if (statusRes.ok) setCurrentBlock(BigInt(statusData.currentBlock));
        setChecked(true);
      } catch {
        // transient poll failure — keep last known state, try again next tick
      }
    }

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [repoId, branch]);

  async function acquireLock(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, branch, author }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to lock branch.");
      setReceipt({ entityKey: data.entityKey, txHash: data.txHash });
      setLock({ ...data.lock, expiresAt: data.expiresAt });
      setWasLocked(true);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!checked) return null;

  if (lock) {
    const blocksLeft = currentBlock !== null ? Number(BigInt(lock.expiresAt) - currentBlock) : null;
    return (
      <div className="mt-4 border border-[#d29922]/40 bg-[#d29922]/5 rounded-md p-4">
        <div className="text-sm font-bold text-[#d29922]">
          🔒 {branch} is locked by {lock.author}
        </div>
        <p className="text-xs text-[#8b949e] mt-1">
          New commits are disabled while this reservation is active. It will lift itself — this app
          never calls a delete or a cleanup job.
        </p>
        <p className="text-xs text-[#8b949e] mt-1">
          {blocksLeft !== null && blocksLeft > 0
            ? `expires in ~${blocksLeft} block${blocksLeft === 1 ? "" : "s"} (~${blocksLeft * 2}s) · at block #${lock.expiresAt}`
            : "expiring any moment…"}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {wasLocked && (
        <p className="text-xs text-[#7ee787] mb-2">
          ✓ Lock expired on its own — Arkiv stopped returning it. Commits are unblocked again.
        </p>
      )}

      {receipt && (
        <div className="mb-3 border border-[#238636]/40 bg-[#238636]/5 rounded-md p-3 text-xs flex flex-col gap-1">
          <div className="font-bold text-[#7ee787]">✓ Locked on Arkiv (Tiramisu testnet)</div>
          <div className="text-[#8b949e] break-all">
            tx hash: <span className="text-[#c9d1d9]">{receipt.txHash}</span>
          </div>
          <a
            className="text-[#58a6ff] w-fit"
            target="_blank"
            rel="noreferrer"
            href={`https://tiramisu.explorer.arkiv.network/tx/${receipt.txHash}`}
          >
            View transaction ↗
          </a>
        </div>
      )}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 rounded-md border border-[#d29922] text-[#d29922] text-sm hover:bg-[#d29922]/10 cursor-pointer"
        >
          🔒 Lock {branch} (short-lived reservation)
        </button>
      ) : (
        <form onSubmit={acquireLock} className="border border-[#30363d] rounded-md p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-[#e6edf3]">Lock {branch}</div>
          <p className="text-xs text-[#8b949e] -mt-1">
            Creates a real Arkiv entity with a short block-based expiry. Blocks commits until it
            expires on its own.
          </p>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="your name"
            className={inputClass}
            required
          />
          {error && <p className="text-sm text-[#f85149]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 rounded-md border border-[#d29922] bg-[#d29922]/20 text-[#d29922] text-sm hover:bg-[#d29922]/30 cursor-pointer disabled:opacity-50"
            >
              {loading ? "Locking on Arkiv…" : "Lock branch"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={loading}
              className="px-3 py-1.5 rounded-md text-sm text-[#8b949e] hover:text-[#c9d1d9] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <NewCommitForm repoId={repoId} branch={branch} />
    </div>
  );
}
