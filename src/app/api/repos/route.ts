import { NextRequest, NextResponse } from "next/server";
import { getReposFromArkiv } from "@/lib/arkiv/read";
import { createRepoOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";
import type { Repo } from "@/lib/types";

export async function GET() {
  const repos = await getReposFromArkiv();
  return NextResponse.json({ source: "arkiv", repos });
}

// Owner/name become a URL path segment and an Arkiv `str` attribute value,
// so keep them short and boring.
const ID_SEGMENT = /^[a-zA-Z0-9._-]{1,40}$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { owner, name, description, defaultBranch } = (body ?? {}) as Record<string, unknown>;

  if (typeof owner !== "string" || !ID_SEGMENT.test(owner)) {
    return NextResponse.json(
      { error: "owner must be 1-40 characters: letters, digits, dot, dash or underscore." },
      { status: 400 }
    );
  }
  if (typeof name !== "string" || !ID_SEGMENT.test(name)) {
    return NextResponse.json(
      { error: "name must be 1-40 characters: letters, digits, dot, dash or underscore." },
      { status: 400 }
    );
  }

  const repo: Repo = {
    id: `${owner}/${name}`,
    owner,
    name,
    defaultBranch: typeof defaultBranch === "string" && defaultBranch.trim() ? defaultBranch.trim() : "main",
    description: typeof description === "string" ? description.slice(0, 200) : "",
  };

  try {
    const result = await createRepoOnArkiv(repo);
    return NextResponse.json(
      { repo, entityKey: result.entityKey, txHash: result.txHash },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("createRepoOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to create repository on Arkiv." }, { status: 500 });
  }
}
