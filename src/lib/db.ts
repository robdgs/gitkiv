// BASELINE READ PATH (pre-Arkiv-migration)
// ------------------------------------------------------------------
// This module is the "Postgres pipeline" referenced by ETHRome Mission 01:
// a real relational data store the app queries today to answer
// "give me the commits for repo X on branch Y (optionally by author)".
// Swap target: node:sqlite -> Arkiv compound attribute query.
// Keep this file working and committed BEFORE the Arkiv migration lands,
// so there is a genuine baseline commit to diff against.
// ------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { Repo, Commit } from "./types";

const DB_PATH = path.join(process.cwd(), "baseline.sqlite");

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      defaultBranch TEXT NOT NULL,
      description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commits (
      hash TEXT PRIMARY KEY,
      repoId TEXT NOT NULL,
      branch TEXT NOT NULL,
      author TEXT NOT NULL,
      parentHash TEXT,
      timestamp INTEGER NOT NULL,
      message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commits_repo_branch ON commits(repoId, branch);
  `);
  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) as c FROM repos").get() as { c: number };
  if (row.c > 0) return;

  const repos: Repo[] = [
    { id: "arkiv/hackathon-demo", owner: "arkiv", name: "hackathon-demo", defaultBranch: "main", description: "ETHRome demo repo" },
    { id: "arkiv/git-on-chain", owner: "arkiv", name: "git-on-chain", defaultBranch: "main", description: "Git metadata stored as Arkiv entities" },
  ];
  const insertRepo = db.prepare(
    "INSERT INTO repos (id, owner, name, defaultBranch, description) VALUES (?, ?, ?, ?, ?)"
  );
  for (const r of repos) insertRepo.run(r.id, r.owner, r.name, r.defaultBranch, r.description);

  const commits: Commit[] = [
    { hash: "a1b2c3d", repoId: "arkiv/hackathon-demo", branch: "main", author: "alice", parentHash: null, timestamp: 1893450000, message: "init: project scaffold" },
    { hash: "b2c3d4e", repoId: "arkiv/hackathon-demo", branch: "main", author: "bob", parentHash: "a1b2c3d", timestamp: 1893453600, message: "feat: add repo list page" },
    { hash: "c3d4e5f", repoId: "arkiv/hackathon-demo", branch: "feature/arkiv", author: "alice", parentHash: "b2c3d4e", timestamp: 1893457200, message: "wip: entity model for commits" },
    { hash: "d4e5f6a", repoId: "arkiv/hackathon-demo", branch: "feature/arkiv", author: "alice", parentHash: "c3d4e5f", timestamp: 1893460800, message: "feat: query commits via Arkiv compound filter" },
    { hash: "e5f6a7b", repoId: "arkiv/git-on-chain", branch: "main", author: "carol", parentHash: null, timestamp: 1893450600, message: "init: git-on-chain repo" },
    { hash: "f6a7b8c", repoId: "arkiv/git-on-chain", branch: "main", author: "bob", parentHash: "e5f6a7b", timestamp: 1893454200, message: "docs: describe attribute/payload split" },
  ];
  const insertCommit = db.prepare(
    "INSERT INTO commits (hash, repoId, branch, author, parentHash, timestamp, message) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const c of commits)
    insertCommit.run(c.hash, c.repoId, c.branch, c.author, c.parentHash, c.timestamp, c.message);
}

export function getReposFromDB(): Repo[] {
  return getDb().prepare("SELECT * FROM repos ORDER BY id").all() as unknown as Repo[];
}

export function getRepoFromDB(id: string): Repo | undefined {
  return getDb().prepare("SELECT * FROM repos WHERE id = ?").get(id) as unknown as Repo | undefined;
}

// This is the exact query Mission 01 targets: compound filter on
// (repoId, branch), optionally narrowed by author. Today it hits SQLite;
// after migration it must hit Arkiv instead, with no fallback here.
export function getCommitsFromDB(repoId: string, branch: string, author?: string): Commit[] {
  const db = getDb();
  if (author) {
    return db
      .prepare("SELECT * FROM commits WHERE repoId = ? AND branch = ? AND author = ? ORDER BY timestamp DESC")
      .all(repoId, branch, author) as unknown as Commit[];
  }
  return db
    .prepare("SELECT * FROM commits WHERE repoId = ? AND branch = ? ORDER BY timestamp DESC")
    .all(repoId, branch) as unknown as Commit[];
}
