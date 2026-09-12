"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const BRANCHES = ["main", "feature/arkiv"];

export default function BranchSwitcher({
  repoId,
  currentBranch,
  currentAuthor,
}: {
  repoId: string;
  currentBranch: string;
  currentAuthor?: string;
}) {
  const router = useRouter();
  const [author, setAuthor] = useState(currentAuthor ?? "");

  function go(branch: string, authorValue?: string) {
    const params = new URLSearchParams({ branch });
    if (authorValue) params.set("author", authorValue);
    router.push(`/repo/${repoId}?${params.toString()}`);
  }

  return (
    <div className="border border-[#30363d] rounded-md p-4 flex flex-col gap-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-[#8b949e] mb-2">Branch</div>
        <div className="flex flex-wrap gap-2">
          {BRANCHES.map((b) => (
            <button
              key={b}
              onClick={() => go(b, author || undefined)}
              className={`px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${
                b === currentBranch
                  ? "border-[#58a6ff] bg-[#1f2937] text-[#58a6ff]"
                  : "border-[#30363d] text-[#c9d1d9] hover:border-[#8b949e]"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(currentBranch, author || undefined);
        }}
      >
        <div className="text-xs uppercase tracking-wide text-[#8b949e] mb-2">
          Filter by author (optional)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. alice"
            className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 w-40 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md border border-[#30363d] text-sm bg-[#21262d] hover:border-[#58a6ff] cursor-pointer"
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
              className="px-3 py-1.5 rounded-md text-sm text-[#8b949e] hover:text-[#c9d1d9] cursor-pointer"
            >
              × clear
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
