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

    // Fall back to basic parsing for other languages
    const structure: ParsedFile = {
      path: "",
      language,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
    };

    try {
      switch (language) {
        case "rust":
          return this.parseRust(content);
        case "java":
          return this.parseJava(content);
        default:
          return this.parseGeneric(content, language);
      }
    } catch (error) {
      console.error(`Error parsing ${language} file:`, error);
      return structure;
    }
  }


  private parseRust(content: string): ParsedFile {
    const structure: ParsedFile = {
      path: "",
      language: "rust",
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
    };

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.match(/^use\s+/)) {
        const useMatch = trimmed.match(/use\s+([^;]+)/);
        if (useMatch) {
          const importPath = useMatch[1].trim();
          structure.imports.push({
            source: importPath,
            line: i + 1,
            type: "use",
          });
          structure.dependencies.push(importPath.split("::")[0]);
        }
      }

      if (trimmed.match(/^(?:pub\s+)?fn\s+/)) {
        const funcMatch = trimmed.match(/fn\s+(\w+)/);
        if (funcMatch) {
          structure.functions.push({
            name: funcMatch[1],
            startLine: i + 1,
            endLine: -1,
            async: trimmed.includes("async"),
            params: [],
            content: trimmed,
            calls: [],
            references: [],
          });
        }
      }

      if (trimmed.match(/^(?:pub\s+)?struct\s+/)) {
        const structMatch = trimmed.match(/struct\s+(\w+)/);
        if (structMatch) {
          structure.classes.push({
            name: structMatch[1],
            startLine: i + 1,
            endLine: -1,
            methods: [],
            properties: [],
            content: trimmed,
          });
        }
      }

      if (trimmed.match(/^impl\s+/)) {
        const implMatch = trimmed.match(/impl\s+(?:<[^>]+>\s+)?(\w+)/);
        if (implMatch) {
          const existingStruct = structure.classes.find(
            (c) => c.name === implMatch[1]
          );
          if (!existingStruct) {
            structure.classes.push({
              name: implMatch[1],
              startLine: i + 1,
              endLine: -1,
              methods: [],
              properties: [],
              content: trimmed,
            });
          }
        }
      }
    }

    return structure;
  }

  private parseJava(content: string): ParsedFile {
    const structure: ParsedFile = {
      path: "",
      language: "java",
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
    };

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.match(/^import\s+/)) {
        const importMatch = trimmed.match(/import\s+([^;]+)/);
        if (importMatch) {
          const importPath = importMatch[1].trim();
          structure.imports.push({
            source: importPath,
            line: i + 1,
            type: "import",
          });
          structure.dependencies.push(importPath.split(".")[0]);
        }
      }

      if (trimmed.match(/^(?:public\s+)?class\s+/)) {
        const classMatch = trimmed.match(/class\s+(\w+)/);
        if (classMatch) {
          structure.classes.push({
            name: classMatch[1],
            startLine: i + 1,
            endLine: -1,
            methods: [],
            properties: [],
            content: trimmed,
          });
        }
      }

      const methodMatch = trimmed.match(
        /^(?:public|private|protected)?\s*(?:static)?\s*(?:\w+)\s+(\w+)\s*\(/
      );
      if (methodMatch && !trimmed.includes("class")) {
        structure.functions.push({
          name: methodMatch[1],
          startLine: i + 1,
          endLine: -1,
          async: false,
          params: [],
          content: trimmed,
          calls: [],
          references: [],
        });
      }
    }

    return structure;
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