"use client";
import { useEffect, useState } from "react";

type Issue = {
  repoId: string;
  number: number;
  title: string;
  body: string;
  author: string;
  status: "open" | "closed";
  createdAt: number;
  closedAt: number | null;
  entityKey: string;
};

type Receipt = { action: "filed" | "closed" | "reopened"; number: number; entityKey: string; txHash: string };

const inputClass =
  "bg-[#3d2632] border border-[#6b4552] rounded-md px-3 py-1.5 text-sm text-[#fff8fa] focus:outline-none focus:border-[#f06fa8]";

// GitHub-style issues, filed and closed as real Arkiv entities — see
// issueEntity/issuesQuery in src/lib/arkiv/model.ts. `status` is a
// queryable attribute, so switching this tab is a real compound filter
// (kind=issue, repo_id, status), not a client-side scan of every issue
// ever filed on the repo.
export default function IssuesPanel({ repoId }: { repoId: string }) {
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [closedCount, setClosedCount] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyNumber, setBusyNumber] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [tabRes, openRes, closedRes] = await Promise.all([
        fetch(`/api/issues?repo=${encodeURIComponent(repoId)}&status=${tab}`, { cache: "no-store" }),
        fetch(`/api/issues?repo=${encodeURIComponent(repoId)}&status=open`, { cache: "no-store" }),
        fetch(`/api/issues?repo=${encodeURIComponent(repoId)}&status=closed`, { cache: "no-store" }),
      ]);
      if (cancelled) return;
      const [tabData, openData, closedData] = await Promise.all([tabRes.json(), openRes.json(), closedRes.json()]);
      if (tabRes.ok) setIssues(tabData.issues);
      if (openRes.ok) setOpenCount(openData.issues.length);
      if (closedRes.ok) setClosedCount(closedData.issues.length);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [repoId, tab, refreshKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, title, body, author }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create issue.");
      setTitle("");
      setBody("");
      setShowForm(false);
      setTab("open");
      setReceipt({ action: "filed", number: data.issue.number, entityKey: data.entityKey, txHash: data.txHash });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(number: number, status: "open" | "closed") {
    setBusyNumber(number);
    setError(null);
    try {
      const res = await fetch("/api/issues/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, number, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update issue.");
      setReceipt({
        action: status === "closed" ? "closed" : "reopened",
        number,
        entityKey: data.entityKey,
        txHash: data.txHash,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyNumber(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("open")}
            className={`px-3 py-1 rounded-md text-xs border cursor-pointer ${
              tab === "open"
                ? "border-[#f06fa8] text-[#f06fa8] bg-[#f06fa8]/10"
                : "border-[#6b4552] text-[#dfa8b7] hover:border-[#f06fa8]"
            }`}
          >
            ● Open{openCount !== null ? ` (${openCount})` : ""}
          </button>
          <button
            onClick={() => setTab("closed")}
            className={`px-3 py-1 rounded-md text-xs border cursor-pointer ${
              tab === "closed"
                ? "border-[#c98799] text-[#c98799] bg-[#c98799]/10"
                : "border-[#6b4552] text-[#dfa8b7] hover:border-[#f06fa8]"
            }`}
          >
            ✓ Closed{closedCount !== null ? ` (${closedCount})` : ""}
          </button>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 rounded-md border border-[#f06fa8] text-[#f06fa8] text-xs hover:bg-[#f06fa8]/10 cursor-pointer"
        >
          + New issue
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="border border-[#6b4552] rounded-md p-4 flex flex-col gap-3 mb-3">
          <div className="flex gap-2">
            <div className="w-40">
              <label className="text-xs text-[#dfa8b7] block mb-1">Author</label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. alice"
                className={`${inputClass} w-full`}
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#dfa8b7] block mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Branch switcher doesn't handle empty repos"
                className={`${inputClass} w-full`}
                required
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#dfa8b7] block mb-1">Description (optional)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className={`${inputClass} w-full`}
            />
          </div>
          {error && <p className="text-sm font-semibold text-[#f06fa8]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 rounded-md border border-[#f06fa8] bg-[#f06fa8]/20 text-[#f06fa8] text-sm hover:bg-[#f06fa8]/30 cursor-pointer disabled:opacity-50"
            >
              {loading ? "Filing on Arkiv…" : "Submit issue"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={loading}
              className="px-3 py-1.5 rounded-md text-sm text-[#dfa8b7] hover:text-[#fff8fa] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!showForm && error && <p className="text-sm font-semibold text-[#f06fa8] mb-2">{error}</p>}

      {receipt && (
        <div className="mb-3 border border-[#f06fa8]/40 bg-[#f06fa8]/10 rounded-md p-3 text-xs flex flex-col gap-1.5">
          <div className="font-bold text-[#f06fa8]">
            ✓ Issue #{receipt.number} {receipt.action} on Arkiv (Tiramisu testnet)
          </div>
          <div className="text-[#dfa8b7] break-all">
            entity key: <span className="text-[#fff8fa]">{receipt.entityKey}</span>
          </div>
          <div className="text-[#dfa8b7] break-all">
            tx hash: <span className="text-[#fff8fa]">{receipt.txHash}</span>
          </div>
          <div className="flex gap-4 mt-0.5">
            <a
              className="text-[#f06fa8]"
              target="_blank"
              rel="noreferrer"
              href={`https://tiramisu.explorer.arkiv.network/tx/${receipt.txHash}`}
            >
              View transaction ↗
            </a>
            <a
              className="text-[#f06fa8]"
              target="_blank"
              rel="noreferrer"
              href={`https://tiramisu.explorer.arkiv.network/entity/${receipt.entityKey}`}
            >
              View entity history ↗
            </a>
          </div>
        </div>
      )}

      <ul className="border border-[#6b4552] rounded-md divide-y divide-[#6b4552]">
        {issues === null && <li className="p-4 text-sm text-[#dfa8b7]">Loading…</li>}
        {issues !== null && issues.length === 0 && (
          <li className="p-4 text-sm text-[#dfa8b7]">No {tab} issues.</li>
        )}
        {issues?.map((issue) => (
          <li key={issue.number} className="p-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[#fff8fa]">
                <span className="text-[#dfa8b7]">#{issue.number}</span> {issue.title}
              </p>
              {issue.body && <p className="text-xs text-[#dfa8b7] mt-1 whitespace-pre-wrap">{issue.body}</p>}
              <div className="flex items-center gap-2 text-xs text-[#dfa8b7] mt-2">
                <span>{issue.author}</span>
                <span>·</span>
                <span>{new Date(issue.createdAt * 1000).toISOString().slice(0, 10)}</span>
                {issue.status === "closed" && issue.closedAt && (
                  <>
                    <span>·</span>
                    <span>closed {new Date(issue.closedAt * 1000).toISOString().slice(0, 10)}</span>
                  </>
                )}
                <span>·</span>
                <a
                  className="text-[#f06fa8] hover:underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://tiramisu.explorer.arkiv.network/entity/${issue.entityKey}`}
                >
                  view on scan ↗
                </a>
              </div>
            </div>
            <button
              onClick={() => setStatus(issue.number, issue.status === "open" ? "closed" : "open")}
              disabled={busyNumber === issue.number}
              className="shrink-0 px-3 py-1.5 rounded-md border border-[#6b4552] text-xs text-[#dfa8b7] hover:border-[#f06fa8] hover:text-[#f06fa8] cursor-pointer disabled:opacity-50"
            >
              {busyNumber === issue.number ? "…" : issue.status === "open" ? "Close" : "Reopen"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
