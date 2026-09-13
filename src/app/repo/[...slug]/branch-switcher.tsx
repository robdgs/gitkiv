"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,59}$/;

export default function BranchSwitcher({
  repoId,
  branches,
  currentBranch,
  currentAuthor,
}: {
  repoId: string;
  branches: string[];
  currentBranch: string;
  currentAuthor?: string;
}) {
  const router = useRouter();
  const [author, setAuthor] = useState(currentAuthor ?? "");
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(branch: string, authorValue?: string) {
    const params = new URLSearchParams({ branch });
    if (authorValue) params.set("author", authorValue);
    router.push(`/repo/${repoId}?${params.toString()}`);
  }

  async function createBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!NAME_RE.test(newBranchName)) {
      setError("1-60 chars: letters, digits, dot, dash, underscore or slash.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, name: newBranchName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create branch.");
      setShowNewBranch(false);
      setNewBranchName("");
      go(newBranchName, author || undefined);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="border border-[#6b4552] rounded-md p-4 flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#f06fa8]">
              ⑂
            </span>
            <select
              value={currentBranch}
              onChange={(e) => go(e.target.value, author || undefined)}
              className="appearance-none bg-[#3d2632] border border-[#6b4552] rounded-md pl-7 pr-7 py-1.5 text-sm font-bold text-[#fff8fa] hover:border-[#f06fa8] cursor-pointer focus:outline-none focus:border-[#f06fa8]"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#dfa8b7] text-xs">
              ▾
            </span>
          </div>
          <span className="text-xs text-[#dfa8b7]">
            {branches.length} branch{branches.length === 1 ? "" : "es"}
          </span>
          {!showNewBranch ? (
            <button
              type="button"
              onClick={() => setShowNewBranch(true)}
              className="px-3 py-1.5 rounded-md border border-dashed border-[#6b4552] text-[#dfa8b7] text-sm hover:border-[#f06fa8] hover:text-[#f06fa8] cursor-pointer"
            >
              + new branch
            </button>
          ) : (
            <form onSubmit={createBranch} className="flex items-center gap-2">
              <input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="e.g. feature/x"
                autoFocus
                className="bg-[#3d2632] border border-[#6b4552] rounded-md px-3 py-1.5 w-36 text-sm text-[#fff8fa] focus:outline-none focus:border-[#f06fa8]"
              />
              <button
                type="submit"
                disabled={creating}
                className="px-3 py-1.5 rounded-md border border-[#f06fa8] bg-[#f06fa8]/20 text-[#f06fa8] text-sm hover:bg-[#f06fa8]/30 cursor-pointer disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewBranch(false);
                  setError(null);
                }}
                disabled={creating}
                className="text-sm text-[#dfa8b7] hover:text-[#fff8fa] cursor-pointer"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
        {error && <p className="text-xs font-semibold text-[#f06fa8] mt-2">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(currentBranch, author || undefined);
        }}
      >
        <div className="text-xs uppercase tracking-wide text-[#dfa8b7] mb-2">
          Filter by author (optional)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. alice"
            className="bg-[#3d2632] border border-[#6b4552] rounded-md px-3 py-1.5 w-40 text-sm text-[#fff8fa] focus:outline-none focus:border-[#f06fa8]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md border border-[#6b4552] text-sm bg-[#3d2632] text-[#fff8fa] hover:border-[#f06fa8] cursor-pointer"
          >
            Filter
          </button>
          {currentAuthor && (
            <button
              type="button"
              onClick={() => {
                setAuthor("");
                go(currentBranch, undefined);
              }}
              className="px-3 py-1.5 rounded-md text-sm text-[#dfa8b7] hover:text-[#fff8fa] cursor-pointer"
            >
              × clear
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
