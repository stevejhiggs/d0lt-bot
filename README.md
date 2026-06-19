# d0lt-bot poc

A GitHub assistant built on the [eve](https://www.npmjs.com/package/eve) agent
framework. Point it at a pull request or a repository in chat and it does the work in
an isolated sandbox:

- **Review a pull request** — creates a sandbox, clones the repo, reads the diff in context, and returns a
  structured code review: a summary, severity-tagged findings (file/line/suggestion),
  and an `approve` / `comment` / `request changes` recommendation.
- **Run a repository's tests** — creates a sandbox, clones the code, detects the stack, installs
  dependencies, runs the tests, and reports a pass/fail result with the relevant output.

Note: this is not supposed to be an actual full review agent. It's mostly just a test of various systems running in eve. Currently actually running in github is not enabled, eve supports this and others easily but it was not implemented for this poc.

## How it works

A root agent routes each request to one of two specialist sub-agents, each with its own
isolated sandbox:

```
you ──chat──▶ root agent (d0lt-bot)
                 │ routes by intent
        ┌────────┴─────────┐
        ▼                  ▼
   review            test_runner
   (PR review)       (clone → install → test)
```

Both sub-agents share a single `fetch_repo` tool that clones a repo or PR head into the
sandbox (defined once in `agent/lib/tools/`, re-exported into each sub-agent). Private
repos are supported via a `GITHUB_TOKEN`, brokered at the sandbox firewall so the secret
never enters the sandbox (on backends that support it; otherwise it falls back to an
authenticated clone URL).

The design notes live in [`docs/plans/`](docs/plans/).

## Usage

Once running (see below), message the agent:

- `Review https://github.com/owner/repo/pull/123`
- `Run the tests for https://github.com/owner/repo`
- `Run the unit tests for https://github.com/owner/repo/tree/some-branch`

The bot replies in chat with the review or the test results.

## Getting started

Requirements: **Node 24** and a package manager (`pnpm` recommended).

```bash
pnpm install

# Set your Anthropic API key (used directly, not via a gateway).
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local
# Optional: a GitHub token with repo read access, for private repos.
echo "GITHUB_TOKEN=ghp_..." >> .env.local

pnpm dev
```

`pnpm dev` starts the eve development server (default `http://127.0.0.1:2000`). Talk to
it through the eve TUI, or over the HTTP API:

```bash
curl -X POST http://127.0.0.1:2000/eve/v1/session \
  -H "Content-Type: application/json" \
  -d '{"message":"Review https://github.com/octocat/Hello-World/pull/1"}'
```

## Configuration

| Variable            | Required | Purpose                                         |
| ------------------- | -------- | ----------------------------------------------- |
| `ANTHROPIC_API_KEY` | yes      | Calls Claude (Sonnet 4.6) directly.             |
| `GITHUB_TOKEN`      | no       | Repo read access for cloning **private** repos. |

Public repos work without a token. The local sandbox backend is resolved by eve
(microsandbox on Apple-Silicon macOS, Docker, or just-bash); in production on Vercel it
uses Vercel Sandbox.

## Project layout

```
agent/
├── agent.ts                  # root model config
├── instructions.md           # root: routes review vs test_runner
├── channels/eve.ts           # HTTP channel + auth
├── lib/
│   ├── github.ts             # URL parsing, ref validation, token brokering helpers
│   └── tools/fetch-repo.ts   # shared clone-into-sandbox tool
└── subagents/
    ├── review/               # PR code review
    └── test_runner/          # clone → install → run tests
docs/plans/                   # design documents
```

## Development

```bash
pnpm dev        # run the dev server
pnpm build      # build for deployment
pnpm typecheck  # tsgo type check
pnpm lint       # oxlint --fix && oxfmt
```

Built with the eve framework — see `node_modules/eve/docs/` for framework guides.
