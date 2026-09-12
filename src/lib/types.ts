export type Repo = {
  id: string; // "owner/name"
  owner: string;
  name: string;
  defaultBranch: string;
  description: string;
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
