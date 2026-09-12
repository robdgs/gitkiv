import Link from "next/link";
import { getReposFromArkiv } from "@/lib/arkiv/read";
import NewRepoForm from "./new-repo-form";

// Every request queries Arkiv live — no build-time snapshot, no cache.
export const dynamic = "force-dynamic";

export default async function RepoListPage() {
  const repos = await getReposFromArkiv();

  return (
    <div>
      <h1 className="text-xl font-bold text-[#e6edf3] mb-1">Repositories</h1>
      <p className="text-sm text-[#8b949e] mb-4">
        Click a repository to see its commit log. Only commit metadata lives here — no source
        code is stored on Arkiv.
      </p>

      <NewRepoForm />

      {repos.length === 0 && (
        <div className="border border-dashed border-[#30363d] rounded-md p-6 text-sm text-[#8b949e]">
          No repositories found on Arkiv yet. Run <code className="text-[#c9d1d9]">npm run arkiv:seed</code>{" "}
          to populate demo data.
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {repos.map((repo) => (
          <li key={repo.id}>
            <Link
              href={`/repo/${repo.id}`}
              className="group flex items-center justify-between gap-4 border border-[#30363d] rounded-md p-4 hover:border-[#58a6ff] hover:bg-[#161b22] transition-colors no-underline hover:no-underline"
            >
              <div>
                <div className="font-bold text-[#58a6ff]">{repo.id}</div>
                <p className="text-sm text-[#8b949e] mt-1">{repo.description}</p>
                <span className="inline-block mt-2 text-xs text-[#8b949e] border border-[#30363d] rounded-full px-2 py-0.5">
                  default branch: {repo.defaultBranch}
                </span>
              </div>
              <span className="text-[#8b949e] group-hover:text-[#58a6ff] text-sm whitespace-nowrap">
                View commits →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
