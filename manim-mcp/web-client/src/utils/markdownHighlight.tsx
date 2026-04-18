import React from 'react';

// Extended types to include code token types for syntax highlighting within code blocks
type CodeTokenType = 'code-keyword' | 'code-string' | 'code-comment' | 'code-number' | 'code-function' | 'code-punctuation' | 'code-plain';

interface HighlightSegment {
  text: string;
  type: 'plain' | 'bold-marker' | 'bold-text' | 'italic-marker' | 'italic-text' | 'code-marker' | 'code-text' | 'heading-marker' | 'heading-text' | 'link-marker' | 'link-text' | 'link-url' | 'codeblock-marker' | 'codeblock-language' | 'codeblock-content' | 'quote-marker' | 'quote-text' | 'double-quote-marker' | 'double-quote-text' | 'emoticon' | CodeTokenType;
}

/**
 * Lightweight code tokenizer for real-time syntax highlighting in the input.
 * Only changes colors (not fonts) to maintain cursor alignment.
 */
function tokenizeCode(code: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let remaining = code;

  // Common keywords across languages
  const keywords = /^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|yield|static|get|set|typeof|instanceof|in|of|true|false|null|undefined|this|super|void|delete|interface|type|enum|implements|public|private|protected|readonly|abstract|namespace|module|declare|as|is|keyof|infer|never|unknown|any|string|number|boolean|object|symbol|bigint|def|self|None|True|False|and|or|not|lambda|with|pass|raise|except|finally|elif|print|int|float|str|list|dict|tuple|set|bool)\b/;

  // Token patterns (order matters - more specific first)
  const tokenPatterns: Array<{ regex: RegExp; type: CodeTokenType }> = [
    // Comments
    { regex: /^\/\/[^\n]*/, type: 'code-comment' },
    { regex: /^\/\*[\s\S]*?\*\//, type: 'code-comment' },
    { regex: /^#[^\n]*/, type: 'code-comment' },

    // Strings
    { regex: /^"(?:[^"\\]|\\.)*"/, type: 'code-string' },
    { regex: /^'(?:[^'\\]|\\.)*'/, type: 'code-string' },
    { regex: /^`(?:[^`\\]|\\.)*`/, type: 'code-string' },

    // Numbers
    { regex: /^0x[0-9a-fA-F]+/, type: 'code-number' },
    { regex: /^0b[01]+/, type: 'code-number' },
    { regex: /^\d+\.?\d*(?:[eE][+-]?\d+)?/, type: 'code-number' },

    // Function calls (word followed by parenthesis)
    { regex: /^[a-zA-Z_]\w*(?=\s*\()/, type: 'code-function' },

    // Keywords
    { regex: keywords, type: 'code-keyword' },

    // Punctuation
    { regex: /^[{}[\]().,;:?!<>=+\-*/%&|^~@#$\\]+/, type: 'code-punctuation' },
  ];

  while (remaining.length > 0) {
    let matched = false;

    for (const { regex, type } of tokenPatterns) {
      const match = remaining.match(regex);
      if (match && match.index === 0) {
        segments.push({ text: match[0], type });
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Consume identifier or single character as plain code
      const identifierMatch = remaining.match(/^[a-zA-Z_]\w*/);
      if (identifierMatch) {
        segments.push({ text: identifierMatch[0], type: 'code-plain' });
        remaining = remaining.slice(identifierMatch[0].length);
      } else {
        // Single character (whitespace, etc.)
        segments.push({ text: remaining[0], type: 'code-plain' });
        remaining = remaining.slice(1);
      }
    }
  }

  return segments;
}

/**
 * Parses markdown text and returns segments with their types for syntax highlighting.
 * This is for highlighting the SOURCE markdown syntax, not rendering the final output.
 */
export function parseMarkdownSyntax(text: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let remaining = text;

  // Patterns ordered by precedence (longer/more specific first)
  const patterns: Array<{
    regex: RegExp;
    getSegments: (match: RegExpMatchArray) => HighlightSegment[];
  }> = [
    // Fenced code block: ```language\ncode\n``` (must come before inline code)
    {
      regex: /^(```)([^\n]*\n)([\s\S]*?)(```)/,
      getSegments: (match) => {
        const segments: HighlightSegment[] = [
          { text: match[1], type: 'codeblock-marker' },
        ];
        // Only add language segment if there's content before the newline
        const langPart = match[2];
        if (langPart.length > 1) {
          // Has language identifier
          segments.push({ text: langPart.slice(0, -1), type: 'codeblock-language' });
          segments.push({ text: '\n', type: 'code-plain' });
        } else {
          // Just newline, no language
          segments.push({ text: langPart, type: 'code-plain' });
        }
        // Tokenize the code content for syntax highlighting
        const codeTokens = tokenizeCode(match[3]);
        segments.push(...codeTokens);
        segments.push({ text: match[4], type: 'codeblock-marker' });
        return segments;
      },
    },
    // Bold: **text** or __text__
    {
      regex: /^(\*\*|__)(.+?)(\1)/,
      getSegments: (match) => [
        { text: match[1], type: 'bold-marker' },
        { text: match[2], type: 'bold-text' },
        { text: match[3], type: 'bold-marker' },
      ],
    },
    // Italic: *text* or _text_ (but not ** or __)
    {
      regex: /^(\*|_)(?!\1)(.+?)(\1)(?!\1)/,
      getSegments: (match) => [
        { text: match[1], type: 'italic-marker' },
        { text: match[2], type: 'italic-text' },
        { text: match[3], type: 'italic-marker' },
      ],
    },
    // Inline code: `code` (single line only - excludes newlines to not match code blocks)
    {
      regex: /^(`+)([^`\n]+)(\1)/,
      getSegments: (match) => [
        { text: match[1], type: 'code-marker' },
        { text: match[2], type: 'code-text' },
        { text: match[3], type: 'code-marker' },
      ],
    },
    // Heading at start of line: # Heading
    {
      regex: /^(#{1,6}\s)(.*)$/m,
      getSegments: (match) => [
        { text: match[1], type: 'heading-marker' },
        { text: match[2], type: 'heading-text' },
      ],
    },
    // Links: [text](url)
    {
      regex: /^(\[)([^\]]+)(\]\()([^)]+)(\))/,
      getSegments: (match) => [
        { text: match[1], type: 'link-marker' },
        { text: match[2], type: 'link-text' },
        { text: match[3], type: 'link-marker' },
        { text: match[4], type: 'link-url' },
        { text: match[5], type: 'link-marker' },
      ],
    },
    // Single quoted text: 'text' (for quote IDs, identifiers, etc.)
    {
      regex: /^(')([^'\n]+)(')/,
      getSegments: (match) => [
        { text: match[1], type: 'quote-marker' },
        { text: match[2], type: 'quote-text' },
        { text: match[3], type: 'quote-marker' },
      ],
    },
    // Double quoted text: "text" (for strings, identifiers, etc.)
    {
      regex: /^(")([^"\n]+)(")/,
      getSegments: (match) => [
        { text: match[1], type: 'double-quote-marker' },
        { text: match[2], type: 'double-quote-text' },
        { text: match[3], type: 'double-quote-marker' },
      ],
    },
    // ASCII emoticons :) :D xD ^_^ <3 etc.
    {
      regex: /^(:['\-]?[)D(PpOo\/\\3><|]|;['\-]?[)DPp]|[xX][DdPp]|[-^>][_.][<^-]|[oO][_.][oO]|<\/?3|[B8]['\-]?[)])/,
      getSegments: (match) => [
        { text: match[1], type: 'emoticon' },
      ],
    },
  ];

  while (remaining.length > 0) {
    let matched = false;

    for (const pattern of patterns) {
      const match = remaining.match(pattern.regex);
      if (match && match.index === 0) {
        segments.push(...pattern.getSegments(match));
        remaining = remaining.slice(match[0].length);

        matched = true;
        break;
      }
    }

    if (!matched) {
      // No pattern matched, consume one character as plain text
      // But try to batch consecutive plain characters
      let plainEnd = 1;
      while (plainEnd < remaining.length) {
        let willMatch = false;
        for (const pattern of patterns) {
          if (pattern.regex.test(remaining.slice(plainEnd))) {
            willMatch = true;
            break;
          }
        }
        if (willMatch) break;
        plainEnd++;
      }

      segments.push({ text: remaining.slice(0, plainEnd), type: 'plain' });
      remaining = remaining.slice(plainEnd);
    }
  }

  return segments;
}

/**
 * Get inline style for each segment type using CSS variables from theme.
 * Using inline styles with CSS variables ensures cursor alignment is preserved
 * (only color changes, no font-family/size/weight changes).
 */
function getSegmentStyle(type: HighlightSegment['type']): React.CSSProperties {
  switch (type) {
    case 'bold-marker':
    case 'italic-marker':
    case 'code-marker':
    case 'heading-marker':
    case 'link-marker':
    case 'codeblock-marker':
      return { color: 'var(--syntax-marker)' };
    case 'bold-text':
      return { color: 'var(--syntax-bold)' };
    case 'italic-text':
      return { color: 'var(--syntax-italic)' };
    case 'code-text':
      return { color: 'var(--syntax-code)' };
    case 'heading-text':
      return { color: 'var(--syntax-heading)' };
    case 'link-text':
      return { color: 'var(--syntax-link)' };
    case 'link-url':
      return { color: 'var(--syntax-link-url)' };
    case 'quote-marker':
      return { color: 'var(--syntax-marker)' };
    case 'quote-text':
      return { color: 'var(--syntax-quote, var(--syntax-code))' };
    case 'double-quote-marker':
      return { color: 'var(--syntax-marker)' };
    case 'double-quote-text':
      return { color: 'var(--syntax-double-quote, var(--syntax-quote, var(--syntax-code)))' };
    case 'emoticon':
      return { color: 'var(--syntax-emoticon, #FBBF24)' };
    case 'codeblock-language':
      return { color: 'var(--syntax-code-block-lang, var(--syntax-link))' };
    case 'codeblock-content':
      return { color: 'var(--syntax-code-block, var(--syntax-code))' };
    // Code token types for syntax highlighting within code blocks
    case 'code-keyword':
      return { color: 'var(--syntax-code-keyword, #C678DD)' }; // Purple
    case 'code-string':
      return { color: 'var(--syntax-code-string, #98C379)' }; // Green
    case 'code-comment':
      return { color: 'var(--syntax-code-comment, #5C6370)' }; // Gray
    case 'code-number':
      return { color: 'var(--syntax-code-number, #D19A66)' }; // Orange
    case 'code-function':
      return { color: 'var(--syntax-code-function, #61AFEF)' }; // Blue
    case 'code-punctuation':
      return { color: 'var(--syntax-code-punctuation, #ABB2BF)' }; // Light gray
    case 'code-plain':
      return { color: 'var(--syntax-code-plain, #E5C07B)' }; // Yellow-ish
    case 'plain':
    default:
      return {};
  }
}

/**
 * Renders markdown text with syntax highlighting.
 * Returns React elements with appropriate styling using theme CSS variables.
 */
export function renderHighlightedMarkdown(text: string): React.ReactNode {
  const segments = parseMarkdownSyntax(text);

  return segments.map((segment, index) => (
    <span key={index} style={getSegmentStyle(segment.type)}>
      {segment.text}
    </span>
  ));
}
