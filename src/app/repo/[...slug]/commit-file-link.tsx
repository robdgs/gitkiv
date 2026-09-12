"use client";
import { useState } from "react";
import { useSwarmId } from "@/lib/swarm-id";

type Props = {
  fileRef: string;
  fileName: string;
  encrypted?: boolean;
  historyRef?: string;
  publisherKey?: string;
};

// Plain downloads don't require Swarm ID authentication — only uploads do.
// Encrypted (ACT) downloads always need it: the SDK must decrypt with the
// viewer's own key, so an unauthorized viewer gets a real decrypt failure
// here, not a UI-level "no" — this app never held the key to fake a yes.
export default function CommitFileLink({ fileRef, fileName, encrypted, historyRef, publisherKey }: Props) {
  const { downloadFile, actDownloadFile, connect, info } = useSwarmId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveBlob(bytes: BlobPart) {
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function open() {
    setLoading(true);
    setError(null);
    try {
      if (encrypted) {
        if (!historyRef || !publisherKey) throw new Error("Missing ACT metadata for this file.");
        if (!info?.identity) await connect();
        const data = await actDownloadFile(fileRef, historyRef, publisherKey);
        saveBlob(data as BlobPart);
      } else {
        const file = await downloadFile(fileRef);
        saveBlob(file.data as BlobPart);
      }
    } catch (err) {
      setError(
        encrypted
          ? "Access denied — you're not a grantee on this file."
          : err instanceof Error
            ? err.message
            : "Failed to download from Swarm."
      );
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
        {encrypted ? "🔒" : "📄"} {fileName}
        {loading ? (encrypted ? " · decrypting…" : " · downloading from Swarm…") : ""}
      </button>
      {error && <span className="text-[#f85149] text-xs">{error}</span>}
    </span>
  );
}
