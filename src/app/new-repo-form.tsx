"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]";

type Receipt = { repoId: string; entityKey: string; txHash: string };

export default function NewRepoForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, name, description, defaultBranch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create repository.");
      setReceipt({ repoId: data.repo.id, entityKey: data.entityKey, txHash: data.txHash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // This is the proof it's not a mock: a real tx hash and entity key on
  // Tiramisu, one click away from the public explorer.
  if (receipt) {
    return (
      <div className="mb-6 border border-[#238636]/40 bg-[#238636]/5 rounded-md p-4 flex flex-col gap-2">
        <div className="text-sm font-bold text-[#7ee787]">✓ Created on Arkiv (Tiramisu testnet)</div>
        <div className="text-xs text-[#8b949e] break-all">
          entity key: <span className="text-[#c9d1d9]">{receipt.entityKey}</span>
        </div>
        <div className="text-xs text-[#8b949e] break-all">
          tx hash: <span className="text-[#c9d1d9]">{receipt.txHash}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1">
          <a
            className="text-[#58a6ff]"
            target="_blank"
            rel="noreferrer"
            href={`https://tiramisu.explorer.arkiv.network/tx/${receipt.txHash}`}
          >
            View transaction on explorer ↗
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
        <button
          onClick={() => router.push(`/repo/${receipt.repoId}`)}
          className="mt-2 w-fit px-3 py-1.5 rounded-md border border-[#238636] bg-[#238636]/20 text-[#7ee787] text-sm hover:bg-[#238636]/30 cursor-pointer"
        >
          Open repository →
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 px-3 py-1.5 rounded-md border border-[#238636] text-[#7ee787] text-sm hover:bg-[#238636]/10 cursor-pointer"
      >
        + New repository
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mb-6 border border-[#30363d] rounded-md p-4 flex flex-col gap-3">
      <div className="text-sm font-bold text-[#e6edf3]">New repository</div>
      <p className="text-xs text-[#8b949e] -mt-1">
        This creates a real entity on Arkiv (Tiramisu testnet) — no other database involved.
      </p>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-[#8b949e] block mb-1">Owner</label>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="e.g. alice"
            className={inputClass}
            required
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#8b949e] block mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. my-project"
            className={inputClass}
            required
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-[#8b949e] block mb-1">Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this repo for?"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-xs text-[#8b949e] block mb-1">Default branch</label>
        <input
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          className={`${inputClass} w-40`}
        />
      </div>

      {error && <p className="text-sm text-[#f85149]">{error}</p>}

      <div className="flex gap-2 mt-1">
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 rounded-md border border-[#238636] bg-[#238636]/20 text-[#7ee787] text-sm hover:bg-[#238636]/30 cursor-pointer disabled:opacity-50"
        >
          {loading ? "Creating on Arkiv…" : "Create repository"}
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
