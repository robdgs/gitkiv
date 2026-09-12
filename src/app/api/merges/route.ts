import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createCommitOnArkiv, getLatestCommitHash, moveBranchCommitsOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";
import type { Commit } from "@/lib/types";

// A merge is just a commit on the target branch with a second parent
// pointer (mergedFromHash) — the same shape createCommitOnArkiv already
// writes and locks/queries against. There's no tree or diff to combine:
// this app never put code on Arkiv, so a "merge" here only ever records
// that it happened and where the source branch was, exactly like a real
// git merge commit's metadata (its combined tree is a separate concern).
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { repoId, sourceBranch, targetBranch, author } = (body ?? {}) as Record<string, unknown>;

  if (typeof repoId !== "string" || !repoId) {
    return NextResponse.json({ error: "repoId is required." }, { status: 400 });
  }
  if (typeof sourceBranch !== "string" || !sourceBranch) {
    return NextResponse.json({ error: "sourceBranch is required." }, { status: 400 });
  }
  if (typeof targetBranch !== "string" || !targetBranch) {
    return NextResponse.json({ error: "targetBranch is required." }, { status: 400 });
  }
  if (sourceBranch === targetBranch) {
    return NextResponse.json({ error: "Can't merge a branch into itself." }, { status: 400 });
  }
  if (typeof author !== "string" || !author.trim()) {
    return NextResponse.json({ error: "author is required." }, { status: 400 });
  }

  try {
    const [targetLatestHash, sourceLatestHash] = await Promise.all([
      getLatestCommitHash(repoId, targetBranch),
      getLatestCommitHash(repoId, sourceBranch),
    ]);

    if (sourceLatestHash === null) {
      return NextResponse.json({ error: `Branch "${sourceBranch}" has no commits to merge.` }, { status: 409 });
    }

    const commit: Commit = {
      hash: randomBytes(4).toString("hex"),
      repoId,
      branch: targetBranch,
      author: author.trim().slice(0, 60),
      parentHash: targetLatestHash,
      timestamp: Math.floor(Date.now() / 1000),
      message: `Merge branch '${sourceBranch}' into ${targetBranch}`,
      mergedFromBranch: sourceBranch,
      mergedFromHash: sourceLatestHash,
    };

    const result = await createCommitOnArkiv(commit);

    // Best-effort: the merge itself already succeeded above. If this part
    // fails partway, the merge commit still stands — just some of the
    // source branch's own commits may not have moved yet.
    try {
      await moveBranchCommitsOnArkiv(repoId, sourceBranch, targetBranch);
    } catch (moveError) {
      console.error("moveBranchCommitsOnArkiv failed after merge:", moveError);
    }

    return NextResponse.json({ commit, entityKey: result.entityKey, txHash: result.txHash }, { status: 201 });
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("mergeBranches failed:", error);
    return NextResponse.json({ error: "Failed to merge branches on Arkiv." }, { status: 500 });
  }
}
