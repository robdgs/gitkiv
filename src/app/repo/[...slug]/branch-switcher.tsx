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
    <div className="border border-[#6b4552] rounded-md p-4 flex flex-col gap-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-[#dfa8b7] mb-2">Branch</div>
        <div className="flex flex-wrap gap-2">
          {BRANCHES.map((b) => (
            <button
              key={b}
              onClick={() => go(b, author || undefined)}
              className={`px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${
                b === currentBranch
                  ? "border-[#f06fa8] bg-[#f06fa8]/15 text-[#f06fa8]"
                  : "border-[#6b4552] text-[#fff8fa] hover:border-[#f06fa8]"
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
