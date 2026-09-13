export type Repo = {
  id: string; // "owner/name"
  owner: string;
  name: string;
  defaultBranch: string;
  description: string;
};

export type Branch = {
  repoId: string;
  name: string;
};

export type Commit = {
  hash: string;
  repoId: string; // "owner/name"
  branch: string;
  author: string;
  parentHash: string | null;
  timestamp: number; // unix seconds
  message: string; // payload-only field (never filtered)
  // Optional file content, stored on Swarm (not Arkiv) — this is just a
  // pointer. `fileRef` is the Swarm reference (hash) from @snaha/swarm-id.
  fileRef?: string;
  fileName?: string;
  // Set when the file was uploaded via actUploadData (conditional
  // disclosure): `fileRef` then holds the *encrypted* reference, and these
  // two extra fields are required to ever decrypt it back.
  fileEncrypted?: boolean;
  fileHistoryRef?: string;
  filePublisherKey?: string;
  // Set when `fileRef` is a Mantaray manifest root (a folder), not a single
  // file's content reference — `/bzz/<fileRef>/` serves it, downloadFile()
  // does not. Folders are never encrypted (no ACT-over-manifest support).
  fileIsFolder?: boolean;
  // Set on a merge commit: a second parent pointer, exactly like a real git
  // merge commit's second parent, except there's no tree/diff to combine
  // here (no code lives on Arkiv) — this just records that the merge
  // happened and where the source branch was at that moment.
  mergedFromBranch?: string;
  mergedFromHash?: string | null;
};

// ETHRome Mission 02 (Built to expire): a short-lived reservation on a
// branch. Nothing in this app ever deletes one — it leaves Arkiv's query
// surface entirely on its own once its block arrives.
export type BranchLock = {
  repoId: string;
  branch: string;
  author: string;
  lockedAt: number; // unix seconds, display only
};

export type IssueStatus = "open" | "closed";

export type Issue = {
  repoId: string;
  number: number; // repo-scoped, assigned at creation (count of existing issues + 1)
  title: string;
  body: string;
  author: string;
  status: IssueStatus;
  createdAt: number; // unix seconds
  closedAt: number | null; // unix seconds, set when status becomes "closed"
};

// GitHub-style profile README, shown on the homepage. This app has no
// multi-user accounts — one server-signed writer key creates every
// entity — so there's exactly one of these, a singleton, the same way a
// GitHub profile README belongs to one account.
export type ProfileReadme = {
  markdown: string;
  updatedAt: number; // unix seconds
};
