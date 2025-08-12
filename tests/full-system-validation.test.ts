import { CodeGraphCore } from "../src/core/indexer";
import { TreeSitterParser } from "../src/core/parser-treesitter";
import { EmbeddingEngine } from "../src/core/embeddings-fixed";
import { DatabaseManager } from "../src/core/db-manager";
import { FileScanner } from "../src/core/file-scanner";
import { ConcurrencyManager, Debouncer, RetryableOperation } from "../src/core/error-handler";
import fs from "fs/promises";
import path from "path";

describe("Full System Validation", () => {
  const testProjectPath = path.join(process.cwd(), "test-project");

  beforeAll(async () => {
    // Create test project structure
    await fs.mkdir(testProjectPath, { recursive: true });
    
    // Create test files
    await fs.writeFile(
      path.join(testProjectPath, "index.js"),
      `
import { util } from './util';
export default class Main {
  async run() {
    return util.process('data');
  }
}
`
    );
    
    await fs.writeFile(
      path.join(testProjectPath, "util.js"),
      `
export const util = {
  process(data) {
    return data.toUpperCase();
  }
};
`
    );

    // Create nested structure
    await fs.mkdir(path.join(testProjectPath, "src", "components"), { recursive: true });
    await fs.writeFile(
      path.join(testProjectPath, "src", "components", "Button.tsx"),
      `
import React from 'react';
interface ButtonProps {
  label: string;
  onClick: () => void;
}
export const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};
`
    );
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("File Scanner", () => {
    test("should respect depth limits", async () => {
      const scanner = new FileScanner({ maxDepth: 2 });
      const files = await scanner.getFileList(testProjectPath);
      
      // Should find files at depth 0 and 1, but not deeper
      expect(files).toContain(path.join(testProjectPath, "index.js"));
      expect(files).toContain(path.join(testProjectPath, "util.js"));
      
      // With depth 2, should not find Button.tsx at depth 3
      const deepFile = path.join(testProjectPath, "src", "components", "Button.tsx");
      expect(files).not.toContain(deepFile);
    });

    test("should filter by patterns", async () => {
      const scanner = new FileScanner({
        includePatterns: ["*.js"],
        maxDepth: 10
      });
      const files = await scanner.getFileList(testProjectPath);
      
      expect(files.every(f => f.endsWith(".js"))).toBe(true);
      expect(files.some(f => f.endsWith(".tsx"))).toBe(false);
    });
  });

  describe("Tree-Sitter Parser", () => {
    test("should parse all supported languages", async () => {
      const parser = new TreeSitterParser();
      await parser.initialize();
      
      const languages = ["javascript", "typescript", "python", "go", "rust", "java"];
      
      for (const lang of languages) {
        const result = await parser.parseFile("// test", lang);
        expect(result).toBeDefined();
        expect(result.language).toBe(lang);
      }
    });
  });

  describe("Embedding System", () => {
    test("should handle provider failures gracefully", async () => {
      const engine = new EmbeddingEngine();
      await engine.initialize();
      
      // Should always work with at least fallback
      const embedding = await engine.embed("test content");
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
      
      console.log(`Active provider: ${engine.getActiveProvider()}`);
    });
  });

  describe("Database Manager", () => {
    test("should manage multiple projects", async () => {
      const manager = DatabaseManager.getInstance();
      
      const db1 = await manager.getDatabase("/project1");
      const db2 = await manager.getDatabase("/project2");
      
      expect(db1).toBeDefined();
      expect(db2).toBeDefined();
      expect(db1).not.toBe(db2);
      
      const projects = await manager.listProjects();
      expect(projects.length).toBeGreaterThanOrEqual(2);
    });

    test("should cleanup old databases", async () => {
      const manager = DatabaseManager.getInstance();
      
      // Create multiple test databases
      for (let i = 0; i < 15; i++) {
        await manager.getDatabase(`/test-project-${i}`);
      }
      
      await manager.cleanupIfNeeded();
      
      const projects = await manager.listProjects();
      expect(projects.length).toBeLessThanOrEqual(10);
    });
  });

  describe("Error Handling", () => {
    test("should retry failed operations", async () => {
      let attempts = 0;
      const operation = new RetryableOperation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return "success";
      });
      
      const result = await operation.execute();
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    test("should handle concurrent operations", async () => {
      const manager = new ConcurrencyManager();
      const results: number[] = [];
      
      // Launch concurrent operations on same resource
      const promises = Array.from({ length: 5 }, (_, i) => 
        manager.withLock("resource", async () => {
          await new Promise(r => setTimeout(r, 10));
          results.push(i);
        })
      );
      
      await Promise.all(promises);
      
      // Should execute sequentially
      expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    test("should debounce rapid calls", async () => {
      const debouncer = new Debouncer();
      let callCount = 0;
      
      // Rapid calls
      for (let i = 0; i < 10; i++) {
        debouncer.debounce("test", () => callCount++, 50);
        await new Promise(r => setTimeout(r, 10));
      }
      
      // Wait for debounce
      await new Promise(r => setTimeout(r, 100));
      
      // Should only call once
      expect(callCount).toBe(1);
    });
  });

  describe("Integration", () => {
    test("should index a complete project", async () => {
      const core = new CodeGraphCore();
      await core.initialize(testProjectPath);
      
      // Run full indexing
      await core.runSyntaxPhase(testProjectPath, () => {});
      await core.runGraphPhase(testProjectPath, () => {});
      await core.runSemanticPhase(testProjectPath, () => {});
      
      // Verify results
      // This would include checking the database for expected nodes and relationships
      expect(core.isInitialized()).toBe(true);
    });
  });
});