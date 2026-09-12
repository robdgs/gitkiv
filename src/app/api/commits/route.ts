import { NextRequest, NextResponse } from "next/server";
import { getCommitsFromDB } from "@/lib/db";
// MIGRATION TARGET: after Mission 01, replace the import above with:
//   import { getCommitsFromArkiv } from "@/lib/arkiv";
// and call that instead. Nothing else in this file should need to change,
// since Commit[] shape stays the same.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoId = searchParams.get("repo");
  const branch = searchParams.get("branch");
  const author = searchParams.get("author") ?? undefined;

  if (!repoId || !branch) {
    return NextResponse.json({ error: "repo and branch are required" }, { status: 400 });
  }

  const commits = getCommitsFromDB(repoId, branch, author);
  return NextResponse.json({ source: "sqlite-baseline", commits });
}
