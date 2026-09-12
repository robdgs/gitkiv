"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSwarmId } from "@/lib/swarm-id";

const inputClass =
  "bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]";

type Receipt = { entityKey: string; txHash: string; fileRef?: string };
type AttachedFile = { reference: string; name: string };

export default function NewCommitForm({ repoId, branch }: { repoId: string; branch: string }) {
  const router = useRouter();
  const { info, connect, uploadFile } = useSwarmId();
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [file, setFile] = useState<AttachedFile | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setFileUploading(true);
    setFileError(null);
    try {
      const result = await uploadFile(picked);
      setFile({ reference: result.reference, name: picked.name });
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Upload to Swarm failed.");
    } finally {
      setFileUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReceipt(null);
    try {
      const res = await fetch("/api/commits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId,
          branch,
          author,
          message,
          fileRef: file?.reference,
          fileName: file?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create commit.");
      setMessage("");
      setReceipt({ entityKey: data.entityKey, txHash: data.txHash, fileRef: file?.reference });
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 px-3 py-1.5 rounded-md border border-[#238636] text-[#7ee787] text-sm hover:bg-[#238636]/10 cursor-pointer"
      >
        + New commit on {branch}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 border border-[#30363d] rounded-md p-4 flex flex-col gap-3">
      <div className="text-sm font-bold text-[#e6edf3]">
        New commit on <span className="text-[#58a6ff]">{branch}</span>
      </div>
      <p className="text-xs text-[#8b949e] -mt-1">
        Writes a real commit entity to Arkiv. Hash and parent link are generated automatically.
      </p>

      <div className="flex gap-2">
        <div className="w-40">
          <label className="text-xs text-[#8b949e] block mb-1">Author</label>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. alice"
            className={`${inputClass} w-full`}
            required
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#8b949e] block mb-1">Commit message</label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. fix: handle empty branch"
            className={`${inputClass} w-full`}
            required
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-[#8b949e] block mb-1">Attach a file (optional, stored on Swarm)</label>
        {!info?.identity ? (
          <button
            type="button"
            onClick={() => connect()}
            className="px-3 py-1.5 rounded-md border border-[#30363d] text-[#c9d1d9] text-sm hover:border-[#58a6ff] cursor-pointer"
          >
            Connect Swarm ID to attach a file
          </button>
        ) : !info.canUpload ? (
          <p className="text-xs text-[#f0883e]">
            Swarm ID connected as {info.identity.name}, but this account can&apos;t upload yet
            {info.uploadUnavailableReason === "no-stamp" ? " (no storage stamp)." : "."}
          </p>
        ) : file ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[#7ee787]">📄 {file.name} — uploaded to Swarm</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-[#8b949e] hover:text-[#c9d1d9] cursor-pointer"
            >
              remove
            </button>
          </div>
        ) : (
          <input
            type="file"
            onChange={handleFilePick}
            disabled={fileUploading}
            className="text-xs text-[#8b949e] file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-[#30363d] file:bg-[#21262d] file:text-[#c9d1d9] file:text-xs file:cursor-pointer"
          />
        )}
        {fileUploading && <p className="text-xs text-[#8b949e] mt-1">Uploading to Swarm…</p>}
        {fileError && <p className="text-xs text-[#f85149] mt-1">{fileError}</p>}
      </div>

      {error && <p className="text-sm text-[#f85149]">{error}</p>}

      {receipt && (
        <div className="border border-[#238636]/40 bg-[#238636]/5 rounded-md p-3 text-xs flex flex-col gap-1.5">
          <div className="font-bold text-[#7ee787]">✓ Committed on Arkiv (Tiramisu testnet)</div>
          <div className="text-[#8b949e] break-all">
            entity key: <span className="text-[#c9d1d9]">{receipt.entityKey}</span>
          </div>
          <div className="text-[#8b949e] break-all">
            tx hash: <span className="text-[#c9d1d9]">{receipt.txHash}</span>
          </div>
          {receipt.fileRef && (
            <div className="text-[#8b949e] break-all">
              swarm reference: <span className="text-[#c9d1d9]">{receipt.fileRef}</span>
            </div>
          )}
          <div className="flex gap-4 mt-0.5">
            <a
              className="text-[#58a6ff]"
              target="_blank"
              rel="noreferrer"
              href={`https://tiramisu.explorer.arkiv.network/tx/${receipt.txHash}`}
            >
              View transaction ↗
            </a>
            <a
              className="text-[#58a6ff]"
              target="_blank"
              rel="noreferrer"
              href={`https://tiramisu.explorer.arkiv.network/entity/${receipt.entityKey}`}
            >
              View entity history ↗
            </a>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 rounded-md border border-[#238636] bg-[#238636]/20 text-[#7ee787] text-sm hover:bg-[#238636]/30 cursor-pointer disabled:opacity-50"
        >
          {loading ? "Committing to Arkiv…" : "Commit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-sm text-[#8b949e] hover:text-[#c9d1d9] cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
