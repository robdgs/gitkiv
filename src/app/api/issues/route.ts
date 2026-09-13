import { NextRequest, NextResponse } from "next/server";
import { getIssuesFromArkiv } from "@/lib/arkiv/read";
import { createIssueOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";
import type { IssueStatus } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoId = searchParams.get("repo");
  const statusParam = searchParams.get("status");

  if (!repoId) {
    return NextResponse.json({ error: "repo is required" }, { status: 400 });
  }
  if (statusParam !== null && statusParam !== "open" && statusParam !== "closed") {
    return NextResponse.json({ error: "status must be 'open' or 'closed'." }, { status: 400 });
  }

  const issues = await getIssuesFromArkiv(repoId, (statusParam as IssueStatus | null) ?? undefined);
  return NextResponse.json({ source: "arkiv", issues });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { repoId, title, body: issueBody, author } = (body ?? {}) as Record<string, unknown>;

  if (typeof repoId !== "string" || !repoId) {
    return NextResponse.json({ error: "repoId is required." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  if (typeof author !== "string" || !author.trim()) {
    return NextResponse.json({ error: "author is required." }, { status: 400 });
  }
  if (issueBody !== undefined && typeof issueBody !== "string") {
    return NextResponse.json({ error: "body must be a string." }, { status: 400 });
  }

  try {
    const result = await createIssueOnArkiv(repoId, title, (issueBody as string | undefined) ?? "", author);
    return NextResponse.json(
      { issue: result.issue, entityKey: result.entityKey, txHash: result.txHash },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("createIssueOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to create issue on Arkiv." }, { status: 500 });
  }
}
