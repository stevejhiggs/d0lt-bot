import { defineSandbox } from "eve/sandbox";

export default defineSandbox({
  // Default backend (Vercel Sandbox in prod, else Docker / microsandbox / just-bash
  // locally). The base image ships git, which is all the clone + diff needs.
  async onSession({ use }) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      // No token: public repos only. Clone over anonymous HTTPS.
      await use();
      return;
    }

    // Prefer credential brokering: inject an Authorization header for github.com
    // at the firewall so the token never enters the sandbox. Only domain-capable
    // backends (Vercel, microsandbox) support this; others throw, and we fall
    // back to an authenticated clone URL built in the tool.
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    const sandbox = await use();
    try {
      await sandbox.setNetworkPolicy({
        allow: {
          "github.com": [{ transform: [{ headers: { authorization: `Basic ${basic}` } }] }],
          "*": [],
        },
      });
      // Marker the tool reads to know it can clone the plain URL.
      await sandbox.writeTextFile({ path: ".github-brokered", content: "1" });
    } catch {
      // Backend can't broker domain-level credentials (Docker/just-bash);
      // the tool will embed the token in the clone URL instead.
    }
  },
});
