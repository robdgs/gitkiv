"use client";
import { useEffect, useState } from "react";
import NewCommitForm from "./new-commit-form";
import MergeBranchPanel from "./merge-branch-panel";

type Lock = { repoId: string; branch: string; author: string; lockedAt: number; expiresAt: string };
type Receipt = { entityKey: string; txHash: string };

const inputClass =
  "bg-[#3d2632] border border-[#6b4552] rounded-md px-3 py-1.5 text-sm text-[#fff8fa] focus:outline-none focus:border-[#f06fa8]";
const selectClass =
  "bg-[#3d2632] border border-[#6b4552] rounded-md px-2 py-1.5 text-sm text-[#fff8fa] focus:outline-none focus:border-[#f06fa8] cursor-pointer";

const MAX_DAYS = 7; // matches the server's MAX_LOCK_SECONDS cap (7 days)

function formatDuration(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "0s";
}

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
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(40);
  const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
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
        body: JSON.stringify({ repoId, branch, author, durationSeconds: totalSeconds }),
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
      <div className="mt-4 border border-[#c98799]/40 bg-[#c98799]/10 rounded-md p-4">
        <div className="text-sm font-bold text-[#c98799]">
          🔒 {branch} is locked by {lock.author}
        </div>
        <p className="text-xs text-[#dfa8b7] mt-1">
          New commits and merges are disabled while this reservation is active. It will lift itself —
          this app never calls a delete or a cleanup job.
        </p>
        <p className="text-xs text-[#dfa8b7] mt-1">
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
        <p className="text-xs text-[#f06fa8] mb-2">
          ✓ Lock expired on its own — Arkiv stopped returning it. Commits are unblocked again.
        </p>
      )}

      {receipt && (
        <div className="mb-3 border border-[#f06fa8]/40 bg-[#f06fa8]/10 rounded-md p-3 text-xs flex flex-col gap-1">
          <div className="font-bold text-[#f06fa8]">✓ Locked on Arkiv (Tiramisu testnet)</div>
          <div className="text-[#dfa8b7] break-all">
            tx hash: <span className="text-[#fff8fa]">{receipt.txHash}</span>
          </div>
          <a
            className="text-[#f06fa8] w-fit"
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
          className="px-3 py-1.5 rounded-md border border-[#c98799] text-[#c98799] text-sm hover:bg-[#c98799]/10 cursor-pointer"
        >
          🔒 Lock {branch} (short-lived reservation)
        </button>
      ) : (
        <form onSubmit={acquireLock} className="border border-[#6b4552] rounded-md p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-[#fff8fa]">Lock {branch}</div>
          <p className="text-xs text-[#dfa8b7] -mt-1">
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
          <div>
            <label className="text-xs text-[#dfa8b7] block mb-1">Lock for</label>
            <div className="flex gap-2 flex-wrap">
              <div className="flex flex-col gap-1">
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className={selectClass}
                >
                  {Array.from({ length: MAX_DAYS + 1 }, (_, i) => i).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#dfa8b7] text-center">days</span>
              </div>
              <div className="flex flex-col gap-1">
                <select
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className={selectClass}
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#dfa8b7] text-center">hours</span>
              </div>
              <div className="flex flex-col gap-1">
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className={selectClass}
                >
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#dfa8b7] text-center">minutes</span>
              </div>
              <div className="flex flex-col gap-1">
                <select
                  value={seconds}
                  onChange={(e) => setSeconds(Number(e.target.value))}
                  className={selectClass}
                >
                  {Array.from({ length: 60 }, (_, i) => i).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#dfa8b7] text-center">seconds</span>
              </div>
            </div>
            <p className="text-xs text-[#dfa8b7] mt-2">
              = {formatDuration(totalSeconds)} (~{Math.max(1, Math.ceil(totalSeconds / 2))} blocks)
            </p>
          </div>
          {error && <p className="text-sm font-semibold text-[#f06fa8]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || totalSeconds <= 0}
              className="px-3 py-1.5 rounded-md border border-[#c98799] bg-[#c98799]/20 text-[#c98799] text-sm hover:bg-[#c98799]/30 cursor-pointer disabled:opacity-50"
            >
              {loading ? "Locking on Arkiv…" : `Lock branch for ${formatDuration(totalSeconds)}`}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={loading}
              className="px-3 py-1.5 rounded-md text-sm text-[#dfa8b7] hover:text-[#fff8fa] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <MergeBranchPanel repoId={repoId} targetBranch={branch} />

      <NewCommitForm repoId={repoId} branch={branch} />
    </div>
  );
}
