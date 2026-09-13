"use client";
import { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

type Receipt = { entityKey: string; txHash: string };
type SaveResult = { markdown: string; entityKey: string; txHash: string };

// GitHub-flavored READMEs mix markdown with raw HTML (a centering
// `<div align="center">`, badge images, etc.) — remark-gfm alone won't
// render that raw HTML at all, so rehype-raw parses it into real elements.
// rehype-sanitize then strips anything dangerous (script tags, event
// handlers, javascript: URLs) using its default schema, which is modeled
// on GitHub's own README sanitization — the exact allowances this content
// needs (div, img, a, align) are already in it, so no custom schema is
// needed. Order matters: rehype-raw must run before rehype-sanitize, or
// there's nothing yet to sanitize.
const components: Components = {
  h1: (props) => <h1 className="text-xl font-bold text-[#fff8fa] mt-4 mb-2 first:mt-0" {...props} />,
  h2: (props) => <h2 className="text-lg font-bold text-[#fff8fa] mt-4 mb-2" {...props} />,
  h3: (props) => <h3 className="text-base font-bold text-[#fff8fa] mt-3 mb-1.5" {...props} />,
  p: (props) => <p className="text-sm text-[#dfa8b7] mb-2 leading-relaxed" {...props} />,
  a: (props) => <a className="text-[#f06fa8] hover:underline" target="_blank" rel="noreferrer" {...props} />,
  code: (props) => <code className="bg-[#3d2632] rounded px-1 py-0.5 text-xs font-mono text-[#f06fa8]" {...props} />,
  pre: (props) => (
    <pre className="bg-[#3d2632] border border-[#6b4552] rounded-md p-3 overflow-x-auto text-xs mb-2" {...props} />
  ),
  hr: () => <hr className="border-[#6b4552] my-4" />,
  ul: (props) => <ul className="list-disc list-inside text-sm text-[#dfa8b7] mb-2" {...props} />,
  ol: (props) => <ol className="list-decimal list-inside text-sm text-[#dfa8b7] mb-2" {...props} />,
  li: (props) => <li className="mb-1" {...props} />,
  // Badges and social icons in a README are always remote, arbitrary URLs
  // (shields.io, typing-svg generators, etc.) — next/image needs every
  // remote host pre-registered in next.config, which defeats the point of
  // free-form markdown content, so a plain <img> is the right tool here.
  // eslint-disable-next-line @next/next/no-img-element
  img: ({ alt, ...props }) => <img alt={alt ?? ""} className="inline-block max-w-full" {...props} />,
};

// Shared by the profile README (homepage) and each repo's README (repo
// page) — same rendering pipeline, same edit/save UX, differing only in
// where `onSave` persists the markdown (a singleton entity vs. one keyed
// by repo_id — see profile-readme.tsx and repo-readme.tsx).
export default function ReadmeEditor({
  initialMarkdown,
  initialEntityKey,
  emptyLabel,
  onSave,
}: {
  initialMarkdown: string | null;
  initialEntityKey: string | null;
  emptyLabel: string;
  onSave: (markdown: string) => Promise<SaveResult>;
}) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  // Separate from the post-save receipt below: this is what makes the
  // entity traceable on every load, not just right after someone edits it
  // — same reasoning as the issues list's persistent "view on scan" link.
  const [entityKey, setEntityKey] = useState(initialEntityKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialMarkdown ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(draft);
      setMarkdown(result.markdown);
      setEntityKey(result.entityKey);
      setReceipt({ entityKey: result.entityKey, txHash: result.txHash });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (!markdown && !editing) {
    return (
      <div className="border border-dashed border-[#6b4552] rounded-md p-6 text-sm text-[#dfa8b7] mb-6">
        {emptyLabel}{" "}
        <button onClick={() => setEditing(true)} className="text-[#f06fa8] hover:underline cursor-pointer">
          Add one
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 border border-[#6b4552] rounded-md p-5">
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          <label className="text-xs text-[#dfa8b7]">Markdown (GitHub-flavored, raw HTML allowed)</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            className="bg-[#3d2632] border border-[#6b4552] rounded-md px-3 py-2 text-xs font-mono text-[#fff8fa] focus:outline-none focus:border-[#f06fa8] w-full"
          />
          {error && <p className="text-sm font-semibold text-[#f06fa8]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 rounded-md border border-[#f06fa8] bg-[#f06fa8]/20 text-[#f06fa8] text-sm hover:bg-[#f06fa8]/30 cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving to Arkiv…" : "Save README"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(markdown ?? "");
                setError(null);
              }}
              disabled={saving}
              className="px-3 py-1.5 rounded-md text-sm text-[#dfa8b7] hover:text-[#fff8fa] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                setDraft(markdown ?? "");
                setEditing(true);
              }}
              className="text-xs text-[#dfa8b7] hover:text-[#f06fa8] cursor-pointer"
            >
              Edit README
            </button>
          </div>
          <article>
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={components}>
              {markdown}
            </Markdown>
          </article>
          {entityKey && (
            <div className="mt-3 pt-3 border-t border-[#6b4552] text-xs text-[#dfa8b7]">
              Stored on Arkiv (Tiramisu testnet) ·{" "}
              <a
                className="text-[#f06fa8] hover:underline"
                target="_blank"
                rel="noreferrer"
                href={`https://tiramisu.explorer.arkiv.network/entity/${entityKey}`}
              >
                view on scan ↗
              </a>
            </div>
          )}
        </>
      )}
      {receipt && (
        <div className="mt-3 border border-[#f06fa8]/40 bg-[#f06fa8]/10 rounded-md p-3 text-xs flex flex-col gap-1.5">
          <div className="font-bold text-[#f06fa8]">✓ README saved on Arkiv (Tiramisu testnet)</div>
          <div className="text-[#dfa8b7] break-all">
            tx hash: <span className="text-[#fff8fa]">{receipt.txHash}</span>
          </div>
          <a
            className="text-[#f06fa8] w-fit"
            target="_blank"
            rel="noreferrer"
            href={`https://tiramisu.explorer.arkiv.network/tx/${receipt.txHash}`}
          >
            View transaction ↗
          </a>
        </div>
      )}
    </div>
  );
}
