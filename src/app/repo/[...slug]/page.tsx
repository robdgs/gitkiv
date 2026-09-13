import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRepoFromArkiv,
  getCommitsFromArkiv,
  getBranchesFromArkiv,
  getStarCount,
  getIssuesFromArkiv,
  getRepoReadme,
} from "@/lib/arkiv/read";
import BranchSwitcher from "./branch-switcher";
import BranchLockPanel from "./branch-lock-panel";
import CommitFileLink from "./commit-file-link";
import SwarmActivityLog from "./swarm-activity-log";
import LiveFeed from "./live-feed";
import StarButton from "./star-button";
import IssuesPanel from "./issues-panel";
import RepoTabs from "./repo-tabs";
import RepoReadme from "./repo-readme";

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
  const [commits, realBranches, starCount, openIssues, readme] = await Promise.all([
    getCommitsFromArkiv(repoId, branch, author),
    getBranchesFromArkiv(repoId),
    getStarCount(repoId),
    getIssuesFromArkiv(repoId, "open"),
    getRepoReadme(repoId),
  ]);
  // Repos created before branches existed as entities have none yet —
  // fall back to the repo's own defaultBranch rather than an empty list.
  const branches = realBranches.length > 0 ? realBranches.map((b) => b.name) : [repo.defaultBranch];

  const code = (
    <>
      <BranchSwitcher repoId={repoId} branches={branches} currentBranch={branch} currentAuthor={author} />

      <BranchLockPanel repoId={repoId} branch={branch} />

      <LiveFeed repoId={repoId} branch={branch} />

      <div className="text-xs uppercase tracking-wide text-[#dfa8b7] mt-6 mb-2">📖 README.md</div>
      <RepoReadme repoId={repoId} initialMarkdown={readme?.markdown ?? null} initialEntityKey={readme?.entityKey ?? null} />

      <div className="text-xs uppercase tracking-wide text-[#dfa8b7] mt-6 mb-2">
        Commits on {branch}
        {author ? ` by ${author}` : ""} ({commits.length})
      </div>

      <ul className="border border-[#6b4552] rounded-md divide-y divide-[#6b4552]">
        {commits.length === 0 && (
          <li className="p-4 text-sm text-[#dfa8b7]">
            No commits match this filter.{" "}
            <Link href={`/repo/${repoId}?branch=${branch}`} className="text-[#f06fa8]">
              Clear author filter
            </Link>
          </li>
        )}
        {commits.map((c) => (
          <li key={c.hash} className="p-3 flex items-start justify-between gap-4 hover:bg-[#3d2632]">
            <div className="min-w-0">
              <p className="text-[#fff8fa] font-bold truncate">
                {c.mergedFromBranch ? "🔀 " : ""}
                {c.message}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#dfa8b7] mt-1.5">
                <span>{c.author}</span>
                <span>committed on {new Date(c.timestamp * 1000).toISOString().slice(0, 10)}</span>
                {c.mergedFromBranch && c.mergedFromHash && (
                  <>
                    <span>·</span>
                    <span>
                      merged {c.mergedFromBranch}@<span className="text-[#c98799]">{c.mergedFromHash}</span>
                    </span>
                  </>
                )}
                {c.fileRef && (
                  <>
                    <span>·</span>
                    <CommitFileLink
                      fileRef={c.fileRef}
                      fileName={c.fileName ?? "file"}
                      encrypted={c.fileEncrypted}
                      historyRef={c.fileHistoryRef}
                      publisherKey={c.filePublisherKey}
                      isFolder={c.fileIsFolder}
                    />
                  </>
                )}
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs text-[#f06fa8] bg-[#3d2632] border border-[#6b4552] rounded-md px-2 py-1">
              {c.hash}
            </span>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-[#dfa8b7] hover:text-[#f06fa8]">
          ← All repositories
        </Link>
        <StarButton repoId={repoId} initialCount={starCount} />
      </div>

      <h1 className="flex items-center gap-1.5 text-xl font-bold text-[#fff8fa] mt-2">
        <span aria-hidden="true" className="text-[#dfa8b7]">
          📦
        </span>
        <span className="text-[#dfa8b7] font-normal">{repo.owner}</span>
        <span className="text-[#dfa8b7] font-normal">/</span>
        <span>{repo.name}</span>
      </h1>
      <p className="text-sm text-[#dfa8b7] mt-1 mb-4">{repo.description}</p>

      <RepoTabs
        openIssueCount={openIssues.length}
        code={code}
        issues={<IssuesPanel repoId={repoId} />}
      />

      <SwarmActivityLog />
    </div>
  );
}
