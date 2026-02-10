# Skill: Create a New Blog Post

## Usage

`/new-post [title]` -- Create a new blog post with proper frontmatter and file naming.

## Instructions

When the user asks to create a new post (or invokes `/new-post`):

1. **Determine the slug** from the title: lowercase, hyphenated, no special characters. Keep it short (3-5 words).

2. **Create the file** at:
   ```
   src/data/blog/YYYY-MM-DD_slug-in-kebab-case.md
   ```
   Use today's date. The `src/data/blog/` directory is where AstroPaper v5 stores blog content.

3. **Write the frontmatter** using this template:
   ```yaml
   ---
   title: "Post Title Here"
   author: sk
   pubDatetime: YYYY-MM-DDT12:00:00-05:00
   featured: false
   draft: true
   tags:
     - tag1
     - tag2
   description: "One-line summary, max 200 characters."
   ---
   ```

4. **Write the body** in standard Markdown:
   - Start with a 1-2 paragraph introduction
   - Use `## Heading` for sections (h2 and below; h1 is the title)
   - Include a `## Table of contents` heading (AstroPaper auto-generates the ToC)
   - Use fenced code blocks with language tags for code
   - Use ```` ```mermaid ```` for diagrams
   - Use `$...$` for inline math and `$$...$$` for display math
   - End with a conclusion or next-steps section

5. **Tag conventions**: Use lowercase, hyphenated tags. Common tags:
   `ai`, `llm`, `local-models`, `ollama`, `lm-studio`, `coding`, `python`, `typescript`,
   `linux`, `pop-os`, `gpu`, `nvidia`, `setup-guide`, `til`, `research`, `review`,
   `claude-code`, `docker`, `agents`

6. **Tell the user** the file was created and suggest:
   - `pnpm dev` to preview at `http://localhost:4321/posts/SLUG/`
   - Set `draft: false` when ready to publish
   - `pnpm build` to verify before committing

## Notes

- Always start posts as `draft: true`
- The `pubDatetime` must use an Eastern Time offset (e.g., `T12:00:00-05:00` for EST, `-04:00` for EDT). Never use `Z` (UTC midnight) -- the site timezone is `America/New_York` so UTC midnight displays as the previous day
- The `description` field is used for SEO meta tags and social cards -- keep it under 200 characters
- For multi-part posts, add `series: { name: "Series Name", part: 1 }` to frontmatter
- For guide-style posts, consider adding `type: guide` (though AstroPaper v5 doesn't use this field by default)
