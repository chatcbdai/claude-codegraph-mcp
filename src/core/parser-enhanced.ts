import { ParsedFile } from "./indexer.js";

export class EnhancedCodeParser {
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
    const functionCalls = new Set<string>();
    const references = new Set<string>();
    let currentClass: any = null;
    let braceDepth = 0;
    let classDepth = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Parse imports (ES6 and CommonJS)
      if (trimmed.match(/^import\s+/)) {
        // ES6 imports
        const importMatch = trimmed.match(/import\s+(?:(\*\s+as\s+\w+)|({[^}]+})|(\w+))?\s*(?:,\s*({[^}]+}))?\s*from\s+['"](.+?)['"]/);
        if (importMatch) {
          const source = importMatch[5];
          structure.imports.push({
            source,
            line: i + 1,
            type: "import",
          });
          structure.dependencies.push(source);
        }
      } else if (trimmed.match(/^const\s+\w+\s*=\s*require\s*\(/)) {
        // CommonJS require
        const requireMatch = trimmed.match(/require\s*\(\s*['"](.+?)['"]\s*\)/);
        if (requireMatch) {
          structure.imports.push({
            source: requireMatch[1],
            line: i + 1,
            type: "require",
          });
          structure.dependencies.push(requireMatch[1]);
        }
      }

      // Parse exports (ES6 and CommonJS)
      if (trimmed.match(/^export\s+/)) {
        // ES6 exports
        const exportMatch = trimmed.match(/export\s+(?:default\s+)?(?:(const|let|var|function|class|interface|type|enum)\s+)?(\w+)?/);
        if (exportMatch && exportMatch[2]) {
          structure.exports.push({
            name: exportMatch[2],
            line: i + 1,
            type: exportMatch[1] || "default",
          });
        }
      } else if (trimmed.match(/^module\.exports\s*=/)) {
        // CommonJS exports
        const exportsMatch = trimmed.match(/module\.exports\s*=\s*{([^}]+)}/) || 
                            trimmed.match(/module\.exports\s*=\s*(\w+)/);
        if (exportsMatch) {
          if (exportsMatch[1].includes(',')) {
            // Multiple exports
            const names = exportsMatch[1].split(',').map(n => n.trim().split(':')[0].trim());
            names.forEach(name => {
              structure.exports.push({
                name,
                line: i + 1,
                type: "commonjs",
              });
            });
          } else {
            structure.exports.push({
              name: exportsMatch[1].trim(),
              line: i + 1,
              type: "commonjs",
            });
          }
        }
      }

      // Update brace depth before parsing
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      // Parse classes first
      const classMatch = trimmed.match(/(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/);
      if (classMatch) {
        currentClass = {
          name: classMatch[1],
          extends: classMatch[2] || undefined,
          startLine: i + 1,
          endLine: i + 1,
          methods: [],
          properties: [],
        };
        classDepth = braceDepth - openBraces; // Depth before the opening brace
        structure.classes.push(currentClass);
      }

      // Check if we're exiting a class
      if (currentClass && braceDepth <= classDepth) {
        currentClass.endLine = i + 1;
        currentClass = null;
        classDepth = -1;
      }

      // Parse functions - but only if not inside a class
      if (!currentClass) {
        const functionPatterns = [
          /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/,
          /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\([^)]*\)/,
          /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/,
        ];

        for (const pattern of functionPatterns) {
          const match = trimmed.match(pattern);
          if (match && match[1]) {
            const funcName = match[1];
            const isAsync = line.includes('async');
            
            // Extract parameters
            const paramsMatch = line.match(/\(([^)]*)\)/);
            const params = paramsMatch ? paramsMatch[1].split(',').map(p => p.trim().split(/[:\s=]/)[0]).filter(p => p) : [];
            
            structure.functions.push({
              name: funcName,
              startLine: i + 1,
              endLine: i + 1,
              async: isAsync,
              params,
              calls: [],
              references: [],
              content: line,
            });
            break; // Only match one pattern per line
          }
        }
      } else {
        // Inside a class - check for methods
        const methodMatch = trimmed.match(/^(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/);
        if (methodMatch && methodMatch[1] !== 'constructor') {
          currentClass.methods.push(methodMatch[1]);
        }
      }

      // Extract function calls (track per function, not globally)
      if (structure.functions.length > 0 && !currentClass) {
        // Find which function we're currently in based on line number
        let currentFunc = null;
        for (let j = structure.functions.length - 1; j >= 0; j--) {
          const func = structure.functions[j];
          if (i >= func.startLine - 1) {
            currentFunc = func;
            break;
          }
        }
        
        if (currentFunc) {
          const callMatches = line.matchAll(/(\w+)\s*\(/g);
          for (const match of callMatches) {
            const funcName = match[1];
            // Filter out keywords and declarations
            if (!['function', 'if', 'for', 'while', 'switch', 'catch', 'async', 'await', 'return', 'typeof', 'instanceof'].includes(funcName)) {
              if (!currentFunc.calls) currentFunc.calls = [];
              if (!currentFunc.calls.includes(funcName)) {
                currentFunc.calls.push(funcName);
              }
            }
          }
        }
      } else {
        // Still collect global function calls for later
        const callMatches = line.matchAll(/(\w+)\s*\(/g);
        for (const match of callMatches) {
          const funcName = match[1];
          if (!['function', 'if', 'for', 'while', 'switch', 'catch', 'async', 'await'].includes(funcName)) {
            functionCalls.add(funcName);
          }
        }
      }

      // Extract variable references
      const refMatches = line.matchAll(/\b(\w+)\b/g);
      for (const match of refMatches) {
        const ref = match[1];
        // Filter out keywords
        if (ref.length > 1 && !['const', 'let', 'var', 'function', 'class', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'throw', 'try', 'catch', 'finally', 'new', 'this', 'super', 'import', 'export', 'from', 'as', 'async', 'await', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'].includes(ref)) {
          references.add(ref);
        }
      }
    }

    // Add any remaining global calls to functions that don't have calls yet
    const callsArray = Array.from(functionCalls);
    const refsArray = Array.from(references);
    for (const func of structure.functions) {
      if (!func.calls || func.calls.length === 0) {
        func.calls = callsArray;
      }
      func.references = refsArray;
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
      typeAliases: [],
      constants: [],
    };

    const lines = content.split("\n");
    let currentIndent = 0;
    let currentClass: any = null;
    let inFunction = false;
    let functionIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indent = line.length - line.trimStart().length;
      const trimmed = line.trim();

      // Parse imports
      if (trimmed.startsWith("import ")) {
        const importMatch = trimmed.match(/import\s+(.+?)(?:\s+as\s+\w+)?$/);
        if (importMatch) {
          structure.imports.push({
            source: importMatch[1],
            line: i + 1,
            type: "import",
          });
          structure.dependencies.push(importMatch[1]);
        }
      } else if (trimmed.startsWith("from ")) {
        const fromMatch = trimmed.match(/from\s+(.+?)\s+import\s+(.+)/);
        if (fromMatch) {
          structure.imports.push({
            source: fromMatch[1],
            line: i + 1,
            type: "from_import",
          });
          structure.dependencies.push(fromMatch[1]);
        }
      }

      // Parse type aliases (e.g., HTMLContent = str, UserDict = Dict[str, Any])
      if (!currentClass && indent === 0) {
        // Type alias pattern: CapitalizedName = Type
        const typeAliasMatch = trimmed.match(/^([A-Z]\w*)\s*=\s*(?:type\s+)?(.+)$/);
        if (typeAliasMatch && !trimmed.includes('(') && !trimmed.includes('def')) {
          const typeName = typeAliasMatch[1];
          const typeValue = typeAliasMatch[2];
          
          // Check if it looks like a type (common patterns)
          const isType = typeValue.match(/^(str|int|float|bool|list|dict|tuple|set|List|Dict|Tuple|Set|Union|Optional|Any|TypeVar|Protocol|Literal|Final|ClassVar|Callable|\w+\[.+\]|'[^']+')/) ||
                        typeValue.includes('[') || typeValue.includes('Union') || typeValue.includes('Optional');
          
          if (isType) {
            structure.typeAliases?.push({
              name: typeName,
              value: typeValue,
              line: i + 1,
            });
          }
        }
        
        // TypeVar pattern: T = TypeVar('T', ...)
        const typeVarMatch = trimmed.match(/^(\w+)\s*=\s*TypeVar\s*\(/);
        if (typeVarMatch) {
          structure.typeAliases?.push({
            name: typeVarMatch[1],
            value: trimmed,
            line: i + 1,
            isTypeVar: true,
          });
        }
        
        // Constants pattern: CONSTANT_NAME = value
        const constantMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
        if (constantMatch && !trimmed.includes('TypeVar') && !trimmed.includes('(')) {
          structure.constants?.push({
            name: constantMatch[1],
            value: constantMatch[2],
            line: i + 1,
          });
        }
      }

      // Parse @overload decorator
      if (trimmed === '@overload' || trimmed.startsWith('@typing.overload')) {
        // Mark that the next function is an overload
        const nextNonEmptyLine = this.findNextNonEmptyLine(lines, i + 1);
        if (nextNonEmptyLine !== -1) {
          const nextLine = lines[nextNonEmptyLine].trim();
          const overloadMatch = nextLine.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
          if (overloadMatch) {
            structure.functions.push({
              name: overloadMatch[1],
              startLine: nextNonEmptyLine + 1,
              endLine: nextNonEmptyLine + 1,
              async: nextLine.startsWith('async'),
              params: overloadMatch[2].split(',').map(p => p.trim().split(/[:\s=]/)[0]).filter(p => p && p !== 'self'),
              calls: [],
              references: [],
              content: nextLine,
              isOverload: true,
            });
          }
        }
      }

      // Parse function definitions
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
      if (funcMatch && !trimmed.startsWith('@')) {
        const params = funcMatch[2].split(',').map(p => p.trim().split(/[:\s=]/)[0]).filter(p => p && p !== 'self');
        const isAsync = trimmed.startsWith('async');
        
        inFunction = true;
        functionIndent = indent;
        
        const func = {
          name: funcMatch[1],
          startLine: i + 1,
          endLine: i + 1,
          async: isAsync,
          params,
          calls: [],
          references: [],
          content: line,
        };

        if (currentClass && indent > currentIndent) {
          // This is a method
          currentClass.methods.push(func.name);
        } else {
          structure.functions.push(func);
        }
      }

      // Parse class definitions
      const classMatch = trimmed.match(/^class\s+(\w+)(?:\(([^)]*)\))?/);
      if (classMatch) {
        const baseClasses = classMatch[2] || '';
        const isProtocol = baseClasses.includes('Protocol');
        
        currentClass = {
          name: classMatch[1],
          extends: classMatch[2] || undefined,
          startLine: i + 1,
          endLine: i + 1,
          methods: [],
          properties: [],
          isProtocol: isProtocol,
        };
        currentIndent = indent;
        structure.classes.push(currentClass);
      }

      // Reset current class if we're back at top level
      if (indent === 0 && !trimmed.startsWith('class')) {
        currentClass = null;
      }
      
      // Check if we're exiting a function
      if (inFunction && indent <= functionIndent) {
        inFunction = false;
        functionIndent = -1;
      }
    }

    return structure;
  }
  
  private findNextNonEmptyLine(lines: string[], startIndex: number): number {
    for (let i = startIndex; i < lines.length; i++) {
      if (lines[i].trim()) {
        return i;
      }
    }
    return -1;
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

      // Parse imports
      if (trimmed === "import (") {
        inImportBlock = true;
      } else if (inImportBlock) {
        if (trimmed === ")") {
          inImportBlock = false;
        } else if (trimmed) {
          const importMatch = trimmed.match(/^"([^"]+)"/);
          if (importMatch) {
            structure.imports.push({
              source: importMatch[1],
              line: i + 1,
              type: "import",
            });
            structure.dependencies.push(importMatch[1]);
          }
        }
      } else if (trimmed.startsWith("import ")) {
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

      // Parse function definitions
      const funcMatch = trimmed.match(/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        const params = funcMatch[2].split(',').map(p => p.trim().split(/\s+/)[0]).filter(p => p);
        
        structure.functions.push({
          name: funcMatch[1],
          startLine: i + 1,
          endLine: i + 1,
          async: false,
          params,
          calls: [],
          references: [],
          content: line,
        });
      }

      // Parse type definitions (structs in Go are like classes)
      const typeMatch = trimmed.match(/^type\s+(\w+)\s+struct/);
      if (typeMatch) {
        structure.classes.push({
          name: typeMatch[1],
          startLine: i + 1,
          endLine: i + 1,
          methods: [],
          properties: [],
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
    
    // Generic pattern matching for common constructs
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Look for function-like patterns
      if (trimmed.match(/function|def|func|fn|proc|sub/) && trimmed.match(/\w+\s*\(/)) {
        const match = trimmed.match(/(\w+)\s*\(/);
        if (match) {
          structure.functions.push({
            name: match[1],
            startLine: i + 1,
            endLine: i + 1,
            async: false,
            params: [],
            calls: [],
            references: [],
            content: line,
          });
        }
      }

      // Look for class-like patterns
      if (trimmed.match(/class|struct|interface|trait/) && trimmed.match(/\w+/)) {
        const match = trimmed.match(/(class|struct|interface|trait)\s+(\w+)/);
        if (match) {
          structure.classes.push({
            name: match[2],
            startLine: i + 1,
            endLine: i + 1,
            methods: [],
            properties: [],
          });
        }
      }
    }

    return structure;
  }

}