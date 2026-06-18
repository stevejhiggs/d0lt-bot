import type { SandboxSession } from "eve/sandbox";

// Restrict owner/repo to GitHub's allowed characters so the values are always
// safe to interpolate into a shell command (no shell metacharacters possible).
const PR_URL =
  /^https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/pull\/(\d+)(?:[/?#].*)?$/;
const REPO_URL =
  /^https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/tree\/([^/?#]+))?\/?(?:[?#].*)?$/;

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

/** Parse a PR URL specifically, rejecting non-PR GitHub URLs. */
export function parsePrTarget(url: string): Extract<GitHubTarget, { kind: "pr" }> {
  const target = parseGitHubTarget(url);
  if (target.kind !== "pr") {
    throw new Error(`Expected a GitHub pull-request URL, got: ${url}`);
  }
  return target;
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

// Marker file a brokering session drops so clone tools know they can clone the
// plain URL (the firewall injects the Authorization header) instead of falling
// back to a token-in-URL clone.
const BROKER_MARKER = ".github-brokered";

/**
 * Set up authenticated git access to github.com for a fresh sandbox session.
 * Prefers credential brokering: inject an `Authorization` header at the firewall
 * so the token never enters the sandbox, and drop a marker file. The `"*"`
 * catch-all keeps general egress open (e.g. for package installs). Backends that
 * can't broker domain-level credentials (Docker/just-bash) throw — then the marker
 * stays absent and {@link resolveCloneUrl} falls back to a token-in-URL clone.
 * A no-op when no token is configured (public repos clone anonymously).
 */
export async function brokerGitHubAuth(
  sandbox: SandboxSession,
  token: string | undefined,
): Promise<void> {
  if (!token) return;
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  try {
    await sandbox.setNetworkPolicy({
      allow: {
        "github.com": [{ transform: [{ headers: { authorization: `Basic ${basic}` } }] }],
        "*": [],
      },
    });
    await sandbox.writeTextFile({ path: BROKER_MARKER, content: "1" });
  } catch {
    // Backend can't broker; resolveCloneUrl will embed the token in the URL.
  }
}

/**
 * Resolve the clone URL for a github.com repo. If brokering ran this session
 * (marker present), clone the plain URL and let the injected header authenticate;
 * otherwise embed the `GITHUB_TOKEN` in the URL when one is available.
 */
export async function resolveCloneUrl(
  sandbox: SandboxSession,
  owner: string,
  repo: string,
): Promise<string> {
  let brokered = false;
  try {
    await sandbox.readTextFile({ path: BROKER_MARKER });
    brokered = true;
  } catch {
    // marker absent → not brokered
  }
  const token = process.env.GITHUB_TOKEN;
  return !brokered && token
    ? `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`;
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
