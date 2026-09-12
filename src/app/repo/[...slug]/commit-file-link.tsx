"use client";
import { useState } from "react";
import { useSwarmId } from "@/lib/swarm-id";

// Downloads don't require Swarm ID authentication — only uploads do — so
// this works for any visitor, not just the person who committed the file.
export default function CommitFileLink({ fileRef, fileName }: { fileRef: string; fileName: string }) {
  const { downloadFile } = useSwarmId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setLoading(true);
    setError(null);
    try {
      const file = await downloadFile(fileRef);
      const blob = new Blob([file.data as BlobPart]);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download from Swarm.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={open}
        disabled={loading}
        className="text-[#58a6ff] text-xs hover:underline cursor-pointer disabled:opacity-50"
      >
        📄 {fileName}
        {loading ? " · downloading from Swarm…" : ""}
      </button>
      {error && <span className="text-[#f85149] text-xs">{error}</span>}
    </span>
  );
}
