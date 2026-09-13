"use client";
import { useState } from "react";
import { useSwarmId } from "@/lib/swarm-id";
import FilePreviewModal from "./file-preview-modal";

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
// (loadMantarayTreeWithChunkAPI), and that path was tried in-app for a
// preview modal and reproducibly failed (two 404s and a 30s timeout, with
// retries) against a reference that resolves fine through this same
// gateway link at the same moment. Not a transient blip to retry around —
// a real reliability gap in that call for folder manifests specifically.
// Embedding the gateway URL directly in an iframe isn't a fix either: it
// sends `Content-Disposition: attachment` on every response, forcing a
// download instead of rendering. So a plain link out is what's actually
// reliable here, not a downgrade taken for convenience.
const GATEWAY = "https://gateway.ethswarm.org";

// Plain downloads don't require Swarm ID authentication — only uploads do.
// Encrypted (ACT) downloads always need it: the SDK must decrypt with the
// viewer's own key, so an unauthorized viewer gets a real decrypt failure
// here, not a UI-level "no" — this app never held the key to fake a yes.
export default function CommitFileLink({ fileRef, fileName, encrypted, historyRef, publisherKey, isFolder }: Props) {
  const { downloadFile, actDownloadFile, connect, info } = useSwarmId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Uint8Array | null>(null);

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
        setPreview(data);
      } else {
        const file = await downloadFile(fileRef);
        setPreview(file.data);
      }
    } catch (err) {
      setError(
        encrypted
          ? "Access denied — you're not a grantee on this file."
          : err instanceof Error
            ? err.message
            : "Failed to fetch from Swarm."
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
        {loading ? (encrypted ? " · decrypting…" : " · fetching from Swarm…") : ""}
      </button>
      {error && <span className="text-[#f06fa8] font-semibold text-xs">{error}</span>}
      {preview && <FilePreviewModal fileName={fileName} bytes={preview} onClose={() => setPreview(null)} />}
    </span>
  );
}
