import Parser from "tree-sitter";
import { ParsedFile } from "./indexer.js";

export class CodeParser {
  private parsers: Map<string, Parser> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    this.initialized = true;
  }

  async parseFile(content: string, language: string): Promise<ParsedFile> {
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
        case "typescript":
        case "javascript":
          return this.parseJavaScript(content, language);
        case "python":
          return this.parsePython(content);
        case "go":
          return this.parseGo(content);
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

  private parseJavaScript(content: string, language: string): ParsedFile {
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
    let currentClass: any = null;
    let currentFunction: any = null;
    let braceDepth = 0;
    let functionStart = -1;
    let classStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.match(/^import\s+/)) {
        const importMatch = trimmed.match(/from\s+['"](.+?)['"]/);
        if (importMatch) {
          structure.imports.push({
            source: importMatch[1],
            line: i + 1,
            type: "import",
          });
          structure.dependencies.push(importMatch[1]);
        }
      }

      if (trimmed.match(/^export\s+/)) {
        const exportMatch = trimmed.match(/export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/);
        if (exportMatch) {
          structure.exports.push({
            name: exportMatch[1],
            line: i + 1,
            type: "export",
          });
        }
      }

      if (trimmed.match(/^class\s+\w+/) || trimmed.match(/^export\s+class\s+\w+/)) {
        const classMatch = trimmed.match(/class\s+(\w+)/);
        if (classMatch) {
          currentClass = {
            name: classMatch[1],
            startLine: i + 1,
            endLine: -1,
            methods: [],
            properties: [],
            content: "",
          };
          classStart = i;
        }
      }

      const functionMatch = trimmed.match(
        /(?:(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>)/
      );
      if (functionMatch && !currentClass) {
        const functionName = functionMatch[1] || functionMatch[2];
        currentFunction = {
          name: functionName,
          startLine: i + 1,
          endLine: -1,
          async: trimmed.includes("async"),
          params: [],
          content: "",
          calls: [],
          references: [],
        };
        functionStart = i;
      }

      if (currentClass && trimmed.match(/^\w+\s*\([^)]*\)\s*{/)) {
        const methodMatch = trimmed.match(/^(\w+)\s*\(/);
        if (methodMatch) {
          currentClass.methods.push({
            name: methodMatch[1],
            line: i + 1,
          });
        }
      }

      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      if (braceDepth === 0) {
        if (currentClass && classStart >= 0) {
          currentClass.endLine = i + 1;
          currentClass.content = lines.slice(classStart, i + 1).join("\n");
          structure.classes.push(currentClass);
          currentClass = null;
          classStart = -1;
        }
        if (currentFunction && functionStart >= 0) {
          currentFunction.endLine = i + 1;
          currentFunction.content = lines.slice(functionStart, i + 1).join("\n");
          structure.functions.push(currentFunction);
          currentFunction = null;
          functionStart = -1;
        }
      }
    }

    return structure;
  }

  private parsePython(content: string): ParsedFile {
    const structure: ParsedFile = {
      path: "",
      language: "python",
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
    };

    const lines = content.split("\n");
    let currentClass: any = null;
    let currentFunction: any = null;
    let indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const currentIndent = line.search(/\S|$/);

      if (trimmed.match(/^import\s+/) || trimmed.match(/^from\s+/)) {
        const importMatch = trimmed.match(/(?:from\s+(\S+)\s+)?import\s+(.+)/);
        if (importMatch) {
          const source = importMatch[1] || importMatch[2].split(",")[0].trim();
          structure.imports.push({
            source,
            line: i + 1,
            type: "import",
          });
          structure.dependencies.push(source);
        }
      }

      if (trimmed.match(/^class\s+\w+/)) {
        const classMatch = trimmed.match(/class\s+(\w+)/);
        if (classMatch) {
          currentClass = {
            name: classMatch[1],
            startLine: i + 1,
            endLine: -1,
            methods: [],
            properties: [],
            content: "",
          };
          indentLevel = currentIndent;
        }
      }

      if (trimmed.match(/^def\s+\w+/)) {
        const funcMatch = trimmed.match(/def\s+(\w+)\s*\(/);
        if (funcMatch) {
          const func = {
            name: funcMatch[1],
            startLine: i + 1,
            endLine: -1,
            async: trimmed.includes("async"),
            params: [],
            content: "",
            calls: [],
            references: [],
          };

          if (currentClass && currentIndent > indentLevel) {
            currentClass.methods.push({
              name: func.name,
              line: i + 1,
            });
          } else {
            currentFunction = func;
            structure.functions.push(func);
          }
        }
      }

      if (currentClass && currentIndent <= indentLevel && i > currentClass.startLine) {
        currentClass.endLine = i;
        currentClass.content = lines
          .slice(currentClass.startLine - 1, i)
          .join("\n");
        structure.classes.push(currentClass);
        currentClass = null;
      }
    }

    if (currentClass) {
      currentClass.endLine = lines.length;
      currentClass.content = lines
        .slice(currentClass.startLine - 1)
        .join("\n");
      structure.classes.push(currentClass);
    }

    return structure;
  }

  private parseGo(content: string): ParsedFile {
    const structure: ParsedFile = {
      path: "",
      language: "go",
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
    };

    const lines = content.split("\n");
    let inImportBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === "import (") {
        inImportBlock = true;
        continue;
      }

      if (inImportBlock) {
        if (trimmed === ")") {
          inImportBlock = false;
        } else if (trimmed) {
          const importPath = trimmed.replace(/["']/g, "").trim();
          structure.imports.push({
            source: importPath,
            line: i + 1,
            type: "import",
          });
          structure.dependencies.push(importPath);
        }
      }

      if (trimmed.match(/^import\s+"/)) {
        const importMatch = trimmed.match(/import\s+"([^"]+)"/);
        if (importMatch) {
          structure.imports.push({
            source: importMatch[1],
            line: i + 1,
            type: "import",
          });
          structure.dependencies.push(importMatch[1]);
        }
      }

      if (trimmed.match(/^func\s+/)) {
        const funcMatch = trimmed.match(/func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/);
        if (funcMatch) {
          structure.functions.push({
            name: funcMatch[1],
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

      if (trimmed.match(/^type\s+\w+\s+struct/)) {
        const structMatch = trimmed.match(/type\s+(\w+)\s+struct/);
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
    }

    return structure;
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
}