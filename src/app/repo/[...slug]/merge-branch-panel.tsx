"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Receipt = { entityKey: string; txHash: string; mergedFromHash: string | null };

const inputClass =
  "bg-[#3d2632] border border-[#6b4552] rounded-md px-3 py-1.5 text-sm text-[#fff8fa] focus:outline-none focus:border-[#f06fa8]";
const selectClass =
  "bg-[#3d2632] border border-[#6b4552] rounded-md px-2 py-1.5 text-sm text-[#fff8fa] focus:outline-none focus:border-[#f06fa8] cursor-pointer";

// A merge here is a real commit on the target branch with a second parent
// pointer (mergedFromHash) — see api/merges/route.ts. There's no tree to
// combine (no code lives on Arkiv), so this records the merge point, the
// same way a real git merge commit's own object is just metadata too.
export default function MergeBranchPanel({ repoId, targetBranch }: { repoId: string; targetBranch: string }) {
  const router = useRouter();
  const [branches, setBranches] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [sourceBranch, setSourceBranch] = useState("");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/branches?repo=${encodeURIComponent(repoId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.branches)) return;
        const others = data.branches.map((b: { name: string }) => b.name).filter((n: string) => n !== targetBranch);
        setBranches(others);
        if (others.length > 0) setSourceBranch((prev) => prev || others[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repoId, targetBranch]);

  async function mergeBranches(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, sourceBranch, targetBranch, author }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to merge branches.");
      setReceipt({
        entityKey: data.entityKey,
        txHash: data.txHash,
        mergedFromHash: data.commit?.mergedFromHash ?? null,
      });
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (branches.length === 0) return null;

  return (
    <div className="mt-4">
      {receipt && (
        <div className="mb-3 border border-[#f06fa8]/40 bg-[#f06fa8]/10 rounded-md p-3 text-xs flex flex-col gap-1">
          <div className="font-bold text-[#f06fa8]">✓ Merged on Arkiv (Tiramisu testnet)</div>
          <div className="text-[#dfa8b7] break-all">
            tx hash: <span className="text-[#fff8fa]">{receipt.txHash}</span>
          </div>
          {receipt.mergedFromHash && (
            <div className="text-[#dfa8b7] break-all">
              merged from: <span className="text-[#fff8fa]">{receipt.mergedFromHash}</span>
            </div>
          )}
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
          className="px-3 py-1.5 rounded-md border border-[#6b4552] text-[#fff8fa] text-sm hover:border-[#f06fa8] cursor-pointer"
        >
          🔀 Merge into {targetBranch}
        </button>
      ) : (
        <form onSubmit={mergeBranches} className="border border-[#6b4552] rounded-md p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-[#fff8fa]">
            Merge into <span className="text-[#f06fa8]">{targetBranch}</span>
          </div>
          <p className="text-xs text-[#dfa8b7] -mt-1">
            Creates a merge commit on {targetBranch} pointing at {targetBranch}&apos;s previous commit and the
            source branch&apos;s latest commit — no content is combined, only the metadata.
          </p>

          <div>
            <label className="text-xs text-[#dfa8b7] block mb-1">Merge from</label>
            <select value={sourceBranch} onChange={(e) => setSourceBranch(e.target.value)} className={selectClass}>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="your name"
            className={inputClass}
            required
          />

          {error && <p className="text-sm font-semibold text-[#f06fa8]">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 rounded-md border border-[#f06fa8] bg-[#f06fa8]/20 text-[#f06fa8] text-sm hover:bg-[#f06fa8]/30 cursor-pointer disabled:opacity-50"
            >
              {loading ? "Merging on Arkiv…" : `Merge ${sourceBranch} → ${targetBranch}`}
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
    </div>
  );
}
