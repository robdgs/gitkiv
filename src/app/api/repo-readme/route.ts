import { NextRequest, NextResponse } from "next/server";
import { getRepoReadme } from "@/lib/arkiv/read";
import { setRepoReadmeOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";

const MAX_MARKDOWN_BYTES = 20_000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoId = searchParams.get("repo");
  if (!repoId) {
    return NextResponse.json({ error: "repo is required" }, { status: 400 });
  }
  const readme = await getRepoReadme(repoId);
  return NextResponse.json({ source: "arkiv", readme });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { repoId, markdown } = (body ?? {}) as Record<string, unknown>;

  if (typeof repoId !== "string" || !repoId) {
    return NextResponse.json({ error: "repoId is required." }, { status: 400 });
  }
  if (typeof markdown !== "string" || !markdown.trim()) {
    return NextResponse.json({ error: "markdown is required." }, { status: 400 });
  }
  if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN_BYTES) {
    return NextResponse.json({ error: `markdown must be under ${MAX_MARKDOWN_BYTES} bytes.` }, { status: 400 });
  }

  try {
    const result = await setRepoReadmeOnArkiv(repoId, markdown);
    return NextResponse.json({ readme: result.readme, entityKey: result.entityKey, txHash: result.txHash });
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("setRepoReadmeOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to save repo README on Arkiv." }, { status: 500 });
  }
}
