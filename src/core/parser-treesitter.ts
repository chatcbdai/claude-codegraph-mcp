import Parser from "tree-sitter";
// @ts-ignore - No types available for tree-sitter language modules
import JavaScript from "tree-sitter-javascript";
// @ts-ignore
import TypeScript from "tree-sitter-typescript";
// @ts-ignore
import Python from "tree-sitter-python";
// @ts-ignore
import Go from "tree-sitter-go";
// @ts-ignore
import Rust from "tree-sitter-rust";
// @ts-ignore
import Java from "tree-sitter-java";
import { ParsedFile } from "./indexer.js";

export interface ParserConfig {
  useTreeSitter: boolean;
  fallbackToRegex: boolean;
  maxFileSize: number;
}

export class TreeSitterParser {
  private parsers: Map<string, Parser> = new Map();
  private languageMap: Map<string, any> = new Map();
  private initialized = false;
  private config: ParserConfig;

  constructor(config: ParserConfig = {
    useTreeSitter: true,
    fallbackToRegex: true,
    maxFileSize: 10 * 1024 * 1024 // 10MB
  }) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize tree-sitter parsers for each language
      const languages = [
        { name: "javascript", grammar: JavaScript },
        { name: "typescript", grammar: TypeScript.typescript },
        { name: "tsx", grammar: TypeScript.tsx },
        { name: "python", grammar: Python },
        { name: "go", grammar: Go },
        { name: "rust", grammar: Rust },
        { name: "java", grammar: Java }
      ];

      for (const { name, grammar } of languages) {
        try {
          const parser = new Parser();
          parser.setLanguage(grammar);
          this.parsers.set(name, parser);
          this.languageMap.set(name, grammar);
        } catch (langError: any) {
          console.warn(`[CodeGraph] Failed to initialize ${name} parser: ${langError.message}`);
        }
      }

      // Verify at least one parser works
      if (this.parsers.size === 0) {
        throw new Error("No tree-sitter parsers could be initialized");
      }

      // Try to verify JavaScript parser if available
      const testParser = this.parsers.get("javascript");
      if (testParser) {
        try {
          const tree = testParser.parse("const x = 1;");
          if (!tree || !tree.rootNode) {
            console.warn("[CodeGraph] JavaScript parser verification failed");
          }
        } catch {
          console.warn("[CodeGraph] JavaScript parser test failed");
        }
      }

      this.initialized = true;
      console.error(`[CodeGraph] Tree-sitter initialized with ${this.parsers.size} parsers`);
    } catch (error: any) {
      console.error(`[CodeGraph] Tree-sitter initialization failed: ${error.message}`);
      if (!this.config.fallbackToRegex) {
        throw error;
      }
      this.initialized = true; // Mark as initialized to use fallback
    }
  }

  async parseFile(content: string, language: string): Promise<ParsedFile> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check file size limit
    if (content.length > this.config.maxFileSize) {
      console.warn(`[CodeGraph] File too large for parsing (${content.length} bytes)`);
      return this.createEmptyStructure(language);
    }

    // Map language aliases
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

    const parserLang = langMap[language] || language;
    const parser = this.parsers.get(parserLang);

    if (!parser) {
      console.warn(`[CodeGraph] No tree-sitter parser for ${language}`);
      if (this.config.fallbackToRegex) {
        return this.regexFallback(content, language);
      }
      return this.createEmptyStructure(language);
    }

    try {
      const tree = parser.parse(content);
      return this.extractStructure(tree, content, language);
    } catch (error: any) {
      console.error(`[CodeGraph] Tree-sitter parsing failed: ${error.message}`);
      if (this.config.fallbackToRegex) {
        return this.regexFallback(content, language);
      }
      throw error;
    }
  }

  private extractStructure(tree: Parser.Tree, content: string, language: string): ParsedFile {
    const structure: ParsedFile = {
      path: "",
      language,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
      typeAliases: [],
      constants: []
    };

    const cursor = tree.walk();
    const visitedNodes = new Set<number>();

    // Traverse the AST
    const traverse = (depth: number = 0): void => {
      if (depth > 1000) return; // Prevent infinite recursion
      
      const node = cursor.currentNode as any;
      const nodeId = node.id || node.startIndex;
      
      if (visitedNodes.has(nodeId)) return;
      visitedNodes.add(nodeId);

      switch (node.type) {
        case "function_declaration":
        case "function_expression":
        case "arrow_function":
        case "method_definition":
          this.extractFunction(node, content, structure);
          break;
        
        case "class_declaration":
        case "class_expression":
          this.extractClass(node, content, structure);
          break;
        
        case "import_statement":
        case "import_declaration":
          this.extractImport(node, content, structure);
          break;
        
        case "export_statement":
        case "export_declaration":
          this.extractExport(node, content, structure);
          break;
        
        case "type_alias_declaration":
          this.extractTypeAlias(node, content, structure);
          break;
        
        case "variable_declaration":
        case "lexical_declaration":
          this.extractConstants(node, content, structure);
          break;
      }

      // Traverse children
      if (cursor.gotoFirstChild()) {
        do {
          traverse(depth + 1);
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    traverse();
    return structure;
  }

  private extractFunction(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    const nameNode = (node as any).childForFieldName("name");
    if (!nameNode) return;

    const name = content.substring(nameNode.startIndex, nameNode.endIndex);
    const params = this.extractParameters(node, content);
    const isAsync = content.substring(node.startIndex, nameNode.startIndex).includes("async");
    
    // Extract function calls within the function
    const bodyNode = (node as any).childForFieldName("body");
    const calls = bodyNode ? this.extractFunctionCalls(bodyNode, content) : [];

    structure.functions.push({
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      async: isAsync,
      params,
      calls,
      references: [],
      content: content.substring(node.startIndex, Math.min(node.endIndex, node.startIndex + 500))
    });
  }

  private extractClass(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    const nameNode = (node as any).childForFieldName("name");
    if (!nameNode) return;

    const name = content.substring(nameNode.startIndex, nameNode.endIndex);
    const superclassNode = (node as any).childForFieldName("superclass");
    const extends_ = superclassNode ? 
      content.substring(superclassNode.startIndex, superclassNode.endIndex) : undefined;

    const methods: string[] = [];
    const properties: string[] = [];

    // Extract methods and properties
    const bodyNode = (node as any).childForFieldName("body");
    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (!child) continue;

        if (child.type === "method_definition") {
          const methodName = (child as any).childForFieldName("name");
          if (methodName) {
            methods.push(content.substring(methodName.startIndex, methodName.endIndex));
          }
        } else if (child.type === "field_definition" || child.type === "property_definition") {
          const propName = (child as any).childForFieldName("property");
          if (propName) {
            properties.push(content.substring(propName.startIndex, propName.endIndex));
          }
        }
      }
    }

    structure.classes.push({
      name,
      extends: extends_,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      methods,
      properties,
      content: content.substring(node.startIndex, Math.min(node.endIndex, node.startIndex + 500))
    });
  }

  private extractImport(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    const sourceNode = (node as any).childForFieldName("source");
    if (!sourceNode) return;

    let source = content.substring(sourceNode.startIndex, sourceNode.endIndex);
    // Remove quotes
    source = source.replace(/^['"`]|['"`]$/g, '');

    structure.imports.push({
      source,
      line: node.startPosition.row + 1,
      type: "import"
    });
    
    if (!source.startsWith('.')) {
      // External dependency
      const depName = source.split('/')[0];
      if (!structure.dependencies.includes(depName)) {
        structure.dependencies.push(depName);
      }
    }
  }

  private extractExport(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    // Find what's being exported
    let exportName = "default";
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "identifier") {
        exportName = content.substring(child.startIndex, child.endIndex);
        break;
      }
    }

    structure.exports.push({
      name: exportName,
      line: node.startPosition.row + 1,
      type: node.type.includes("default") ? "default" : "named"
    });
  }

  private extractTypeAlias(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    const nameNode = (node as any).childForFieldName("name");
    const valueNode = (node as any).childForFieldName("value");
    
    if (nameNode && valueNode) {
      structure.typeAliases?.push({
        name: content.substring(nameNode.startIndex, nameNode.endIndex),
        value: content.substring(valueNode.startIndex, valueNode.endIndex),
        line: node.startPosition.row + 1
      });
    }
  }

  private extractConstants(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    // Look for UPPER_CASE constants
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      if (child.type === "variable_declarator") {
        const nameNode = (child as any).childForFieldName("name");
        if (nameNode) {
          const name = content.substring(nameNode.startIndex, nameNode.endIndex);
          if (/^[A-Z_][A-Z0-9_]*$/.test(name)) {
            const valueNode = (child as any).childForFieldName("value");
            structure.constants?.push({
              name,
              value: valueNode ? 
                content.substring(valueNode.startIndex, valueNode.endIndex) : "undefined",
              line: node.startPosition.row + 1
            });
          }
        }
      }
    }
  }

  private extractParameters(node: Parser.SyntaxNode, content: string): string[] {
    const params: string[] = [];
    const paramsNode = (node as any).childForFieldName("parameters");
    
    if (paramsNode) {
      for (let i = 0; i < paramsNode.childCount; i++) {
        const child = paramsNode.child(i);
        if (child && child.type === "identifier") {
          params.push(content.substring(child.startIndex, child.endIndex));
        }
      }
    }
    
    return params;
  }

  private extractFunctionCalls(node: Parser.SyntaxNode, content: string): string[] {
    const calls = new Set<string>();
    
    const findCalls = (n: Parser.SyntaxNode): void => {
      if (n.type === "call_expression") {
        const funcNode = (n as any).childForFieldName("function");
        if (funcNode && funcNode.type === "identifier") {
          calls.add(content.substring(funcNode.startIndex, funcNode.endIndex));
        }
      }
      
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) findCalls(child);
      }
    };
    
    findCalls(node);
    return Array.from(calls);
  }

  private createEmptyStructure(language: string): ParsedFile {
    return {
      path: "",
      language,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
      typeAliases: [],
      constants: []
    };
  }

  private regexFallback(content: string, language: string): ParsedFile {
    console.warn(`[CodeGraph] Using regex fallback for ${language}`);
    // Import the old regex parser as fallback
    const { EnhancedCodeParser } = require("./parser-enhanced.js");
    const fallbackParser = new EnhancedCodeParser();
    return fallbackParser.parseFile(content, language);
  }
}