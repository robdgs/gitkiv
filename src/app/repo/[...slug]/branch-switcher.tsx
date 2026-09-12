"use client";
import { useRouter } from "next/navigation";

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

  function go(branch: string, author?: string) {
    const params = new URLSearchParams({ branch });
    if (author) params.set("author", author);
    router.push(`/repo/${repoId}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[#8b949e]">branch:</span>
      {BRANCHES.map((b) => (
        <button
          key={b}
          onClick={() => go(b, currentAuthor)}
          className={`px-2 py-1 rounded border ${
            b === currentBranch
              ? "border-[#58a6ff] text-[#58a6ff]"
              : "border-[#30363d] text-[#c9d1d9] hover:border-[#8b949e]"
          }`}
        >
          {b}
        </button>
      ))}
      <span className="text-[#8b949e] ml-4">author:</span>
      <input
        defaultValue={currentAuthor ?? ""}
        placeholder="all"
        onKeyDown={(e) => {
          if (e.key === "Enter") go(currentBranch, (e.target as HTMLInputElement).value || undefined);
        }}
        className="bg-[#161b22] border border-[#30363d] rounded px-2 py-1 w-28 text-[#c9d1d9]"
      />
    </div>
  );
}
