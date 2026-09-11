# Development setup

After cloning, configure this repository before committing:

```sh
git config user.name "Lukas Brückner"
git config user.email lukas@lb-engineering.org
git config user.useConfigOnly true
git config core.hooksPath .githooks
pnpm install --frozen-lockfile
pnpm check
```

The commit and push hooks check author and committer identities. CI repeats
the check over the full branch history. Approved identities are Lukas's work
address and account-specific GitHub noreply address; GitHub-generated identities
are also accepted. Adding another contributor requires an explicit policy update.
Hooks must be enabled for each clone.
