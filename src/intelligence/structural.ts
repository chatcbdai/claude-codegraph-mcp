import { ParsedFile } from "../core/indexer.js";
import { Logger } from "../utils/logger.js";

export interface Relationship {
  from: string;
  to: string;
  type: string;
  details: any;
}

export interface Module {
  name: string;
  path: string;
  exports: string[];
  imports: string[];
  classes: string[];
  functions: string[];
}

export interface Layer {
  name: string;
  components: string[];
  dependencies: string[];
}

export interface Pattern {
  pattern: string;
  locations: string[];
  confidence: number;
}

export class StructuralAnalyzer {
  private logger: Logger;
  private exportMap: Map<string, any> = new Map();
  private moduleMap: Map<string, Module> = new Map();

  constructor() {
    this.logger = new Logger("StructuralAnalyzer");
  }

  async analyzeRelationships(parsedFiles: ParsedFile[]): Promise<Relationship[]> {
    const relationships: Relationship[] = [];

    // Build export map first
    this.exportMap = this.buildExportMap(parsedFiles);

    for (const file of parsedFiles) {
      // Analyze imports
      for (const imp of file.imports) {
        const resolved = this.resolveImport(imp, this.exportMap);
        if (resolved) {
          relationships.push({
            from: file.path,
            to: resolved.file,
            type: "IMPORTS",
            details: { symbol: imp.source },
          });
        }
      }

      // Analyze function calls
      for (const func of file.functions) {
        for (const call of func.calls || []) {
          const target = this.resolveCall(call, this.exportMap);
          if (target) {
            relationships.push({
              from: `${file.path}:${func.name}`,
              to: target.id,
              type: "CALLS",
              details: { arguments: call.arguments },
            });
          }
        }
      }

      // Analyze class inheritance
      for (const cls of file.classes) {
        if (cls.extends) {
          const parent = this.resolveClass(cls.extends, this.exportMap);
          if (parent) {
            relationships.push({
              from: `${file.path}:${cls.name}`,
              to: parent.id,
              type: "EXTENDS",
              details: {},
            });
          }
        }

        if (cls.implements) {
          for (const iface of cls.implements) {
            const resolved = this.resolveClass(iface, this.exportMap);
            if (resolved) {
              relationships.push({
                from: `${file.path}:${cls.name}`,
                to: resolved.id,
                type: "IMPLEMENTS",
                details: {},
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  buildExportMap(parsedFiles: ParsedFile[]): Map<string, any> {
    const exportMap = new Map<string, any>();

    for (const file of parsedFiles) {
      const fileExports: any = {
        file: file.path,
        exports: [],
        default: null,
      };

      for (const exp of file.exports) {
        if (exp.name === "default") {
          fileExports.default = exp;
        } else {
          fileExports.exports.push(exp);
        }
      }

      exportMap.set(file.path, fileExports);

      // Also map by module name for import resolution
      const moduleName = this.getModuleName(file.path);
      exportMap.set(moduleName, fileExports);
    }

    return exportMap;
  }

  async getModules(parsedFiles: ParsedFile[]): Promise<Module[]> {
    const modules: Module[] = [];

    for (const file of parsedFiles) {
      const moduleName = this.getModuleName(file.path);
      
      if (!this.moduleMap.has(moduleName)) {
        this.moduleMap.set(moduleName, {
          name: moduleName,
          path: file.path,
          exports: [],
          imports: [],
          classes: [],
          functions: [],
        });
      }

      const module = this.moduleMap.get(moduleName)!;
      
      module.exports.push(...file.exports.map(e => e.name));
      module.imports.push(...file.imports.map(i => i.source));
      module.classes.push(...file.classes.map(c => c.name));
      module.functions.push(...file.functions.map(f => f.name));
    }

    return Array.from(this.moduleMap.values());
  }

  async detectLayers(parsedFiles: ParsedFile[]): Promise<Layer[]> {
    const layers: Layer[] = [];
    const layerPatterns = {
      presentation: /\/(views?|components?|pages?|ui|frontend)\//i,
      business: /\/(services?|handlers?|controllers?|business|logic)\//i,
      data: /\/(models?|repositories?|dao|database|storage)\//i,
      infrastructure: /\/(config|utils?|helpers?|lib|common)\//i,
    };

    for (const [layerName, pattern] of Object.entries(layerPatterns)) {
      const layer: Layer = {
        name: layerName,
        components: [],
        dependencies: [],
      };

      for (const file of parsedFiles) {
        if (pattern.test(file.path)) {
          layer.components.push(file.path);
          
          // Track dependencies
          for (const imp of file.imports) {
            if (!layer.dependencies.includes(imp.source)) {
              layer.dependencies.push(imp.source);
            }
          }
        }
      }

      if (layer.components.length > 0) {
        layers.push(layer);
      }
    }

    return layers;
  }

  async detectPatterns(parsedFiles: ParsedFile[]): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Detect MVC pattern
    const mvcPattern = this.detectMVCPattern(parsedFiles);
    if (mvcPattern.confidence > 0.5) {
      patterns.push(mvcPattern);
    }

    // Detect Repository pattern
    const repoPattern = this.detectRepositoryPattern(parsedFiles);
    if (repoPattern.confidence > 0.5) {
      patterns.push(repoPattern);
    }

    // Detect Factory pattern
    const factoryPattern = this.detectFactoryPattern(parsedFiles);
    if (factoryPattern.confidence > 0.5) {
      patterns.push(factoryPattern);
    }

    // Detect Singleton pattern
    const singletonPattern = this.detectSingletonPattern(parsedFiles);
    if (singletonPattern.confidence > 0.5) {
      patterns.push(singletonPattern);
    }

    return patterns;
  }

  async findDefinition(name: string, parsedFiles: ParsedFile[]): Promise<any> {
    for (const file of parsedFiles) {
      // Check functions
      const func = file.functions.find(f => f.name === name);
      if (func) {
        return {
          type: "function",
          name: func.name,
          file: file.path,
          line: func.startLine,
          content: func.content,
        };
      }

      // Check classes
      const cls = file.classes.find(c => c.name === name);
      if (cls) {
        return {
          type: "class",
          name: cls.name,
          file: file.path,
          line: cls.startLine,
          content: cls.content,
        };
      }

      // Check exports
      const exp = file.exports.find(e => e.name === name);
      if (exp) {
        return {
          type: "export",
          name: exp.name,
          file: file.path,
          line: exp.line,
        };
      }
    }

    return null;
  }

  private resolveImport(imp: any, exportMap: Map<string, any>): any {
    const source = imp.source;
    
    // Check direct path
    if (exportMap.has(source)) {
      return exportMap.get(source);
    }

    // Check module name
    const moduleName = this.getModuleName(source);
    if (exportMap.has(moduleName)) {
      return exportMap.get(moduleName);
    }

    return null;
  }

  private resolveCall(call: any, exportMap: Map<string, any>): any {
    // Simple resolution - would need more sophisticated analysis in production
    for (const [_, exports] of exportMap) {
      const found = exports.exports?.find((e: any) => e.name === call.name);
      if (found) {
        return {
          id: `${exports.file}:${found.name}`,
          file: exports.file,
          name: found.name,
        };
      }
    }
    return null;
  }

  private resolveClass(className: string, exportMap: Map<string, any>): any {
    for (const [_, exports] of exportMap) {
      const found = exports.exports?.find((e: any) => e.name === className);
      if (found) {
        return {
          id: `${exports.file}:${found.name}`,
          file: exports.file,
          name: found.name,
        };
      }
    }
    return null;
  }

  private getModuleName(filePath: string): string {
    // Extract module name from file path
    const parts = filePath.split("/");
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(ts|js|tsx|jsx)$/, "");
  }

  private detectMVCPattern(parsedFiles: ParsedFile[]): Pattern {
    const locations: string[] = [];
    let confidence = 0;

    const hasModels = parsedFiles.some(f => f.path.includes("model"));
    const hasViews = parsedFiles.some(f => f.path.includes("view"));
    const hasControllers = parsedFiles.some(f => f.path.includes("controller"));

    if (hasModels) {
      locations.push("models/");
      confidence += 0.33;
    }
    if (hasViews) {
      locations.push("views/");
      confidence += 0.33;
    }
    if (hasControllers) {
      locations.push("controllers/");
      confidence += 0.34;
    }

    return {
      pattern: "MVC",
      locations,
      confidence,
    };
  }

  private detectRepositoryPattern(parsedFiles: ParsedFile[]): Pattern {
    const locations: string[] = [];
    let confidence = 0;

    for (const file of parsedFiles) {
      if (file.path.includes("repository") || file.path.includes("repo")) {
        locations.push(file.path);
        confidence = Math.min(1, confidence + 0.2);
      }

      // Check for repository-like classes
      for (const cls of file.classes) {
        if (cls.name.includes("Repository") || cls.name.includes("Repo")) {
          locations.push(`${file.path}:${cls.name}`);
          confidence = Math.min(1, confidence + 0.3);
        }
      }
    }

    return {
      pattern: "Repository",
      locations,
      confidence,
    };
  }

  private detectFactoryPattern(parsedFiles: ParsedFile[]): Pattern {
    const locations: string[] = [];
    let confidence = 0;

    for (const file of parsedFiles) {
      // Check for factory functions/classes
      for (const func of file.functions) {
        if (func.name.includes("create") || func.name.includes("factory")) {
          locations.push(`${file.path}:${func.name}`);
          confidence = Math.min(1, confidence + 0.2);
        }
      }

      for (const cls of file.classes) {
        if (cls.name.includes("Factory")) {
          locations.push(`${file.path}:${cls.name}`);
          confidence = Math.min(1, confidence + 0.3);
        }
      }
    }

    return {
      pattern: "Factory",
      locations,
      confidence,
    };
  }

  private detectSingletonPattern(parsedFiles: ParsedFile[]): Pattern {
    const locations: string[] = [];
    let confidence = 0;

    for (const file of parsedFiles) {
      const content = file.functions.map(f => f.content).join("\n") +
                     file.classes.map(c => c.content).join("\n");

      // Look for singleton patterns
      if (content.includes("getInstance") || content.includes("_instance")) {
        locations.push(file.path);
        confidence = Math.min(1, confidence + 0.5);
      }
    }

    return {
      pattern: "Singleton",
      locations,
      confidence,
    };
  }
}