---
title: "Securing Your AI Agent Workflow: A Practical Guide"
author: sk
pubDatetime: 2026-02-08T00:00:00Z
featured: false
draft: true
tags:
  - ai
  - security
  - agents
  - guide
description: "Practical security measures for developers giving AI agents access to their terminal, browser, and codebase -- secrets management, sandboxing, and access control."
---

When you give an AI coding agent access to your terminal, it can read files, run commands, and interact with services on your behalf. This is what makes agents powerful -- and what makes security a real concern. This guide covers practical measures you can implement today to reduce risk without sacrificing productivity.

## Table of contents

## The Threat Model

Before hardening anything, understand what you are actually defending against. The realistic threats for a developer using AI coding agents are different from a production server.

### What Actually Goes Wrong

| Threat | Likelihood | Impact |
|--------|-----------|--------|
| **Accidental secret exposure** | High | High |
| Agent commits `.env` files, logs API keys, or includes credentials in context sent to the model provider. This is the most common real-world issue. |
| **Prompt injection via web content** | Medium | High |
| Agent reads a malicious webpage (via browser automation or web fetch) containing hidden instructions to exfiltrate data or run commands. |
| **Supply chain attack via MCP servers** | Medium | High |
| A malicious npm package masquerading as an MCP server. The first confirmed case (`postmark-mcp`, September 2025) silently BCC'd all emails to an attacker after 15 clean versions built trust. |
| **Lateral movement across projects** | Medium | Medium |
| Agent working in one project reads secrets from another project's config files. |
| **Browser session hijacking** | Medium | Very High |
| Browser automation tools connecting via Chrome DevTools Protocol can read HttpOnly cookies, OAuth tokens, and banking sessions from your live browser. |

### What Is NOT a Realistic Threat

- Nation-state attacks targeting your developer workstation
- Zero-day exploits against the agent itself
- Physical access attacks (disk encryption handles this)
- The AI "going rogue" -- agents follow instructions, they do not have independent goals

### What Gets Sent to the Cloud

When using a cloud-backed agent like Claude Code, your data traverses the network:

- **All prompts** you type and model responses
- **Full contents of files** the agent reads (not your entire project -- only files it opens)
- **Command outputs** from tools the agent runs
- **File names and directory structures** for context

API providers typically retain this data for 7-30 days. The implication: never let the agent read files containing production credentials, private keys, or sensitive customer data.

## Quick Wins: Start Here

These five actions address the highest-risk scenarios with minimal effort:

### 1. Block Sensitive File Reads

Configure your agent to refuse reading files that commonly contain secrets:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/credentials*)",
      "Read(**/secrets*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/*secret*)"
    ]
  }
}
```

For Claude Code, put this in `~/.claude/settings.json` (applies globally) or `.claude/settings.json` (per project). Most agents have equivalent configuration.

Also protect SSH keys and other credential stores:

```json
{
  "permissions": {
    "deny": [
      "Read(~/.ssh/*)",
      "Read(~/.aws/*)",
      "Read(~/.gnupg/*)",
      "Read(~/.config/gh/*)"
    ]
  }
}
```

### 2. Block Dangerous Commands

Prevent the agent from running destructive or risky shell commands:

```json
{
  "permissions": {
    "deny": [
      "Bash(sudo rm -rf *)",
      "Bash(mkfs*)",
      "Bash(dd *)",
      "Bash(curl * | sh*)",
      "Bash(curl * | bash*)",
      "Bash(wget * | sh*)",
      "Bash(wget * | bash*)"
    ]
  }
}
```

The `curl | bash` pattern is particularly important to block -- a prompt-injected agent could be tricked into downloading and executing arbitrary code.

### 3. Use Git for Everything

Every project the agent touches should be a git repository. This is your safety net:

```bash
# Before starting a session, ensure clean state
git status

# After the agent works, review changes
git diff
git log --oneline -5

# If something goes wrong, revert everything
git checkout .
```

Commit frequently -- after each successful sub-task, not just at the end of a session.

### 4. Scope GitHub Access

If your agent has GitHub access (for creating PRs, pushing branches), use fine-grained personal access tokens:

1. Go to GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens
2. **Repository access:** "Only select repositories" -- choose only repos the agent works on
3. **Permissions:** Contents (Read & Write), Pull requests (Read & Write), Issues (Read). Nothing else.
4. **Expiration:** 60 days maximum, then rotate.

Never give an agent your full-access GitHub token or one with admin permissions.

### 5. Isolate Browser Sessions

If you use browser automation MCP servers, never connect them to your primary browser profile:

```bash
# Create a dedicated browser profile for agent use
mkdir -p ~/.config/google-chrome-agent

google-chrome --user-data-dir="$HOME/.config/google-chrome-agent" \
  --remote-debugging-port=9222 \
  --no-first-run
```

This prevents the agent from accessing your banking sessions, email, saved passwords, and other sensitive browser data. Playwright MCP already creates isolated contexts by default -- this is mainly relevant for Chrome DevTools Protocol and extension-based MCP servers.

## Secrets Management

The long-term solution to accidental secret exposure is to keep secrets out of files that agents can read.

### The Template Pattern

Instead of `.env` files with actual values, use templates with references:

```bash
# .env.tpl -- safe to commit, contains only references
ANTHROPIC_API_KEY=op://AI-Agent/Anthropic/api-key
GITHUB_TOKEN=op://AI-Agent/GitHub-PAT/token
DATABASE_URL=op://AI-Agent/Postgres/connection-string
```

Inject the real values at runtime using a secrets manager. The agent sees the template but never the actual credentials.

### 1Password CLI

[1Password CLI](https://developer.1password.com/docs/cli/) is the most developer-friendly option for personal workstations:

```bash
# Install
sudo apt install 1password-cli

# Inject secrets at runtime
op run --env-file=.env.tpl -- your-command-here

# Or inject into config files
op inject -i config.tpl -o config.json
```

The recommended architecture:

1. Create a dedicated "AI-Agent" vault in 1Password
2. Create a service account scoped to only that vault with read-only access
3. Move only the credentials your agents need into that vault
4. Use `op run` to inject secrets at runtime

The agent never sees credential values -- they are injected into the process environment by 1Password, bypassing the filesystem entirely.

### 1Password SSH Agent

An underappreciated feature: 1Password can manage your SSH keys and serve them via an SSH agent. SSH private keys never exist as files on disk:

```
# ~/.ssh/config
Host *
    IdentityAgent ~/.1password/agent.sock
```

Since the keys are not on the filesystem, agents cannot read them even without deny list rules.

### SOPS + age for Secrets in Git

When you need encrypted secrets in a repository (deployment configs, shared credentials), [SOPS](https://github.com/getsops/sops) with [age](https://github.com/FiloSottile/age) encryption keeps them safe:

```bash
# Install
sudo apt install age
# Download SOPS from https://github.com/getsops/sops/releases

# Generate an encryption key
age-keygen -o ~/.config/sops/age/keys.txt

# Encrypt a file
sops -e .env > .env.enc

# Decrypt at runtime
eval $(sops -d .env.enc)
```

The `.env.enc` file is safe to commit -- it is encrypted. The decryption key stays on your machine.

### .gitignore as a Safety Net

Every project should have a comprehensive `.gitignore` that prevents accidental commits of secrets:

```bash
# Environment files
.env
.env.*
!.env.tpl
!.env.example
!.env.enc

# Credentials
*.pem
*.key
*.p12
credentials.json
service-account.json

# Secret management
age.key
keys.txt
```

## Sandboxing

For maximum safety, restrict what the agent can access at the OS level.

### Claude Code Native Sandboxing

Claude Code includes built-in sandboxing using OS-level primitives:

```bash
# Install prerequisites (Linux)
sudo apt install bubblewrap socat

# Enable in Claude Code
# Run /sandbox, then select "Auto-allow mode"
```

What sandboxing enforces:
- **Filesystem:** Read/write access only to the current working directory
- **Network:** Only approved domains can be accessed
- **Process isolation:** All child processes inherit the same restrictions

### Firejail for MCP Servers

Run untrusted MCP servers in a Firejail sandbox:

```bash
sudo apt install firejail

# Run an MCP server with restricted access
firejail --private --net=none npx some-mcp-server
```

You can create per-server profiles that whitelist only the directories and network access each server needs.

### Anthropic Sandbox Runtime

Anthropic released their sandbox runtime as an [open-source package](https://github.com/anthropic-experimental/sandbox-runtime) that can sandbox any process:

```bash
# Sandbox any command
npx @anthropic-ai/sandbox-runtime npx @some-org/mcp-server

# Sandbox an MCP server in your agent config
```

## MCP Server Supply Chain Security

MCP servers are npm packages that run with your user's permissions. A malicious MCP server can read files, make network requests, and execute commands.

### The Postmark Incident

In September 2025, a malicious package called `postmark-mcp` appeared on npm. It copied a legitimate email-sending MCP server, built trust over 15 clean versions, then injected a backdoor that silently BCC'd all emails to an attacker. This was the first confirmed malicious MCP server.

### Defenses

1. **Prefer official MCP servers** from organizations you trust (Microsoft, Google, Anthropic)
2. **Pin exact versions** -- do not use `@latest` in your MCP configuration
3. **Check the GitHub repo** before installing -- look at the maintainer history, recent commits, and issue discussions
4. **Run `npm audit`** on MCP server dependencies
5. **Sandbox MCP servers** using Firejail or the Anthropic sandbox runtime

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@1.58.2"]
    }
  }
}
```

Note the pinned version (`@1.58.2`) instead of `@latest`.

## Hooks: Deterministic Security Controls

If your agent supports lifecycle hooks, these are the strongest security mechanism available. Unlike instructions in a system prompt (which the model can ignore), hooks execute deterministically.

### Block Sensitive File Reads via Hook

```bash
#!/bin/bash
# .claude/hooks/block-sensitive-reads.sh
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

BLOCKED_PATTERNS=(
  "\.env$"
  "\.env\."
  "\.ssh/"
  "\.gnupg/"
  "\.config/gh/"
  "credentials"
  "\.pem$"
  "\.key$"
  "secret"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$FILE_PATH" | grep -qiE "$pattern"; then
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Blocked: sensitive file"
      }
    }'
    exit 0
  fi
done

exit 0
```

### Scan for Leaked Secrets After Writes

```bash
#!/bin/bash
# .claude/hooks/scan-secrets.sh
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Check for common secret patterns
if grep -qE '(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|-----BEGIN .* PRIVATE KEY)' "$FILE_PATH"; then
  echo '{"decision":"block","reason":"Potential secret detected in file"}'
  exit 0
fi

exit 0
```

## Secret Scanning in Git

As a final safety layer, scan your repositories for accidentally committed secrets.

### Gitleaks

[Gitleaks](https://github.com/gitleaks/gitleaks) is fast, lightweight, and integrates with pre-commit hooks:

```bash
# Install
curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.22.1/gitleaks_8.22.1_linux_x64.tar.gz | \
  tar xz -C /usr/local/bin gitleaks

# Scan current repo
gitleaks detect --source .

# Set up as a pre-commit hook
pip install pre-commit
```

Create `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.22.1
    hooks:
      - id: gitleaks
```

```bash
pre-commit install
```

Now every `git commit` automatically scans for secrets before allowing the commit through.

## Local Service Hardening

If you run local AI services (Ollama, LM Studio, Open WebUI), make sure they are not exposed to your network:

```bash
# Check for services listening on all interfaces
ss -tlnp | grep '0.0.0.0'
```

Any service bound to `0.0.0.0` is accessible from your entire network. For services without authentication (Ollama, LM Studio), bind to localhost only:

```bash
# Ollama: edit systemd service
sudo systemctl edit ollama
# Add: Environment="OLLAMA_HOST=127.0.0.1"
sudo systemctl restart ollama

# LM Studio
lms server start --host 127.0.0.1

# Open WebUI (Docker)
# Use 127.0.0.1:3000:8080 instead of 3000:8080 in port mapping
```

## The Priority List

If you implement just three things from this guide:

1. **Block sensitive file reads and dangerous commands** in your agent's deny list. This prevents the most common accidental exposures.
2. **Isolate browser sessions** by using a dedicated Chrome profile or relying on Playwright's default isolation. This prevents the highest-impact attack (browser session hijacking).
3. **Set up a pre-commit secret scanner** (Gitleaks). This catches secrets that slip through other defenses before they reach your remote repository.

Everything else builds on this foundation. Add 1Password CLI for proper secrets management when you have time. Enable sandboxing for defense in depth. Add hooks for deterministic controls.

Security is not about perfection -- it is about reducing the most likely and most impactful risks to an acceptable level. These measures give AI agents the access they need to be productive while keeping your credentials and sessions safe.
