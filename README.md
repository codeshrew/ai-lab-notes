# Blog

Personal technical blog built with [Astro 5](https://astro.build/) and [AstroPaper v5](https://github.com/satnaing/astro-paper). Covers AI experimentation, coding guides, and research notes.

## Quick Start

```bash
pnpm install
pnpm dev          # http://localhost:4321
```

## Build and Preview

```bash
pnpm build        # Production build
pnpm preview      # Preview locally
```

## Create a New Post

Create a Markdown file in `src/content/blog/`:

```bash
# File: src/content/blog/2026-02-08_my-post.md
```

See `CLAUDE.md` for frontmatter schema and content conventions, or `SPEC.md` for the full technical specification.

## Deployment

Deployed via Cloudflare Pages. Push to `main` to publish.

## Tech Stack

- **Framework**: Astro 5.x
- **Theme**: AstroPaper v5
- **Styling**: Tailwind CSS v4
- **Search**: Pagefind
- **Code highlighting**: Shiki
- **Math**: KaTeX (remark-math + rehype-katex)
- **Diagrams**: Mermaid
- **Hosting**: Cloudflare Pages
