#!/usr/bin/env node

/**
 * Mermaid diagram syntax validator for blog posts.
 *
 * Scans all Markdown files in src/data/blog/ for fenced ```mermaid code blocks
 * and validates each one using the mermaid library's parse() function.
 *
 * Usage:
 *   node scripts/validate-mermaid.mjs          # Validate all posts
 *   node scripts/validate-mermaid.mjs --quiet  # Only show errors
 *
 * Exit codes:
 *   0 - All diagrams valid (or no diagrams found)
 *   1 - One or more diagrams have syntax errors
 *
 * Requirements:
 *   pnpm add -D mermaid jsdom
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Mermaid requires a DOM environment (DOMPurify, etc.).
// Set up a minimal one via jsdom before importing mermaid.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});
globalThis.DOMParser = dom.window.DOMParser;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.Element = dom.window.Element;

// Now safe to import mermaid
const mermaid = (await import("mermaid")).default;

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const BLOG_DIR = join(__dirname, "..", "src", "data", "blog");

const quiet = process.argv.includes("--quiet");

/**
 * Extract all mermaid code blocks from a markdown string.
 * Returns an array of { code, lineNumber } objects.
 */
function extractMermaidBlocks(content) {
  const blocks = [];
  const lines = content.split("\n");
  let inMermaid = false;
  let blockLines = [];
  let blockStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inMermaid && line.trim() === "```mermaid") {
      inMermaid = true;
      blockStartLine = i + 1; // 1-indexed
      blockLines = [];
    } else if (inMermaid && line.trim() === "```") {
      inMermaid = false;
      blocks.push({
        code: blockLines.join("\n"),
        lineNumber: blockStartLine + 1, // Line after the opening fence
      });
    } else if (inMermaid) {
      blockLines.push(line);
    }
  }

  // Handle unclosed mermaid block
  if (inMermaid) {
    blocks.push({
      code: blockLines.join("\n"),
      lineNumber: blockStartLine + 1,
      unclosed: true,
    });
  }

  return blocks;
}

/**
 * Validate a single mermaid diagram.
 * Returns null if valid, or an error message string if invalid.
 */
async function validateDiagram(code) {
  try {
    await mermaid.parse(code);
    return null;
  } catch (error) {
    return error.message || String(error);
  }
}

async function main() {
  // Find all markdown files
  const files = readdirSync(BLOG_DIR).filter(
    f => f.endsWith(".md") || f.endsWith(".mdx")
  );

  let totalDiagrams = 0;
  let totalErrors = 0;
  const results = [];

  for (const file of files) {
    const filePath = join(BLOG_DIR, file);
    const content = readFileSync(filePath, "utf-8");
    const blocks = extractMermaidBlocks(content);

    if (blocks.length === 0) continue;

    for (const block of blocks) {
      totalDiagrams++;

      if (block.unclosed) {
        totalErrors++;
        results.push({
          file,
          line: block.lineNumber,
          error: "Unclosed mermaid code block (missing closing ```)",
        });
        continue;
      }

      const error = await validateDiagram(block.code);
      if (error) {
        totalErrors++;
        results.push({
          file,
          line: block.lineNumber,
          error,
        });
      }
    }
  }

  // Output results
  if (results.length > 0) {
    console.error("\nMermaid validation errors:\n");
    for (const r of results) {
      const relPath = relative(
        join(__dirname, ".."),
        join(BLOG_DIR, r.file)
      );
      console.error(`  ${relPath}:${r.line}`);
      console.error(`    ${r.error}\n`);
    }
  }

  if (!quiet || totalErrors > 0) {
    console.log(
      `\nMermaid validation: ${totalDiagrams} diagram(s) found, ${totalErrors} error(s)`
    );
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(error => {
  console.error("Mermaid validation script failed:", error);
  process.exit(1);
});
