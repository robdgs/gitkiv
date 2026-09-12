import Link from "next/link";
import { getReposFromArkiv } from "@/lib/arkiv/read";
import NewRepoForm from "./new-repo-form";

// Every request queries Arkiv live — no build-time snapshot, no cache.
export const dynamic = "force-dynamic";

export default async function RepoListPage() {
  const repos = await getReposFromArkiv();

  return (
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
              </div>
              <span className="text-[#dfa8b7] group-hover:text-[#f06fa8] text-sm whitespace-nowrap">
                View commits →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
