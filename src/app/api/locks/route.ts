import { NextRequest, NextResponse } from "next/server";
import { getActiveLock } from "@/lib/arkiv/read";
import { createBranchLockOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";
import { MIN_LOCK_SECONDS, MAX_LOCK_SECONDS } from "@/lib/arkiv/model";
import type { BranchLock } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoId = searchParams.get("repo");
  const branch = searchParams.get("branch");
  if (!repoId || !branch) {
    return NextResponse.json({ error: "repo and branch are required" }, { status: 400 });
  }

  const lock = await getActiveLock(repoId, branch);
  return NextResponse.json({
    lock: lock ? { ...lock, expiresAt: lock.expiresAt.toString() } : null,
    minSeconds: MIN_LOCK_SECONDS,
    maxSeconds: MAX_LOCK_SECONDS,
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { repoId, branch, author, durationSeconds } = (body ?? {}) as Record<string, unknown>;

  if (typeof repoId !== "string" || !repoId) {
    return NextResponse.json({ error: "repoId is required." }, { status: 400 });
  }
  if (typeof branch !== "string" || !branch) {
    return NextResponse.json({ error: "branch is required." }, { status: 400 });
  }
  if (typeof author !== "string" || !author.trim()) {
    return NextResponse.json({ error: "author is required." }, { status: 400 });
  }
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < MIN_LOCK_SECONDS) {
    return NextResponse.json(
      { error: `durationSeconds must be a number of at least ${MIN_LOCK_SECONDS}.` },
      { status: 400 }
    );
  }
  if (durationSeconds > MAX_LOCK_SECONDS) {
    return NextResponse.json(
      { error: `durationSeconds must be at most ${MAX_LOCK_SECONDS} (7 days).` },
      { status: 400 }
    );
  }

  const lock: BranchLock = {
    repoId,
    branch,
    author: author.trim().slice(0, 60),
    lockedAt: Math.floor(Date.now() / 1000),
  };

  try {
    const result = await createBranchLockOnArkiv(lock, durationSeconds);
    return NextResponse.json(
      { lock, entityKey: result.entityKey, txHash: result.txHash, expiresAt: result.expiresAt.toString() },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("createBranchLockOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to create lock on Arkiv." }, { status: 500 });
  }
}
