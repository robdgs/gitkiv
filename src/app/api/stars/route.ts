import { NextRequest, NextResponse } from "next/server";
import { getStarCount } from "@/lib/arkiv/read";
import { starRepoOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoId = searchParams.get("repo");
  if (!repoId) {
    return NextResponse.json({ error: "repo is required." }, { status: 400 });
  }

  const count = await getStarCount(repoId);
  return NextResponse.json({ source: "arkiv", count });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { repoId } = (body ?? {}) as Record<string, unknown>;
  if (typeof repoId !== "string" || !repoId) {
    return NextResponse.json({ error: "repoId is required." }, { status: 400 });
  }

  try {
    const result = await starRepoOnArkiv(repoId);
    return NextResponse.json(
      { count: result.count, entityKey: result.entityKey, txHash: result.txHash },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("starRepoOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to star repository on Arkiv." }, { status: 500 });
  }
}
