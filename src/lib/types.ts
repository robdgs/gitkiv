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
};
