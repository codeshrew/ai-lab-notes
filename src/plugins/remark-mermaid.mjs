/**
 * Remark plugin that transforms fenced code blocks with language "mermaid"
 * into raw HTML <pre class="mermaid"> elements for client-side rendering.
 *
 * Input markdown:
 *   ```mermaid
 *   graph TD
 *       A --> B
 *   ```
 *
 * Output HTML:
 *   <pre class="mermaid">
 *   graph TD
 *       A --> B
 *   </pre>
 */
import { visit } from "unist-util-visit";

export function remarkMermaid() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mermaid") return;

      // Replace the code node with a raw HTML node
      parent.children[index] = {
        type: "html",
        value: `<pre class="mermaid">${node.value}</pre>`,
      };
    });
  };
}

export default remarkMermaid;
