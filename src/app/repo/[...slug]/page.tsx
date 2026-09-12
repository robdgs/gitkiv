import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepoFromArkiv, getCommitsFromArkiv } from "@/lib/arkiv/read";
import BranchSwitcher from "./branch-switcher";
import BranchLockPanel from "./branch-lock-panel";
import CommitFileLink from "./commit-file-link";
import SwarmActivityLog from "./swarm-activity-log";

export const dynamic = "force-dynamic";

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
  const repo = await getRepoFromArkiv(repoId);
  if (!repo) return notFound();

  const branch = branchParam || repo.defaultBranch;
  // Arkiv compound attribute query on (repoId, branch[, author]) — no
  // sqlite, subgraph, Ponder or Postgres pipeline in this read path.
  const commits = await getCommitsFromArkiv(repoId, branch, author);

  return (
    <div>
      <Link href="/" className="text-sm text-[#8b949e] hover:text-[#58a6ff]">
        ← All repositories
      </Link>

      <h1 className="text-xl font-bold text-[#e6edf3] mt-2 mb-1">{repo.id}</h1>
      <p className="text-sm text-[#8b949e] mb-4">{repo.description}</p>

      <BranchSwitcher repoId={repoId} currentBranch={branch} currentAuthor={author} />

      <BranchLockPanel repoId={repoId} branch={branch} />

      <div className="text-xs uppercase tracking-wide text-[#8b949e] mt-6 mb-2">
        Commits on {branch}
        {author ? ` by ${author}` : ""} ({commits.length})
      </div>

      <ul className="border border-[#30363d] rounded-md divide-y divide-[#30363d]">
        {commits.length === 0 && (
          <li className="p-4 text-sm text-[#8b949e]">
            No commits match this filter.{" "}
            <Link href={`/repo/${repoId}?branch=${branch}`} className="text-[#58a6ff]">
              Clear author filter
            </Link>
          </li>
        )}
        {commits.map((c) => (
          <li key={c.hash} className="p-4 hover:bg-[#161b22]">
            <p className="text-[#e6edf3]">{c.message}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#8b949e] mt-2">
              <span className="text-[#f0883e] font-bold">{c.hash}</span>
              <span>·</span>
              <span>{c.author}</span>
              <span>·</span>
              <span>{new Date(c.timestamp * 1000).toISOString().slice(0, 10)}</span>
              {c.fileRef && (
                <>
                  <span>·</span>
                  <CommitFileLink
                    fileRef={c.fileRef}
                    fileName={c.fileName ?? "file"}
                    encrypted={c.fileEncrypted}
                    historyRef={c.fileHistoryRef}
                    publisherKey={c.filePublisherKey}
                  />
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <SwarmActivityLog />
    </div>
  );
}
