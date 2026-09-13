import { NextRequest, NextResponse } from "next/server";
import { getProfileReadme } from "@/lib/arkiv/read";
import { setProfileReadmeOnArkiv, ArkivWriteError } from "@/lib/arkiv/write";

const MAX_MARKDOWN_BYTES = 20_000;

export async function GET() {
  const readme = await getProfileReadme();
  return NextResponse.json({ source: "arkiv", readme });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { markdown } = (body ?? {}) as Record<string, unknown>;

  if (typeof markdown !== "string" || !markdown.trim()) {
    return NextResponse.json({ error: "markdown is required." }, { status: 400 });
  }
  if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN_BYTES) {
    return NextResponse.json({ error: `markdown must be under ${MAX_MARKDOWN_BYTES} bytes.` }, { status: 400 });
  }

  try {
    const result = await setProfileReadmeOnArkiv(markdown);
    return NextResponse.json({ readme: result.readme, entityKey: result.entityKey, txHash: result.txHash });
  } catch (error) {
    if (error instanceof ArkivWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("setProfileReadmeOnArkiv failed:", error);
    return NextResponse.json({ error: "Failed to save profile README on Arkiv." }, { status: 500 });
  }
}
