"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSwarmId } from "@/lib/swarm-id";

const inputClass =
  "bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]";

type Receipt = { entityKey: string; txHash: string; fileRef?: string; encrypted?: boolean };
type AttachedFile = {
  reference: string;
  name: string;
  encrypted: boolean;
  historyReference?: string;
  publisherPubKey?: string;
};

// Compressed secp256k1 public keys are 33 bytes = 66 hex chars, optionally
// 0x-prefixed in how people paste them.
const PUBKEY_RE = /^(0x)?[0-9a-f]{66}$/i;

function parseGrantees(raw: string): { keys: string[]; invalid: string[] } {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const keys: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (PUBKEY_RE.test(t)) keys.push(t.replace(/^0x/i, "").toLowerCase());
    else invalid.push(t);
  }
  return { keys, invalid };
}

export default function NewCommitForm({ repoId, branch }: { repoId: string; branch: string }) {
  const router = useRouter();
  const { info, connect, uploadFile, actUploadFile } = useSwarmId();
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [file, setFile] = useState<AttachedFile | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [encrypt, setEncrypt] = useState(false);
  const [granteesInput, setGranteesInput] = useState("");

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setFileUploading(true);
    setFileError(null);
    try {
      if (encrypt) {
        const { keys, invalid } = parseGrantees(granteesInput);
        if (invalid.length > 0) {
          throw new Error(`Not a valid public key (66 hex chars): ${invalid[0]}`);
        }
        const result = await actUploadFile(picked, keys);
        setFile({
          reference: result.encryptedReference,
          name: picked.name,
          encrypted: true,
          historyReference: result.historyReference,
          publisherPubKey: result.publisherPubKey,
        });
      } else {
        const result = await uploadFile(picked);
        setFile({ reference: result.reference, name: picked.name, encrypted: false });
      }
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
          fileEncrypted: file?.encrypted || undefined,
          fileHistoryRef: file?.historyReference,
          filePublisherKey: file?.publisherPubKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create commit.");
      setMessage("");
      setReceipt({
        entityKey: data.entityKey,
        txHash: data.txHash,
        fileRef: file?.reference,
        encrypted: file?.encrypted,
      });
      setFile(null);
      setEncrypt(false);
      setGranteesInput("");
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
            <span className="text-[#7ee787]">
              {file.encrypted ? "🔒" : "📄"} {file.name} — uploaded to Swarm
              {file.encrypted ? " (encrypted)" : ""}
            </span>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-[#8b949e] hover:text-[#c9d1d9] cursor-pointer"
            >
              remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs text-[#8b949e]">
              <input
                type="checkbox"
                checked={encrypt}
                onChange={(e) => setEncrypt(e.target.checked)}
                className="cursor-pointer"
              />
              🔒 Encrypt (conditional disclosure — only listed people can decrypt it)
            </label>

            {encrypt && (
              <div className="border border-[#30363d] rounded-md p-3 flex flex-col gap-2">
                {info.appKey?.publicKey && (
                  <p className="text-xs text-[#8b949e] break-all">
                    Your public key (share so others can grant you access):{" "}
                    <span className="text-[#c9d1d9]">{info.appKey.publicKey}</span>
                  </p>
                )}
                <label className="text-xs text-[#8b949e] block">
                  Grantee public keys (comma/space/newline separated — leave empty for only you)
                </label>
                <textarea
                  value={granteesInput}
                  onChange={(e) => setGranteesInput(e.target.value)}
                  placeholder="03a1b2c3... (66 hex chars each)"
                  rows={2}
                  className={`${inputClass} w-full font-mono`}
                />
              </div>
            )}

            <input
              type="file"
              onChange={handleFilePick}
              disabled={fileUploading}
              className="text-xs text-[#8b949e] file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-[#30363d] file:bg-[#21262d] file:text-[#c9d1d9] file:text-xs file:cursor-pointer"
            />
          </div>
        )}
        {fileUploading && (
          <p className="text-xs text-[#8b949e] mt-1">
            {encrypt ? "Encrypting and uploading to Swarm…" : "Uploading to Swarm…"}
          </p>
        )}
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
              swarm reference{receipt.encrypted ? " (encrypted)" : ""}:{" "}
              <span className="text-[#c9d1d9]">{receipt.fileRef}</span>
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
