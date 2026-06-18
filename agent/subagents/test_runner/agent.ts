import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";
import { z } from "zod";

export default defineAgent({
  description:
    "Runs a repository's tests. Given a GitHub repo or PR URL plus a testing " +
    "instruction, clones the code into its sandbox, detects the stack, installs " +
    "dependencies, runs the tests, and returns a structured pass/fail result.",
  model: anthropic("claude-sonnet-4-6"),
  // Task-mode structured output returned to the delegating parent, which narrates it.
  outputSchema: z.object({
    repo: z.string().describe('"owner/repo".'),
    target: z.string().describe('What was checked out, e.g. "PR #123" or "branch main".'),
    stack: z.string().describe('Detected stack and package manager, e.g. "Node (pnpm)".'),
    installCommand: z.string().optional().describe("The install command that was run."),
    testCommand: z.string().describe("The test command that was run."),
    passed: z.boolean().describe("True only if the test command exited successfully."),
    summary: z
      .string()
      .describe("A few sentences: what was run, the outcome, and counts if available."),
    output: z
      .string()
      .describe("The relevant tail of the test output (truncated), focused on failures."),
  }),
});
