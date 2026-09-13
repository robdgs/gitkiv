# Feedback for Arkiv — from building gitkiv (ETHRome)

Notes from building a git-style commit history entirely on Arkiv (Tiramisu
testnet), across Missions 01 (Decommission), 02 (Built to expire), and 03
(Live Wire). Concrete, from real usage — not a wishlist.

This is a local draft, not yet submitted anywhere.

---

## What worked well

- **The attribute/payload split is the right abstraction, and it's clean to
  reason about.** Deciding "what will I ever filter by" up front, then
  putting exactly that in typed attributes and everything else in payload,
  mapped naturally onto our entity model (`repo`, `branch`, `commit`,
  `lock`, `star_count`). The compound `eq(...)` query builder made the core
  Mission 01 ask — filter commits by `(repo_id, branch[, author])` — a
  one-liner.
- **`ExpirationTime.fromBlocks(...)` as a first-class entity property is
  genuinely elegant.** Building a branch-lock feature that reliably
  "unlocks itself" required zero cleanup code on our end — no cron job, no
  TTL index, no background worker. Once the expiry block passes, every
  querier (including a completely independent client) stops seeing the
  entity, at the protocol level. That's a stronger guarantee than a TTL
  index in a normal database gives you, and it was the easiest part of the
  whole build to get right.
- **`patchEntity`'s `set`/`unset`/`payload` shape is ergonomic** for
  mutate-in-place use cases. We used it for two different things — an
  incrementing star counter (payload-only patch) and reassigning a commit's
  `branch` attribute after a merge (attribute + payload patch) — and both
  were straightforward once we found the right shape.
- **`watchEntityEvents` (the `logs` WebSocket subscription) is reliable.**
  Built a live commit feed on it (create an entity anywhere, watch the
  update land in a second browser within ~1s) and never saw it drop a
  connection or miss an event across a long session.

---

## Friction / bugs

### `watchBlockNumber` never delivered an update on Tiramisu

We built a live block-height ticker on `watchBlockNumber` (the `newHeads`
WebSocket subscription) and it **never once fired**, across repeated
testing:

- In isolation, in a fresh browser tab, with no other subscriptions active.
- Over the same WebSocket connection where `watchEntityEvents` (the `logs`
  subscription) was working reliably at the same time.
- Across multiple separate test sessions over several hours.

We ended up reverting the ticker to HTTP polling (`getBlockTiming()` every
4s) and shipping that instead. This felt like a gap specific to the
`newHeads` subscription on this endpoint rather than something wrong on our
end, since the sibling `logs` subscription worked every time under
identical conditions. Would be worth confirming whether `newHeads` is
expected to work on Tiramisu's public RPC at all.

### `PublicArkivClient`'s TypeScript type is narrower than its runtime surface

`PublicArkivClient` is typed as a curated `Pick<PublicActions, ...>`. A
couple of methods we wanted (`watchBlockNumber` while investigating the
above, `getBalance` in one code path) exist at runtime but aren't in that
picked type, requiring an explicit cast or falling back to a plain `viem`
client. Not blocking, but the type surface silently disagreeing with the
runtime surface cost some debugging time before we realized the method
really was callable.

### No blocker, but worth flagging: query power stops at typed-attribute equality

This is a deliberate trade-off we understand and accepted, but noting it
as feedback: there's no way to query payload fields at all, and no
secondary indexes or full-text search over attributes — every "what will I
need to filter by" question has to be answered correctly *before* writing
the entity, since there's no ALTER-TABLE-equivalent to add a new queryable
attribute to already-written entities. For an app like ours (small, known
schema up front) this was fine; for a schema that evolves, it'd mean a
migration story we didn't have to think about yet.

---

## Context

Full technical writeups, code, and links:
- [README.md](README.md) — architecture, entity model, the mission-by-mission
  breakdown
- [README.md § Notes on the Arkiv SDK](README.md#notes-on-the-arkiv-sdk-things-that-surprised-me) —
  the same `watchBlockNumber` finding and the branch-derivation bug we hit
  and fixed
- Live on Tiramisu: writer address
  [`0xA5e9aC910d6f8466C84a4d2836674b2E4bC7080E`](https://tiramisu.explorer.arkiv.network/address/0xA5e9aC910d6f8466C84a4d2836674b2E4bC7080E),
  with real `repo`/`branch`/`commit`/`lock`/`star_count` entities and their
  creation transactions.
