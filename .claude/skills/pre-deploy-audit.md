# Skill: Pre-Deploy Audit

## Usage

`/pre-deploy-audit` -- Run a security and privacy checklist before pushing to the public repo.

## Instructions

Before pushing changes to the public GitHub repo, run through this checklist. Report each item as PASS or FAIL. Stop and alert the user on any FAIL.

### 1. No Secrets in Source

Search the entire repo (excluding `node_modules/`, `dist/`, `.astro/`, `.git/`) for:

- API keys or tokens: patterns like `sk-`, `ghp_`, `gho_`, `ghs_`, `github_pat_`, `xoxb-`, `xoxp-`, `AKIA`
- Hardcoded passwords or credentials (not inside educational code blocks showing examples)
- Private keys: `BEGIN.*PRIVATE KEY`, `.pem`, `.p12`, `.pfx` files
- 1Password references that leak vault structure (acceptable: `op://` URI patterns in educational content)

```bash
# Run from repo root
grep -rE '(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|github_pat_|AKIA[A-Z0-9]{16}|xoxb-|xoxp-)' --include='*.ts' --include='*.js' --include='*.md' --include='*.json' --include='*.yaml' --include='*.yml' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
```

### 2. No .env Files Committed

Verify `.gitignore` excludes `.env` and `.env.*` (except `.env.example`):

```bash
git ls-files -- '*.env*'           # Should return nothing
cat .gitignore | grep -i env       # Should show .env exclusion rules
```

### 3. No Private IPs or Internal URLs

Search for the actual system IP (`10.0.0.166`) or any private network references that are not clearly example/placeholder values:

```bash
grep -rn '10\.0\.0\.166' --include='*.md' --include='*.ts' --include='*.json' src/
```

Acceptable: `10.0.0.100`, `192.168.x.x`, `127.0.0.1` used as examples in educational blog posts.

### 4. No Draft Posts Accidentally Published

Check that posts intended as drafts still have `draft: true`:

```bash
grep -l 'draft: false' src/data/blog/*.md
```

Review the list. Any post that should not be public yet must have `draft: true`.

### 5. Blog Content Review

Scan blog posts for:

- Real usernames, full names, or personal identifiers (beyond the public author handle `sk`)
- Real internal hostnames or machine names that should not be public
- References to private repos, internal tools, or company-specific information
- Accidentally included session logs, terminal output with private paths, or debug output

### 6. Git History Check

Verify no secrets were ever committed (even if later removed):

```bash
git log --all -p --diff-filter=A -- '*.env' '*.key' '*.pem' '*.secret' '*.token' '*.credentials'
git log --all -p -S 'ghp_' -S 'AKIA'
```

### 7. Config Files

Verify these files contain no secrets:

- `astro.config.ts` -- no API keys or private endpoints
- `src/config.ts` -- no private URLs
- `src/constants.ts` -- no private social links or emails
- `package.json` -- no private registry URLs
- `tsconfig.json` -- no private paths

### 8. Build Artifacts Excluded

Verify build outputs are not tracked:

```bash
git ls-files -- dist/ .astro/ node_modules/ public/pagefind/
# Should return nothing
```

## Output Format

Report results as:

```
Pre-Deploy Audit Results
========================
1. No secrets in source:        [PASS/FAIL]
2. No .env files committed:     [PASS/FAIL]
3. No private IPs/URLs:         [PASS/FAIL]
4. No accidental draft publish: [PASS/FAIL]
5. Blog content review:         [PASS/FAIL]
6. Git history clean:           [PASS/FAIL]
7. Config files clean:          [PASS/FAIL]
8. Build artifacts excluded:    [PASS/FAIL]

Verdict: SAFE TO PUSH / BLOCKED (details)
```
