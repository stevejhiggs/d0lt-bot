# PR Review Agent — Design

Date: 2026-06-18

## Goal

Make d0lt-bot able to review a nominated GitHub PR. The user messages the bot a
PR URL; the bot clones the repo into a sandbox, computes the PR diff, and runs a
review over it. The "review" is a deterministic placeholder for now (count of the
letter "E", plus diff stats) but the pipeline is built so a real reviewer can drop
in later without restructuring.

## Decisions

- **Trigger:** chat message containing a PR URL (on-demand, interactive). No webhook.
- **Repo access:** public *and* private — uses `GITHUB_TOKEN` from the app runtime.
- **Review engine:** a dedicated declared sub-agent (`review`) fetches and reviews.
- **Token handling:** credential brokering when the backend supports it
  (`vercel()` / `microsandbox()`), falling back to an authenticated clone URL on
  other backends (Docker / just-bash).
- **Existing demo:** the SQL "data analyst" demo is removed; the root becomes a
  PR-review orchestrator.

## Architecture

```
You ──chat: "review https://github.com/owner/repo/pull/123"──▶  root agent (d0lt-bot)
                                                                     │ delegates (message = PR URL)
                                                                     ▼
                                                      review sub-agent  (own sandbox)
                                                        1. fetch_pull_request tool:
                                                           git clone repo  ──▶ /workspace/repo
                                                           git fetch PR head, diff ──▶ /workspace/pr.diff
                                                        2. deterministic placeholder review (bash)
                                                        3. returns structured findings (task mode)
                                                                     │
                                                                     ▼
                                              root narrates the result back to you in chat
```

**Why the fetch lives in the sub-agent, not the root:** eve isolates each declared
sub-agent's sandbox (it does *not* share the parent's). Cloning in the root sandbox
would be invisible to the reviewer, so clone + diff + review all happen inside the
sub-agent. That also keeps the full working tree available to a real reviewer later.

## Files

```
agent/
├── agent.ts                       # unchanged model config
├── instructions.md                # rewritten: PR-review orchestrator
├── channels/eve.ts                # unchanged
└── subagents/review/
    ├── agent.ts                   # defineAgent({ description, model })
    ├── instructions.md            # how to fetch + review + report
    ├── lib/github.ts              # parse PR URL, shared helpers
    ├── tools/fetch_pull_request.ts# clone + diff into the sub-agent sandbox
    └── sandbox/sandbox.ts         # own sandbox; ensure git; broker GitHub token

# removed:
#   agent/tools/run_sql.ts
#   agent/lib/sample-db.ts
```

## `fetch_pull_request` tool

Runs in the app runtime, drives the sub-agent's sandbox via `ctx.getSandbox()`:

1. Parse `owner / repo / number` from the URL in JS. Reject non-github.com PR URLs.
2. Build the clone URL. If a token is present and brokering is *not* active, embed
   `https://x-access-token:TOKEN@github.com/...`; otherwise clone the plain URL and
   rely on the brokered `Authorization` header.
3. `git clone --depth 50 <url> repo`
4. `cd repo && git fetch origin pull/<n>/head:pr`
5. `git diff origin/HEAD...pr > /workspace/pr.diff`
6. Return `{ repoDir, diffPath, filesChanged, additions, deletions }` (parsed from
   `git diff --numstat`).

Leaves both `/workspace/repo` (tree) and `/workspace/pr.diff` (diff) in the sandbox.

## Sandbox & auth (`subagents/review/sandbox/sandbox.ts`)

- Ensure `git` is available (base image `ghcr.io/vercel/eve:latest` ships it).
- `onSession`: if the backend supports domain-level network policy, broker
  `GITHUB_TOKEN` as an `Authorization` header for `github.com`, keeping the secret
  out of the sandbox. Otherwise leave egress open and let the tool fall back to the
  token-in-URL clone.

## Placeholder review & output

After fetch, the sub-agent runs deterministic stats via `bash` (exact, not LLM
guessing):

```bash
grep -oi e /workspace/pr.diff | wc -l   # case-insensitive letter-E count
```

Sub-agent returns task-mode structured output:

```ts
outputSchema: {
  pr:      { owner, repo, number, url },
  stats:   { filesChanged, additions, deletions, letterECount },
  summary: string
}
```

Root narrates it back: "PR #123: 4 files, +212/-37, contains 1,084 E's."

## Real-review seam

Later, the sub-agent swaps the `grep` placeholder for real review logic (read
`/workspace/repo` + `/workspace/pr.diff`, reason, add review tools/skills). The
pipeline — delegate → clone → diff → review → structured result — is unchanged.

## Testing

- `eve dev`; message a known **public** PR — verify clone, diff stats, E-count.
- Message a **private** PR — verify the token path.
- Confirm which backend `eve dev` resolves locally to know whether brokering or the
  URL fallback is exercised.
