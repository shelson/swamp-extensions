# /jira

Auto-generated [swamp](https://github.com/swamp-club/swamp) extension models for
Jira Cloud resources.

Each model represents a single Jira resource (e.g., an issue, a project, a
component). Models have **domain properties** that you configure (the desired
state) and **resource properties** that reflect the live state in Jira.
Available methods:

- **create** — provision the resource using the configured properties
- **get** — fetch the current state of a specific resource by ID or key
- **update** — apply property changes to an existing resource
- **delete** — remove the resource from Jira
- **sync** — refresh all resource properties from the API

Use `swamp model type describe /jira/<model>` to see the full list of
configurable properties and available methods for a model.

## Authentication

Jira Cloud uses HTTP Basic authentication: an **email** paired with an **API
token**, scoped to a cloud **site** (e.g. `acme.atlassian.net`). Each value can
be provided as a global argument or via an environment variable.

**Option 1 — global arguments (recommended).** Wire the token from a vault so
the secret never lives in your shell environment:

```yaml
# in the model definition
globalArguments:
  site: acme.atlassian.net
  email: you@example.com
  token: ${{ vault.get(my-vault, jira-api-token) }}
```

The `token` argument is marked sensitive: swamp redacts its value from run logs
and reports and vaults it on write. A vault-sourced value is stored as the
`vault.get(...)` expression and only resolved at execution time, so the raw
secret never lands in the model definition.

**Option 2 — environment variables.** Used when the corresponding global
argument is not set:

```bash
export JIRA_SITE=acme.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_API_TOKEN=your-token-here
```

Create an API token at
<https://id.atlassian.com/manage-profile/security/api-tokens>.

## Usage

```bash
# Create a new project model
swamp model create /jira/project my-project

# Edit the model to configure its properties
swamp model edit my-project

# Create the resource in Jira
swamp model method run my-project create

# Sync current state from Jira
swamp model method run my-project sync
```

## License

AGPLv3 — see [LICENSE.txt](./LICENSE.txt).
