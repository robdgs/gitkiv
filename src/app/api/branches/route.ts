import { NextRequest, NextResponse } from "next/server";
import { getBranchesFromArkiv } from "@/lib/arkiv/read";
import { createBranchOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoId = searchParams.get("repo");
  if (!repoId) {
    return NextResponse.json({ error: "repo is required." }, { status: 400 });
  }

  const branches = await getBranchesFromArkiv(repoId);
  return NextResponse.json({ source: "arkiv", branches });
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,59}$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { repoId, name } = (body ?? {}) as Record<string, unknown>;

  if (typeof repoId !== "string" || !repoId) {
    return NextResponse.json({ error: "repoId is required." }, { status: 400 });
  }
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "name must be 1-60 chars: letters, digits, dot, dash, underscore or slash." },
      { status: 400 }
    );
  }

  try {
    const result = await createBranchOnArkiv(repoId, name);
    return NextResponse.json(
      { branch: { repoId, name }, entityKey: result.entityKey, txHash: result.txHash },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("createBranchOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to create branch on Arkiv." }, { status: 500 });
  }
}
