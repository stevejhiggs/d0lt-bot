import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertSafeRef, parseGitHubTarget, parseNumstat, resolveCloneUrl } from "../github.ts";

/**
 * Shared by both sub-agents (each re-exports this from its own `tools/fetch_repo.ts`,
 * since eve does not let declared sub-agents share a tool slot directly). Clones a
 * GitHub repo or PR head into the sub-agent's sandbox; for a PR it also produces the
 * diff, which the review agent consumes and the test runner ignores.
 */
export default defineTool({
  description:
    "Clone a GitHub repository or pull request into the sandbox at /workspace/repo " +
    "and check out its code. Accepts a repo URL or a PR URL, with an optional " +
    "branch/tag/commit for repo URLs. For a PR, also writes the unified diff to " +
    "/workspace/pr.diff and returns its stats (filesChanged, additions, deletions).",
  inputSchema: z.object({
    url: z
      .string()
      .describe("GitHub repo URL (https://github.com/owner/repo) or PR URL (.../pull/123)."),
    ref: z
      .string()
      .optional()
      .describe("Optional branch, tag, or commit to check out. Ignored for PR URLs."),
  }),
  async execute({ url, ref }, ctx) {
    const target = parseGitHubTarget(url, ref);
    const sandbox = await ctx.getSandbox();
    const cloneUrl = await resolveCloneUrl(sandbox, target.owner, target.repo);

    // owner/repo are charset-constrained by parseGitHubTarget; the ref is validated;
    // the PR number is digits-only — so nothing here can inject shell syntax.
    const lines = [
      "set -euo pipefail",
      "rm -rf repo pr.diff",
      `git clone --filter=blob:none --quiet ${cloneUrl} repo`,
      "cd repo",
    ];
    if (target.kind === "pr") {
      lines.push(
        `git fetch --quiet origin pull/${target.number}/head:pr`,
        "git checkout --quiet pr",
        'BASE="$(git merge-base origin/HEAD pr)"',
        'git diff "$BASE" pr > /workspace/pr.diff',
      );
    } else if (target.ref) {
      lines.push(`git checkout --quiet "${assertSafeRef(target.ref)}"`);
    }
    lines.push("git rev-parse --short HEAD");
    if (target.kind === "pr") {
      lines.push('echo "---DIFF---"', 'git diff --numstat "$BASE" pr');
    }

    const result = await sandbox.run({ command: lines.join("\n") });
    const [headLine = "", diffSection = ""] = result.stdout.split("---DIFF---");

    return {
      ...target,
      repoDir: "/workspace/repo",
      head: headLine.trim(),
      ...(target.kind === "pr"
        ? { diffPath: "/workspace/pr.diff", ...parseNumstat(diffSection) }
        : {}),
    };
  },
});
