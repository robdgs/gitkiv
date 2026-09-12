import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCommitsFromArkiv } from "@/lib/arkiv/read";
import { createCommitOnArkiv, getLatestCommitHash, ArkivWriteError } from "@/lib/arkiv/write";
import type { Commit } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoId = searchParams.get("repo");
  const branch = searchParams.get("branch");
  const author = searchParams.get("author") ?? undefined;

  if (!repoId || !branch) {
    return NextResponse.json({ error: "repo and branch are required" }, { status: 400 });
  }

  const commits = await getCommitsFromArkiv(repoId, branch, author);
  return NextResponse.json({ source: "arkiv", commits });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    repoId,
    branch,
    author,
    message,
    fileRef,
    fileName,
    fileEncrypted,
    fileHistoryRef,
    filePublisherKey,
    fileIsFolder,
  } = (body ?? {}) as Record<string, unknown>;

  if (typeof repoId !== "string" || !repoId) {
    return NextResponse.json({ error: "repoId is required." }, { status: 400 });
  }
  if (typeof branch !== "string" || !branch) {
    return NextResponse.json({ error: "branch is required." }, { status: 400 });
  }
  if (typeof author !== "string" || !author.trim()) {
    return NextResponse.json({ error: "author is required." }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }
  if (fileRef !== undefined && (typeof fileRef !== "string" || !/^[0-9a-f]{64}([0-9a-f]{64})?$/i.test(fileRef))) {
    return NextResponse.json({ error: "fileRef must be a 64 or 128 character hex Swarm reference." }, { status: 400 });
  }
  if (fileName !== undefined && typeof fileName !== "string") {
    return NextResponse.json({ error: "fileName must be a string." }, { status: 400 });
  }
  if (fileIsFolder !== undefined && typeof fileIsFolder !== "boolean") {
    return NextResponse.json({ error: "fileIsFolder must be a boolean." }, { status: 400 });
  }
  if (fileIsFolder && fileEncrypted) {
    return NextResponse.json({ error: "Folder uploads can't be encrypted." }, { status: 400 });
  }
  if (fileEncrypted) {
    if (typeof fileHistoryRef !== "string" || !/^[0-9a-f]{64}([0-9a-f]{64})?$/i.test(fileHistoryRef)) {
      return NextResponse.json(
        { error: "fileHistoryRef must be a 64 or 128 character hex reference." },
        { status: 400 }
      );
    }
    if (typeof filePublisherKey !== "string" || !/^[0-9a-f]{66}$/i.test(filePublisherKey)) {
      return NextResponse.json(
        { error: "filePublisherKey must be a 66 character hex compressed public key." },
        { status: 400 }
      );
    }
  }

  const commit: Commit = {
    hash: randomBytes(4).toString("hex"),
    repoId,
    branch,
    author: author.trim().slice(0, 60),
    parentHash: await getLatestCommitHash(repoId, branch),
    timestamp: Math.floor(Date.now() / 1000),
    message: message.trim().slice(0, 200),
    ...(fileRef
      ? {
          fileRef,
          fileName: (fileName as string | undefined)?.slice(0, 100) ?? "file",
          ...(fileIsFolder ? { fileIsFolder: true } : {}),
          ...(fileEncrypted
            ? {
                fileEncrypted: true,
                fileHistoryRef: fileHistoryRef as string,
                filePublisherKey: filePublisherKey as string,
              }
            : {}),
        }
      : {}),
  };

  try {
    const result = await createCommitOnArkiv(commit);
    return NextResponse.json(
      { commit, entityKey: result.entityKey, txHash: result.txHash },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("createCommitOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to create commit on Arkiv." }, { status: 500 });
  }
}
