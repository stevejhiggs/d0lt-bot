export type PrRef = {
  owner: string;
  repo: string;
  number: number;
};

// Restrict owner/repo to GitHub's allowed characters so the values are always
// safe to interpolate into a shell command (no shell metacharacters possible).
const PR_URL =
  /^https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/pull\/(\d+)(?:[/?#].*)?$/;

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
