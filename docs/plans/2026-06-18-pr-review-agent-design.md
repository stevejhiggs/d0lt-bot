# PR Review Agent — Design

Date: 2026-06-18

## Goal

Make d0lt-bot able to review a nominated GitHub PR. The user messages the bot a
PR URL; the bot clones the repo into a sandbox, reads the PR diff in context, and
produces a real code review — a summary, severity-tagged findings, and an overall
recommendation (approve / comment / request changes).

> History: an earlier iteration used a deterministic "count the letter E" placeholder
> to prove the fetch→review→report pipeline. Once that pipeline was verified working,
> the review step was replaced with an actual LLM code review. The pipeline is
> unchanged.

## Decisions

- **Trigger:** chat message containing a PR URL (on-demand, interactive). No webhook.
- **Repo access:** public _and_ private — uses `GITHUB_TOKEN` from the app runtime.
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
sub-agent's sandbox (it does _not_ share the parent's). Cloning in the root sandbox
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
    ├── lib/github.ts              # parse PR URL, parse numstat
    ├── tools/fetch_pull_request.ts# clone + diff into the sub-agent sandbox
    └── sandbox.ts                 # own sandbox; broker GitHub token

# removed:
#   agent/tools/run_sql.ts
#   agent/lib/sample-db.ts
```

## `fetch_pull_request` tool

Runs in the app runtime, drives the sub-agent's sandbox via `ctx.getSandbox()`:

1. Parse `owner / repo / number` from the URL in JS. Reject non-github.com PR URLs.
2. Build the clone URL. If a token is present and brokering is _not_ active, embed
   `https://x-access-token:TOKEN@github.com/...`; otherwise clone the plain URL and
   rely on the brokered `Authorization` header.
3. `git clone --filter=blob:none <url> repo` (blobless partial clone: full commit
   graph so merge-base works, but fast — no blobs until needed)
4. `cd repo && git fetch origin pull/<n>/head:pr`
5. `BASE=$(git merge-base origin/HEAD pr)` then `git diff "$BASE" pr > /workspace/pr.diff`
6. Return `{ owner, repo, number, repoDir, diffPath, filesChanged, additions, deletions }`
   (line totals parsed from `git diff --numstat`).

Leaves both `/workspace/repo` (tree) and `/workspace/pr.diff` (diff) in the sandbox.

## Sandbox & auth (`subagents/review/sandbox.ts`)

- `git` comes from the base image `ghcr.io/vercel/eve:latest`.
- `onSession`: if `GITHUB_TOKEN` is set, try `sandbox.setNetworkPolicy(...)` to broker
  it as an `Authorization` header for `github.com`, keeping the secret out of the
  sandbox, and drop a `.github-brokered` marker file. Domain-level policy is rejected
  by Docker/just-bash, so the call is wrapped in try/catch; on failure the marker is
  absent and the tool falls back to the token-in-URL clone.

## Review & output

After fetch, the sub-agent reads `/workspace/pr.diff` and opens the affected files
under `/workspace/repo` to review changes in context (callers, types, related code).
It reviews for correctness bugs, security, error handling/edge cases, API/contract
changes, and maintainability — judged against the repo's own conventions, favouring a
few important findings over many nitpicks, and returns no findings when the change is
clean.

Sub-agent returns task-mode structured output:

```ts
outputSchema: {
  pr:      { owner, repo, number, url },
  stats:   { filesChanged, additions, deletions },
  summary: string,                       // overall assessment
  findings: Array<{
    severity: "critical" | "major" | "minor" | "info",
    file: string, line?: number,
    description: string, suggestion?: string,
  }>,
  recommendation: "approve" | "comment" | "request_changes",
}
```

The root narrates this back: leads with the recommendation + summary, then the
findings ordered by severity (file/line, problem, suggested fix), plus the diff size.

## Notes on eve task-mode `outputSchema`

Verified against the running agent: a declared sub-agent runs in **task mode** and its
`outputSchema` is a _soft_ contract — eve passes the model's JSON through as the
`result.completed` structured result without hard-validating it against the schema, so
prompt wording matters (loose wording makes the model drift to other field names). The
structured object is an internal hand-off to the parent; it is **not** shown in chat.
The user-facing output is always the **root's prose narration** of that object.

## Testing

- `eve dev`; message a known **public** PR — verify clone, diff stats, E-count.
- Message a **private** PR — verify the token path.
- Confirm which backend `eve dev` resolves locally to know whether brokering or the
  URL fallback is exercised.
