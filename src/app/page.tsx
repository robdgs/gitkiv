import Link from "next/link";
import { getReposFromArkiv, getAllStarCounts, getContributionCounts, getProfileReadme } from "@/lib/arkiv/read";
import NewRepoForm from "./new-repo-form";
import WalletProfile from "./wallet-profile";
import ContributionGraph from "./contribution-graph";
import ProfileReadme from "./profile-readme";

// Every request queries Arkiv live — no build-time snapshot, no cache.
export const dynamic = "force-dynamic";

export default async function RepoListPage() {
  const [repos, starCounts, contributionCounts, readme] = await Promise.all([
    getReposFromArkiv(),
    getAllStarCounts(),
    getContributionCounts(),
    getProfileReadme(),
  ]);
  const stars = new Map(starCounts.map((s) => [s.repoId, s.count]));
  const totalStars = starCounts.reduce((sum, s) => sum + s.count, 0);
  const starredRepos = repos
    .map((repo) => ({ ...repo, stars: stars.get(repo.id) ?? 0 }))
    .filter((repo) => repo.stars > 0)
    .sort((a, b) => b.stars - a.stars);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-start">
      <aside className="flex flex-col gap-4 md:sticky md:top-6">
        <WalletProfile />
        <div className="flex flex-col gap-1.5 text-xs text-[#dfa8b7] px-1">
          <div>
            <span className="text-[#fff8fa] font-bold">{repos.length}</span> repositories
          </div>
          <div>
            <span className="text-[#fff8fa] font-bold">{totalStars}</span> stars given
          </div>
        </div>
      </aside>

      <div>
      <pre
        aria-hidden="true"
        className="text-[#f06fa8] text-[9px] sm:text-xs leading-[1.05] text-center select-none overflow-x-auto mb-4"
      >
{`⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢀⣠⣶⣾⣿⣿⣿⣿⣿⣿⣿⣷⣶⣤⣀⣤⣾⣿⣿⣿⣿⣿⣷⣦⣀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⡀⠀
⠀⠀⢀⣴⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀
⠀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡀⠙⢿⣿⣿⣿⣿⣿⣿⡇
⠀⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠸⣿⣿⣿⣿⣿⣿⡇
⠀⠀⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⢸⣿⣿⣿⣿⣿⣿⠇
⠀⠀⠸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠇⢀⣾⣿⣿⣿⣿⣿⡟⠀
⠀⠀⣹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⢀⣾⣿⣿⣿⣿⣿⡟⠁⠀
⠠⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠏⠀⣾⣿⣿⣿⣿⣿⠟⠀⠀⠀
⠀⢈⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠋⠁⠀⢸⣿⣿⣿⣿⣿⡏⠀⠀⠀⠀
⠀⠀⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠏⠀⠀⠀⠀⠸⣿⣿⣿⣿⣿⣧⡀⠀⣀⡄
⠀⠀⠈⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠀⠀⠀⠀⠀⠀⠹⣿⣿⣿⣿⣿⣿⣿⠟⠀
⠀⠀⠀⠘⠿⠿⠿⠛⠋⠉⠉⢿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠛⠛⠉⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⣿⣿⣿⣿⣿⣿⣿⣿⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠿⠦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣾⣿⣿⣿⣿⣿⣿⡿⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣾⣿⣿⣿⣿⣿⡿⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⣴⣿⣿⣿⣿⠿⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`}
      </pre>

      <ProfileReadme initialMarkdown={readme?.markdown ?? null} initialEntityKey={readme?.entityKey ?? null} />

      <div className="mb-6">
        <ContributionGraph counts={contributionCounts} />
      </div>

      <h1 className="text-xl font-bold text-[#fff8fa] mb-1">Repositories</h1>
      <p className="text-sm text-[#dfa8b7] mb-4">
        Click a repository to see its commit log. Only commit metadata lives here — no source
        code is stored on Arkiv.
      </p>

      <NewRepoForm />

      {repos.length === 0 && (
        <div className="border border-dashed border-[#6b4552] rounded-md p-6 text-sm text-[#dfa8b7]">
          No repositories found on Arkiv yet. Run <code className="text-[#f06fa8]">npm run arkiv:seed</code>{" "}
          to populate demo data.
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {repos.map((repo) => (
          <li key={repo.id}>
            <Link
              href={`/repo/${repo.id}`}
              className="group flex items-center justify-between gap-4 border border-[#6b4552] rounded-md p-4 hover:border-[#f06fa8] hover:bg-[#3d2632] transition-colors no-underline hover:no-underline"
            >
              <div>
                <div className="font-bold text-[#f06fa8]">{repo.id}</div>
                <p className="text-sm text-[#dfa8b7] mt-1">{repo.description}</p>
                <span className="inline-block mt-2 text-xs text-[#dfa8b7] border border-[#6b4552] rounded-full px-2 py-0.5">
                  default branch: {repo.defaultBranch}
                </span>
                {(stars.get(repo.id) ?? 0) > 0 && (
                  <span className="inline-block mt-2 ml-2 text-xs text-[#fff8fa]">
                    ⭐ {stars.get(repo.id)}
                  </span>
                )}
              </div>
              <span className="text-[#dfa8b7] group-hover:text-[#f06fa8] text-sm whitespace-nowrap">
                View commits →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {starredRepos.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs uppercase tracking-wide text-[#dfa8b7] mb-2">⭐ Starred repositories</h2>
          <ul className="flex flex-col gap-2">
            {starredRepos.map((repo) => (
              <li key={repo.id}>
                <Link
                  href={`/repo/${repo.id}`}
                  className="flex items-center justify-between gap-4 border border-[#c98799]/40 bg-[#c98799]/5 rounded-md p-3 hover:border-[#f06fa8] transition-colors no-underline hover:no-underline"
                >
                  <div>
                    <div className="font-bold text-[#f06fa8]">{repo.id}</div>
                    <p className="text-xs text-[#dfa8b7] mt-0.5">{repo.description}</p>
                  </div>
                  <span className="text-sm text-[#fff8fa] whitespace-nowrap">⭐ {repo.stars}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </div>
  );
}
