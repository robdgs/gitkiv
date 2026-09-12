"use client";
import { useState } from "react";
import { useSwarmId } from "@/lib/swarm-id";

type Props = {
  fileRef: string;
  fileName: string;
  encrypted?: boolean;
  historyRef?: string;
  publisherKey?: string;
  isFolder?: boolean;
};

// A folder's fileRef is a Mantaray manifest root. gateway.ethswarm.org's
// own /access/<ref> page is the reliable public link for it — confirmed
// directly against a real upload (correctly reported "Website, 3 items").
// downloadFile() is NOT used for folders here, unlike every other file in
// this app: it walks the manifest one chunk-fetch at a time
// (loadMantarayTreeWithChunkAPI) and that path is independently flaky
// (intermittent 500s) even when the exact same content resolves fine
// through a real gateway — so a plain link out is more reliable than the
// in-app download for this one case.
const GATEWAY = "https://gateway.ethswarm.org";

// Plain downloads don't require Swarm ID authentication — only uploads do.
// Encrypted (ACT) downloads always need it: the SDK must decrypt with the
// viewer's own key, so an unauthorized viewer gets a real decrypt failure
// here, not a UI-level "no" — this app never held the key to fake a yes.
export default function CommitFileLink({ fileRef, fileName, encrypted, historyRef, publisherKey, isFolder }: Props) {
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

  if (isFolder) {
    return (
      <a
        href={`${GATEWAY}/access/${fileRef}`}
        target="_blank"
        rel="noreferrer"
        className="text-[#f06fa8] text-xs hover:underline"
      >
        📁 {fileName} ↗
      </a>
    );
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
        className="text-[#f06fa8] text-xs hover:underline cursor-pointer disabled:opacity-50"
      >
        {encrypted ? "🔒" : "📄"} {fileName}
        {loading ? (encrypted ? " · decrypting…" : " · downloading from Swarm…") : ""}
      </button>
      {error && <span className="text-[#f06fa8] font-semibold text-xs">{error}</span>}
    </span>
  );
}
