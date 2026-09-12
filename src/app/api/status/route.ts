import { NextResponse } from "next/server";
import { getArkivStatus } from "@/lib/arkiv/read";
import { getWriterAddress } from "@/lib/arkiv/write";

export async function GET() {
  try {
    const status = await getArkivStatus();
    return NextResponse.json({
      chainId: status.chainId,
      currentBlock: status.currentBlock.toString(),
      currentBlockTime: status.currentBlockTime,
      blockDuration: status.blockDuration,
      writerAddress: getWriterAddress(),
    });
  } catch (error) {
    console.error("getArkivStatus failed:", error);
    return NextResponse.json({ error: "Could not reach Arkiv." }, { status: 502 });
  }
}
