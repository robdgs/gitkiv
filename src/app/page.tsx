import Link from "next/link";
import { getReposFromDB } from "@/lib/db";

export default function RepoListPage() {
  const repos = getReposFromDB();

  return (
    <div>
      <h1 className="text-lg text-[#c9d1d9] mb-4">$ ls repos</h1>
      <ul className="border border-[#30363d] rounded-md divide-y divide-[#30363d]">
        {repos.map((repo) => (
          <li key={repo.id} className="p-4 hover:bg-[#161b22]">
            <Link href={`/repo/${repo.id}`} className="font-bold">
              {repo.id}
            </Link>
            <p className="text-sm text-[#8b949e] mt-1">{repo.description}</p>
            <p className="text-xs text-[#8b949e] mt-1">default branch: {repo.defaultBranch}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
