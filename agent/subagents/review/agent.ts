import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";
import { z } from "zod";

export default defineAgent({
  description:
    "Reviews a GitHub pull request. Given a PR URL, clones the repo into its sandbox, " +
    "computes the diff, reads the changed code in context, and returns a structured " +
    "code review: a summary, severity-tagged findings, and an overall recommendation.",
  model: anthropic("claude-sonnet-4-6"),
  // Task-mode structured output returned to the delegating parent, which narrates it.
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
    }),
    summary: z.string().describe("Overall assessment of the PR in a few sentences."),
    findings: z
      .array(
        z.object({
          severity: z.enum(["critical", "major", "minor", "info"]),
          file: z.string(),
          line: z.number().optional().describe("Line in the new file, when applicable."),
          description: z.string().describe("What the issue is and why it matters."),
          suggestion: z.string().optional().describe("How to fix it, when clear."),
        }),
      )
      .describe("Specific issues found, ordered most to least severe. Empty if none."),
    recommendation: z
      .enum(["approve", "comment", "request_changes"])
      .describe("approve = ship it, comment = non-blocking notes, request_changes = must fix."),
  }),
});
