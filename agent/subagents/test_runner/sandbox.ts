import { defineSandbox } from "eve/sandbox";
import { brokerGitHubAuth } from "../../lib/github.ts";

export default defineSandbox({
  // Default backend (Vercel Sandbox in prod, else Docker / microsandbox / just-bash
  // locally). The base image ships git + node; the agent installs whatever else a
  // given repo needs at runtime. Brokering's "*" catch-all keeps egress open so
  // package installs reach their registries.
  async onSession({ use }) {
    await brokerGitHubAuth(await use(), process.env.GITHUB_TOKEN);
  },
});
