/**
 * Shared utility for parsing content with code blocks.
 * Used by both message rendering and markdown syntax highlighting.
 */

export interface ContentPart {
  type: 'text' | 'codeblock';
  content: string;
  language?: string;
}

/**
 * Regex pattern for matching fenced code blocks.
 * Captures: full match, language identifier, code content
 */
export const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;

/**
 * Splits text into alternating text and code block parts.
 * Preserves order and handles edge cases (no code blocks, consecutive blocks, etc.)
 */
export function splitByCodeBlocks(text: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const regex = new RegExp(CODE_BLOCK_REGEX.source, 'g'); // Fresh regex instance
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this code block (if any)
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    // Add the code block
    parts.push({
      type: 'codeblock',
      language: match[1] || 'text',
      content: match[2].replace(/\n$/, ''), // Remove trailing newline
    });

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text after the last code block
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return parts;
}

/**
 * Check if a cursor position is inside a code block.
 * Useful for input handling (different keybinds inside vs outside code blocks).
 */
export function isCursorInCodeBlock(text: string, cursorPosition: number): boolean {
  const textBeforeCursor = text.slice(0, cursorPosition);

  // Count opening ``` markers before cursor
  // If odd number, we're inside a code block
  const openings = (textBeforeCursor.match(/```/g) || []).length;

  return openings % 2 === 1;
}
