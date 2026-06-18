import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertSafeRef, parseGitHubTarget, resolveCloneUrl } from "../../../lib/github.ts";

export default defineTool({
  description:
    "Clone a GitHub repository (or a pull request's head) into the sandbox at " +
    "/workspace/repo so its tests can be run. Accepts a repo URL or a PR URL, with " +
    "an optional branch/tag/commit to check out for repo URLs.",
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

    // owner/repo are charset-constrained by parseGitHubTarget; the ref is validated
    // below; the PR number is digits-only — so nothing here can inject shell syntax.
    const lines = [
      "set -euo pipefail",
      "rm -rf repo",
      `git clone --filter=blob:none --quiet ${cloneUrl} repo`,
      "cd repo",
    ];
    if (target.kind === "pr") {
      lines.push(
        `git fetch --quiet origin pull/${target.number}/head:pr`,
        "git checkout --quiet pr",
      );
    } else if (target.ref) {
      lines.push(`git checkout --quiet "${assertSafeRef(target.ref)}"`);
    }
    lines.push("git rev-parse --short HEAD", "git log -1 --pretty=%s");

    const result = await sandbox.run({ command: lines.join("\n") });
    const [head = "", subject = ""] = result.stdout.trim().split("\n");

    return {
      ...target,
      repoDir: "/workspace/repo",
      head: head.trim(),
      headSubject: subject.trim(),
    };
  },
});
