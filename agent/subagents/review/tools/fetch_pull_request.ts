import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseNumstat, parsePrUrl } from "../../../lib/github.ts";

export default defineTool({
  description:
    "Clone a GitHub repository into the sandbox and compute the diff for a pull request. " +
    "Writes the full unified diff to /workspace/pr.diff and checks the repo out at " +
    "/workspace/repo, then returns the diff stats and those paths.",
  inputSchema: z.object({
    url: z.string().describe("Full GitHub PR URL, e.g. https://github.com/owner/repo/pull/123"),
  }),
  async execute({ url }, ctx) {
    const { owner, repo, number } = parsePrUrl(url);
    const sandbox = await ctx.getSandbox();

    // Did onSession broker the GitHub token at the firewall this session?
    // If so, clone the plain URL and let the injected Authorization header
    // authenticate. Otherwise fall back to an authenticated clone URL.
    let brokered = false;
    try {
      await sandbox.readTextFile({ path: ".github-brokered" });
      brokered = true;
    } catch {
      // marker absent → not brokered
    }

    const token = process.env.GITHUB_TOKEN;
    const cloneUrl =
      !brokered && token
        ? `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
        : `https://github.com/${owner}/${repo}.git`;

    // owner/repo are constrained to GitHub's safe charset by parsePrUrl, and
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
