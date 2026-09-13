"use client";
import ReadmeEditor from "../../readme-editor";

export default function RepoReadme({
  repoId,
  initialMarkdown,
  initialEntityKey,
}: {
  repoId: string;
  initialMarkdown: string | null;
  initialEntityKey: string | null;
}) {
  return (
    <ReadmeEditor
      initialMarkdown={initialMarkdown}
      initialEntityKey={initialEntityKey}
      emptyLabel="No README yet for this repo."
      onSave={async (markdown) => {
        const res = await fetch("/api/repo-readme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoId, markdown }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save README.");
        return { markdown: data.readme.markdown, entityKey: data.entityKey, txHash: data.txHash };
      }}
    />
  );
}
