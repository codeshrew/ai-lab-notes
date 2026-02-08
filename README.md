# AI Lab Notes

Personal technical blog built with [Astro 5](https://astro.build/) and [AstroPaper v5](https://github.com/satnaing/astro-paper). Covers AI experimentation, coding guides, and research notes.

## Quick Start

Requires Node 22 LTS. If using fnm:

```bash
fnm use           # Activates Node 22 from .node-version
pnpm install      # Install dependencies
pnpm dev          # http://localhost:4321
```

## Build and Preview

```bash
pnpm build        # Production build (runs type check + pagefind indexing)
pnpm preview      # Preview the production build locally
```

## Create a New Post

Create a Markdown file in `src/data/blog/`:

```bash
# File: src/data/blog/2026-02-08_my-post.md
```

See `CLAUDE.md` for frontmatter schema and content conventions, or `SPEC.md` for the full technical specification.

## Deployment

Not yet configured. Currently a local-only proof of concept.

## Tech Stack

- **Framework**: Astro 5.16
- **Theme**: AstroPaper v5.5
- **Styling**: Tailwind CSS v4
- **Search**: Pagefind (static, full-text)
- **Code highlighting**: Shiki (built into Astro)
- **Math**: KaTeX (remark-math + rehype-katex)
- **Diagrams**: Mermaid (client-side, loaded from CDN)
- **Package manager**: pnpm
- **Node version**: 22 LTS (managed via fnm)
