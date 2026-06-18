# Test Runner Agent — Design

Date: 2026-06-18

## Goal

Add a second specialist to d0lt-bot: given a GitHub repo or PR URL plus a testing
instruction, clone the code into a sandbox, install dependencies, run the tests, and
report a structured pass/fail result. The root narrates it back as prose.

## Decisions

- **Trigger:** chat — "run the tests for `<url>`" (+ optional instruction).
- **Input:** a repo URL _or_ a PR URL, with an optional branch/tag/commit ref.
- **Engine:** **fully agent-driven** — the `clone_repo` tool only checks the code out;
  the sub-agent uses `bash` to detect the stack, install deps, and run the tests,
  guided by the user's instruction. No built-in per-ecosystem logic.
- **Repo access:** public + private via `GITHUB_TOKEN`, same brokering-or-URL handling
  as the `review` agent.
- **Output:** structured result the root narrates (same model as `review`).

## Architecture

```
You ──"run the tests for https://github.com/owner/repo"──▶  root agent (d0lt-bot)
                                                                │ routes by intent
                                       ┌────────────────────────┴───────────────┐
                                       ▼                                         ▼
                               review subagent                          test_runner subagent (own sandbox)
                                                                          1. clone_repo → /workspace/repo
                                                                          2. detect stack (bash)
                                                                          3. install deps (bash)
                                                                          4. run tests (bash)
                                                                          5. structured pass/fail (task mode)
                                                                                │
                                                                                ▼
                                                          root narrates pass/fail + output in chat
```

The root routes by intent: PR review → `review`; run tests → `test_runner`. Each is a
declared sub-agent with its own isolated sandbox.

## Shared code

`agent/lib/github.ts` (moved up from `review/`, imported by both sub-agents):

- `parseGitHubTarget(url, refOverride?)` → `{ kind: "pr"|"repo", owner, repo, number?, ref? }`,
  and `parsePrTarget(url)` for the review tool (PR-only, throws otherwise).
- `assertSafeRef` validates a ref before it is interpolated into a shell command
  (rejects metacharacters and a leading `-`). `parseNumstat` parses `git diff --numstat`.
- `brokerGitHubAuth(sandbox, token)` and `resolveCloneUrl(sandbox, owner, repo)` —
  the single home for the token-brokering / `.github-brokered` marker / token-in-URL
  fallback logic, shared by both sub-agents' `sandbox.ts` and clone tools.

owner/repo are charset-constrained by the URL regexes, the PR number is digits-only, and
the ref is validated — so nothing user-supplied can inject shell syntax in `clone_repo`.

## Files

```
agent/
├── instructions.md                  # routes review vs test_runner
├── lib/github.ts                    # shared URL parsing + ref validation
└── subagents/
    ├── review/ …                    # unchanged (now imports ../../../lib/github.ts)
    └── test_runner/
        ├── agent.ts                 # description + model + outputSchema
        ├── instructions.md          # detect → install → run → report
        ├── tools/clone_repo.ts      # clone repo or PR head into /workspace/repo
        └── sandbox.ts               # own sandbox; broker GITHUB_TOKEN
```

## `clone_repo` tool

`{ url, ref? }`. Parses the target; clones blobless into `/workspace/repo`; for a PR
fetches `pull/<n>/head` and checks it out; for a repo checks out `ref` when given.
Token handled via the shared `resolveCloneUrl` (brokering marker → plain URL, else
token-in-URL). Returns `{ ...target, repoDir, head, headSubject }`.

## `outputSchema`

```ts
{ repo, target, stack, installCommand?, testCommand, passed, summary, output }
```

`passed` is true only if the test command exited 0. `output` is a truncated tail focused
on failures. The root leads with pass/fail, the command + stack, the summary, and (on
failure) the relevant output.

## Caveats

- **Network:** installs need egress to registries. Locally (microsandbox) the brokered
  `"*": []` catch-all keeps egress open. In prod, configure an allow-list (registries +
  github.com).
- **Toolchains:** the eve base image has git + node; exotic stacks may be missing — the
  agent installs what it can or reports the gap rather than failing cryptically.
- **Output size / time:** test logs can be large and runs slow; the agent truncates to a
  summary + tail, and the sandbox has its own idle timeout.

## Testing

- `eve dev`; ask it to run the tests for a small public Node repo — verify clone, stack
  detection, install, test run, and the narrated pass/fail.
- Try a PR URL and a `/tree/<branch>` URL to exercise both target kinds.
