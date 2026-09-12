import { notFound } from "next/navigation";
import { getRepoFromDB, getCommitsFromDB } from "@/lib/db";
import BranchSwitcher from "./branch-switcher";

export default async function RepoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ branch?: string; author?: string }>;
}) {
  const { slug } = await params;
  const { branch: branchParam, author } = await searchParams;
  const repoId = slug.join("/");
  const repo = getRepoFromDB(repoId);
  if (!repo) return notFound();

  const branch = branchParam || repo.defaultBranch;
  // Baseline read path (pre-Arkiv). Mission 01 target: swap this call site
  // for an Arkiv compound attribute query on (repoId, branch[, author]).
  const commits = getCommitsFromDB(repoId, branch, author);

  return (
    <div>
      <h1 className="text-lg mb-1">
        <span className="text-[#8b949e]">$ git log</span> {repo.id}
      </h1>
      <p className="text-xs text-[#8b949e] mb-4">{repo.description}</p>

      <BranchSwitcher repoId={repoId} currentBranch={branch} currentAuthor={author} />

      <ul className="mt-4 border border-[#30363d] rounded-md divide-y divide-[#30363d]">
        {commits.length === 0 && (
          <li className="p-4 text-sm text-[#8b949e]">No commits for this filter.</li>
        )}
        {commits.map((c) => (
          <li key={c.hash} className="p-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[#f0883e]">{c.hash}</span>
              <span className="text-[#8b949e]">{c.author}</span>
              <span className="text-[#8b949e]">
                {new Date(c.timestamp * 1000).toISOString().slice(0, 10)}
              </span>
            </div>
            <p className="mt-1">{c.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
