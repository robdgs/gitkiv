import { NextRequest, NextResponse } from "next/server";
import { setIssueStatusOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";

// A dedicated action endpoint (not PATCH /api/issues/:number) — same
// shape as /api/merges and /api/stars: this app models actions, not REST
// resources, everywhere else, so close/reopen follows suit.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { repoId, number, status } = (body ?? {}) as Record<string, unknown>;

  if (typeof repoId !== "string" || !repoId) {
    return NextResponse.json({ error: "repoId is required." }, { status: 400 });
  }
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) {
    return NextResponse.json({ error: "number must be a positive integer." }, { status: 400 });
  }
  if (status !== "open" && status !== "closed") {
    return NextResponse.json({ error: "status must be 'open' or 'closed'." }, { status: 400 });
  }

  try {
    const result = await setIssueStatusOnArkiv(repoId, number, status);
    return NextResponse.json({ issue: result.issue, entityKey: result.entityKey, txHash: result.txHash });
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("setIssueStatusOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to update issue on Arkiv." }, { status: 500 });
  }
}
