import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";

export default defineAgent({
  // Calls Anthropic directly using ANTHROPIC_API_KEY from .env.local,
  // instead of routing through the Vercel AI Gateway.
  model: anthropic("claude-sonnet-4-6"),
});
