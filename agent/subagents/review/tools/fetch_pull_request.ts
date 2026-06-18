import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseNumstat, parsePrTarget, resolveCloneUrl } from "../../../lib/github.ts";

export default defineTool({
  description:
    "Clone a GitHub repository into the sandbox and compute the diff for a pull request. " +
    "Writes the full unified diff to /workspace/pr.diff and checks the repo out at " +
    "/workspace/repo, then returns the diff stats and those paths.",
  inputSchema: z.object({
    url: z.string().describe("Full GitHub PR URL, e.g. https://github.com/owner/repo/pull/123"),
  }),
  async execute({ url }, ctx) {
    const { owner, repo, number } = parsePrTarget(url);
    const sandbox = await ctx.getSandbox();
    const cloneUrl = await resolveCloneUrl(sandbox, owner, repo);

    // owner/repo are constrained to GitHub's safe charset by parsePrTarget, and
    // number is digits-only, so interpolation here cannot inject shell syntax.
    const script = [
      "set -euo pipefail",
      "rm -rf repo pr.diff",
      `git clone --filter=blob:none --quiet ${cloneUrl} repo`,
      "cd repo",
      `git fetch --quiet origin pull/${number}/head:pr`,
      'BASE="$(git merge-base origin/HEAD pr)"',
      'git diff "$BASE" pr > /workspace/pr.diff',
      'git diff --numstat "$BASE" pr',
    ].join("\n");

    const result = await sandbox.run({ command: script });
    const stats = parseNumstat(result.stdout);

    return {
      owner,
      repo,
      number,
      repoDir: "/workspace/repo",
      diffPath: "/workspace/pr.diff",
      ...stats,
    };
  },
});
