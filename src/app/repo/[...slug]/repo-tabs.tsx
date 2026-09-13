"use client";
import { useState } from "react";

// GitHub's own repo-page navigation: underlined tabs, not everything
// stacked on one endless page. Both panes stay mounted (toggled with the
// `hidden` attribute, not unmounted) so switching back to Code doesn't
// re-subscribe the live-feed WebSocket, and Issues doesn't re-fetch every
// time you glance away.
export default function RepoTabs({
  openIssueCount,
  code,
  issues,
}: {
  openIssueCount: number;
  code: React.ReactNode;
  issues: React.ReactNode;
}) {
  const [tab, setTab] = useState<"code" | "issues">("code");

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-1 pb-2 text-sm border-b-2 -mb-px cursor-pointer transition-colors ${
      active
        ? "border-[#f06fa8] text-[#fff8fa] font-bold"
        : "border-transparent text-[#dfa8b7] hover:text-[#fff8fa]"
    }`;

  return (
    <div>
      <div className="flex gap-5 border-b border-[#6b4552] mb-4">
        <button onClick={() => setTab("code")} className={tabClass(tab === "code")}>
          <span aria-hidden="true">{"</>"}</span> Code
        </button>
        <button onClick={() => setTab("issues")} className={tabClass(tab === "issues")}>
          <span aria-hidden="true">◔</span> Issues
          {openIssueCount > 0 && (
            <span className="text-xs bg-[#6b4552] text-[#fff8fa] rounded-full px-1.5 leading-5 min-w-5 text-center">
              {openIssueCount}
            </span>
          )}
        </button>
      </div>

      <div hidden={tab !== "code"}>{code}</div>
      <div hidden={tab !== "issues"}>{issues}</div>
    </div>
  );
}
