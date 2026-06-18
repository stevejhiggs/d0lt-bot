// Restrict owner/repo to GitHub's allowed characters so the values are always
// safe to interpolate into a shell command (no shell metacharacters possible).
const PR_URL =
  /^https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/pull\/(\d+)(?:[/?#].*)?$/;
const REPO_URL =
  /^https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/tree\/([^/?#]+))?\/?(?:[?#].*)?$/;

export type PrRef = {
  owner: string;
  repo: string;
  number: number;
};

/**
 * Parse a GitHub pull-request URL into its owner / repo / number parts.
 * Throws on anything that is not a github.com PR URL.
 */
export function parsePrUrl(url: string): PrRef {
  const match = PR_URL.exec(url.trim());
  if (!match) {
    throw new Error(
      `Not a GitHub pull-request URL: ${url}. Expected https://github.com/<owner>/<repo>/pull/<number>.`,
    );
  }
  const [, owner, repo, number] = match;
  return { owner, repo, number: Number(number) };
}

export type GitHubTarget =
  | { kind: "pr"; owner: string; repo: string; number: number }
  | { kind: "repo"; owner: string; repo: string; ref?: string };

/**
 * Parse a GitHub repo URL or PR URL into a target. A PR URL resolves to the PR
 * head; a repo URL resolves to the repo (optionally a `/tree/<ref>` or an
 * explicit `refOverride`). Throws on anything that is not a github.com URL.
 */
export function parseGitHubTarget(url: string, refOverride?: string): GitHubTarget {
  const trimmed = url.trim();
  const pr = PR_URL.exec(trimmed);
  if (pr) {
    const [, owner, repo, number] = pr;
    return { kind: "pr", owner, repo, number: Number(number) };
  }
  const repoMatch = REPO_URL.exec(trimmed);
  if (!repoMatch) {
    throw new Error(
      `Not a GitHub repo or PR URL: ${url}. Expected https://github.com/<owner>/<repo>[/tree/<ref>] or a /pull/<number> URL.`,
    );
  }
  const [, owner, repo, treeRef] = repoMatch;
  const ref = refOverride ?? treeRef;
  return ref ? { kind: "repo", owner, repo, ref } : { kind: "repo", owner, repo };
}

/** Git refs we are willing to interpolate into a shell command. */
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;

/**
 * Validate a branch/tag/commit before it is interpolated into a shell command.
 * Rejects metacharacters and a leading `-` (which git would read as a flag).
 */
export function assertSafeRef(ref: string): string {
  if (!SAFE_REF.test(ref) || ref.startsWith("-")) {
    throw new Error(`Unsafe git ref: ${ref}`);
  }
  return ref;
}

export type DiffStats = {
  filesChanged: number;
  additions: number;
  deletions: number;
};

/**
 * Parse the output of `git diff --numstat` into totals. Binary files report
 * their counts as `-` and contribute to the file count but not line totals.
 */
export function parseNumstat(stdout: string): DiffStats {
  let filesChanged = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const [add, del] = trimmed.split("\t");
    filesChanged += 1;
    if (add !== "-") additions += Number(add) || 0;
    if (del !== "-") deletions += Number(del) || 0;
  }
  return { filesChanged, additions, deletions };
}
