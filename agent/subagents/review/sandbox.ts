import { defineSandbox } from "eve/sandbox";
import { brokerGitHubAuth } from "../../lib/github.ts";

export default defineSandbox({
  // Default backend (Vercel Sandbox in prod, else Docker / microsandbox / just-bash
  // locally). The base image ships git, which is all the clone + diff needs.
  async onSession({ use }) {
    await brokerGitHubAuth(await use(), process.env.GITHUB_TOKEN);
  },
});
