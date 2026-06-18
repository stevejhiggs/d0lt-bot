import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";
import { z } from "zod";

export default defineAgent({
  description:
    "Reviews a GitHub pull request. Given a PR URL, clones the repo into its sandbox, " +
    "computes the diff, runs a review over it, and returns structured findings.",
  model: anthropic("claude-sonnet-4-6"),
  // Task-mode structured output returned to the delegating parent.
  outputSchema: z.object({
    pr: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
      url: z.string(),
    }),
    stats: z.object({
      filesChanged: z.number(),
      additions: z.number(),
      deletions: z.number(),
      letterECount: z.number().describe("Case-insensitive count of the letter E in the diff."),
    }),
    summary: z.string().describe("One-line human-readable summary of the review."),
  }),
});
