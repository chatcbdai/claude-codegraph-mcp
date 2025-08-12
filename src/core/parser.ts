import { ParsedFile } from "./indexer.js";
import { TreeSitterParser } from "./parser-treesitter.js";
import { EnhancedCodeParser } from "./parser-enhanced.js";

export class CodeParser {
  private treeSitterParser: TreeSitterParser;
  private enhancedParser: EnhancedCodeParser;
  private initialized = false;

  constructor() {
    // Use tree-sitter as primary parser
    this.treeSitterParser = new TreeSitterParser({
      useTreeSitter: true,
      fallbackToRegex: true,
      maxFileSize: 10 * 1024 * 1024
    });
    // Keep enhanced parser as fallback
    this.enhancedParser = new EnhancedCodeParser();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.treeSitterParser.initialize();
    this.initialized = true;
  }

  async parseFile(content: string, language: string): Promise<ParsedFile> {
    // Try tree-sitter first for all supported languages
    const treeSitterLanguages = ["typescript", "javascript", "tsx", "jsx", "python", "go", "rust", "java"];
    const normalizedLang = this.normalizeLanguage(language);
    
    if (treeSitterLanguages.includes(normalizedLang)) {
      try {
        return await this.treeSitterParser.parseFile(content, normalizedLang);
      } catch (error) {
        console.error(`Tree-sitter parse failed, falling back: ${error}`);
        return this.enhancedParser.parseFile(content, language);
      }
    }

    // For unsupported languages, use generic parsing
    return this.parseGeneric(content, language);
  }


  private parseGeneric(content: string, language: string): ParsedFile {
    const structure: ParsedFile = {
      path: "",
      language,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
    };

    const lines = content.split("\n");
    const functionPatterns = [
      /function\s+(\w+)/,
      /def\s+(\w+)/,
      /func\s+(\w+)/,
      /fn\s+(\w+)/,
      /sub\s+(\w+)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      for (const pattern of functionPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          structure.functions.push({
            name: match[1],
            startLine: i + 1,
            endLine: -1,
            async: false,
            params: [],
            content: trimmed,
            calls: [],
            references: [],
          });
          break;
        }
      }
    }

    return structure;
  }

  private normalizeLanguage(language: string): string {
    const langMap: { [key: string]: string } = {
      "js": "javascript",
      "jsx": "javascript",
      "ts": "typescript",
      "tsx": "tsx",
      "py": "python",
      "go": "go",
      "rs": "rust",
      "java": "java"
    };
    return langMap[language] || language;
  }
}