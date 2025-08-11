import { ParsedFile, CodeChunk } from "../core/indexer.js";
import crypto from "crypto";

export class SmartChunker {
  constructor(
    private maxChunkSize: number = 1500,
    private overlapSize: number = 200
  ) {}

  chunkCode(parsedFile: ParsedFile, content: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (const func of parsedFile.functions) {
      if (func.content && func.content.length <= this.maxChunkSize) {
        chunks.push(this.createChunk(func, "function", parsedFile.path));
      } else if (func.content) {
        chunks.push(...this.splitLargeFunction(func, parsedFile.path));
      }
    }

    for (const cls of parsedFile.classes) {
      if (cls.content && cls.content.length <= this.maxChunkSize) {
        chunks.push(this.createChunk(cls, "class", parsedFile.path));
      } else if (cls.content) {
        chunks.push(...this.splitClass(cls, parsedFile.path));
      }
    }

    chunks.push(...this.chunkModuleLevel(parsedFile, content));

    return chunks;
  }

  private createChunk(
    element: any,
    type: string,
    filePath: string
  ): CodeChunk {
    return {
      id: this.generateId(filePath, element.name, element.startLine),
      type,
      content: element.content || "",
      metadata: {
        file: filePath,
        startLine: element.startLine,
        endLine: element.endLine,
        name: element.name,
        imports: element.imports || [],
        exports: element.exports || [],
        calls: element.calls || [],
        references: element.references || [],
      },
    };
  }

  private splitLargeFunction(func: any, filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = func.content.split("\n");
    const totalLines = lines.length;
    const linesPerChunk = Math.floor(this.maxChunkSize / 50);

    let startIdx = 0;
    let chunkIndex = 0;

    while (startIdx < totalLines) {
      const endIdx = Math.min(startIdx + linesPerChunk, totalLines);
      const chunkContent = lines.slice(startIdx, endIdx).join("\n");

      chunks.push({
        id: this.generateId(filePath, `${func.name}_part${chunkIndex}`, func.startLine + startIdx),
        type: "function_part",
        content: chunkContent,
        metadata: {
          file: filePath,
          startLine: func.startLine + startIdx,
          endLine: func.startLine + endIdx - 1,
          name: `${func.name}_part${chunkIndex}`,
          imports: chunkIndex === 0 ? (func.imports || []) : [],
          exports: chunkIndex === 0 ? (func.exports || []) : [],
          calls: func.calls || [],
          references: func.references || [],
        },
      });

      startIdx = endIdx - Math.floor(this.overlapSize / 50);
      chunkIndex++;
    }

    return chunks;
  }

  private splitClass(cls: any, filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    chunks.push({
      id: this.generateId(filePath, `${cls.name}_header`, cls.startLine),
      type: "class_header",
      content: cls.content.split("\n").slice(0, 10).join("\n"),
      metadata: {
        file: filePath,
        startLine: cls.startLine,
        endLine: cls.startLine + 10,
        name: `${cls.name}_header`,
        imports: [],
        exports: [],
        calls: [],
        references: [],
      },
    });

    for (const method of cls.methods || []) {
      if (method.content) {
        chunks.push({
          id: this.generateId(filePath, `${cls.name}.${method.name}`, method.line),
          type: "method",
          content: method.content,
          metadata: {
            file: filePath,
            startLine: method.line,
            endLine: method.endLine || method.line,
            name: `${cls.name}.${method.name}`,
            imports: [],
            exports: [],
            calls: method.calls || [],
            references: method.references || [],
          },
        });
      }
    }

    return chunks;
  }

  private chunkModuleLevel(
    parsedFile: ParsedFile,
    content: string
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split("\n");

    const functionLines = new Set<number>();
    const classLines = new Set<number>();

    for (const func of parsedFile.functions) {
      for (let i = func.startLine - 1; i < (func.endLine || func.startLine); i++) {
        functionLines.add(i);
      }
    }

    for (const cls of parsedFile.classes) {
      for (let i = cls.startLine - 1; i < (cls.endLine || cls.startLine); i++) {
        classLines.add(i);
      }
    }

    const moduleLines: string[] = [];
    let currentStart = -1;

    for (let i = 0; i < lines.length; i++) {
      if (!functionLines.has(i) && !classLines.has(i)) {
        if (currentStart === -1) {
          currentStart = i;
        }
        moduleLines.push(lines[i]);

        if (moduleLines.join("\n").length > this.maxChunkSize) {
          chunks.push({
            id: this.generateId(parsedFile.path, `module_${chunks.length}`, currentStart + 1),
            type: "module",
            content: moduleLines.join("\n"),
            metadata: {
              file: parsedFile.path,
              startLine: currentStart + 1,
              endLine: i + 1,
              name: `module_${chunks.length}`,
              imports: parsedFile.imports,
              exports: parsedFile.exports,
              calls: [],
              references: [],
            },
          });
          moduleLines.length = 0;
          currentStart = -1;
        }
      } else {
        if (moduleLines.length > 0) {
          chunks.push({
            id: this.generateId(parsedFile.path, `module_${chunks.length}`, currentStart + 1),
            type: "module",
            content: moduleLines.join("\n"),
            metadata: {
              file: parsedFile.path,
              startLine: currentStart + 1,
              endLine: i,
              name: `module_${chunks.length}`,
              imports: parsedFile.imports,
              exports: parsedFile.exports,
              calls: [],
              references: [],
            },
          });
          moduleLines.length = 0;
          currentStart = -1;
        }
      }
    }

    if (moduleLines.length > 0) {
      chunks.push({
        id: this.generateId(parsedFile.path, `module_${chunks.length}`, currentStart + 1),
        type: "module",
        content: moduleLines.join("\n"),
        metadata: {
          file: parsedFile.path,
          startLine: currentStart + 1,
          endLine: lines.length,
          name: `module_${chunks.length}`,
          imports: parsedFile.imports,
          exports: parsedFile.exports,
          calls: [],
          references: [],
        },
      });
    }

    return chunks;
  }

  private generateId(filePath: string, name: string, line: number): string {
    const hash = crypto
      .createHash("sha256")
      .update(`${filePath}:${name}:${line}`)
      .digest("hex");
    return hash.substring(0, 16);
  }
}