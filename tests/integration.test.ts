import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { CodeGraphCore } from "../src/core/indexer";
import { AutoIndexer } from "../src/core/auto-indexer";
import { ProgressiveToolHandlers } from "../src/handlers/progressive-tools";
import { ResourceHandlers } from "../src/handlers/resources";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { dirname } from "path";
import Database from "better-sqlite3";
import os from "os";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("MCP Integration Tests", () => {
  let core: CodeGraphCore;
  let autoIndexer: AutoIndexer;
  let toolHandlers: ProgressiveToolHandlers;
  let resourceHandlers: ResourceHandlers;
  let testProjectDir: string;
  let dbPath: string;

  beforeAll(async () => {
    // Create a test project with some files
    testProjectDir = path.join(__dirname, "test-integration-project");
    await fs.mkdir(testProjectDir, { recursive: true });
    
    // Create test files
    await fs.writeFile(
      path.join(testProjectDir, "main.js"),
      `
// Main entry point
const utils = require('./utils');
const processor = require('./processor');

function main() {
  const data = utils.getData();
  const result = processor.process(data);
  console.log(result);
  return result;
}

class Application {
  constructor() {
    this.name = 'TestApp';
  }
  
  run() {
    return main();
  }
}

module.exports = { main, Application };
      `
    );
    
    await fs.writeFile(
      path.join(testProjectDir, "utils.js"),
      `
// Utility functions
function getData() {
  return { value: 42 };
}

function formatData(data) {
  return JSON.stringify(data);
}

function validateData(data) {
  return data && data.value > 0;
}

module.exports = { getData, formatData, validateData };
      `
    );
    
    await fs.writeFile(
      path.join(testProjectDir, "processor.js"),
      `
// Data processor
const utils = require('./utils');

function process(data) {
  if (utils.validateData(data)) {
    return utils.formatData(data);
  }
  return null;
}

function complexProcess(items) {
  return items.map(item => process(item));
}

class DataProcessor {
  process(data) {
    return process(data);
  }
  
  batchProcess(items) {
    return complexProcess(items);
  }
}

module.exports = { process, complexProcess, DataProcessor };
      `
    );
    
    await fs.writeFile(
      path.join(testProjectDir, "package.json"),
      JSON.stringify({
        name: "test-integration-project",
        version: "1.0.0",
        dependencies: {
          "express": "^4.18.0",
          "lodash": "^4.17.21"
        },
        devDependencies: {
          "jest": "^29.0.0",
          "eslint": "^8.0.0"
        }
      }, null, 2)
    );
    
    // Initialize components
    core = new CodeGraphCore();
    autoIndexer = new AutoIndexer(core);
    toolHandlers = new ProgressiveToolHandlers(core, autoIndexer);
    resourceHandlers = new ResourceHandlers(core, autoIndexer);
    
    // Set project path and initialize
    await core.setProjectPath(testProjectDir);
    await core.initialize();
    
    // Get database path
    const projectHash = crypto.createHash('md5').update(testProjectDir).digest('hex').substring(0, 8);
    const projectName = path.basename(testProjectDir);
    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
    
    // Run indexing to completion
    await autoIndexer.onClaudeCodeStart(testProjectDir);
    
    // Wait for indexing to complete (or timeout after 10 seconds)
    const startTime = Date.now();
    while (!autoIndexer.isIndexingComplete(testProjectDir) && Date.now() - startTime < 10000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  afterAll(async () => {
    // Clean up test project
    await fs.rm(testProjectDir, { recursive: true, force: true });
    
    // Clean up database
    try {
      const dbDir = path.dirname(dbPath);
      await fs.rm(dbDir, { recursive: true, force: true });
    } catch {}
  });

  describe("MCP Tools", () => {
    describe("analyze_codebase", () => {
      it("should return real codebase analysis", async () => {
        const result = await toolHandlers.handleToolCall("analyze_codebase", { 
          path: testProjectDir 
        });
        
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        
        const text = result.content[0].text;
        expect(text).toContain("# Codebase Analysis");
        expect(text).toContain("Project Overview");
        expect(text).toContain("Total Files");
        expect(text).toContain("Functions");
        expect(text).toContain("Classes");
        
        // Should have found our test files
        expect(text).toMatch(/Total Files.*3/);
        expect(text).toMatch(/Functions.*[1-9]/);
        expect(text).toMatch(/Classes.*[1-9]/);
      });
    });

    describe("find_implementation", () => {
      it("should find implementations in code", async () => {
        const result = await toolHandlers.handleToolCall("find_implementation", { 
          query: "process",
          path: testProjectDir 
        });
        
        expect(result).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Implementation Search Results");
        expect(text).toContain("Components Found");
        
        // Should find process function and DataProcessor class
        expect(text).toContain("process");
        expect(text).toContain("processor.js");
      });
      
      it("should handle queries with no results", async () => {
        const result = await toolHandlers.handleToolCall("find_implementation", { 
          query: "nonexistentfunction",
          path: testProjectDir 
        });
        
        const text = result.content[0].text;
        expect(text).toContain("No Results Found");
      });
    });

    describe("trace_execution", () => {
      it("should trace execution paths", async () => {
        const result = await toolHandlers.handleToolCall("trace_execution", { 
          entryPoint: "main",
          maxDepth: 3,
          path: testProjectDir 
        });
        
        expect(result).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Execution Trace");
        expect(text).toContain("Entry Point");
        
        // Should trace from main function
        expect(text).toContain("main");
      });
    });

    describe("impact_analysis", () => {
      it("should analyze impact of changes", async () => {
        const result = await toolHandlers.handleToolCall("impact_analysis", { 
          component: "getData",
          changeType: "modify",
          path: testProjectDir 
        });
        
        expect(result).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Impact Analysis");
        expect(text).toContain("Risk Level");
        expect(text).toContain("Impact Summary");
      });
    });

    describe("explain_architecture", () => {
      it("should explain codebase architecture", async () => {
        const result = await toolHandlers.handleToolCall("explain_architecture", { 
          scope: testProjectDir,
          level: "detailed",
          path: testProjectDir 
        });
        
        expect(result).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Architecture Explanation");
        expect(text).toContain("Project Structure");
        
        // Should identify modules
        expect(text).toContain("Key Modules");
      });
    });

    describe("get_indexing_status", () => {
      it("should return indexing status", async () => {
        const result = await toolHandlers.handleToolCall("get_indexing_status", { 
          path: testProjectDir 
        });
        
        expect(result).toBeDefined();
        const text = result.content[0].text;
        
        // Should show completion or progress
        expect(text).toMatch(/CodeGraph Ready|Indexing in Progress/);
      });
    });

    describe("get_capabilities", () => {
      it("should return available capabilities", async () => {
        const result = await toolHandlers.handleToolCall("get_capabilities", { 
          path: testProjectDir 
        });
        
        expect(result).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Available Capabilities");
        expect(text).toContain("Syntax Analysis");
      });
    });
  });

  describe("MCP Resources", () => {
    describe("architecture resource", () => {
      it("should return real architecture analysis", async () => {
        const result = await resourceHandlers.getResource("codegraph://architecture");
        
        expect(result).toBeDefined();
        expect(result.uri).toBe("codegraph://architecture");
        expect(result.mimeType).toBe("text/markdown");
        expect(result.text).toBeDefined();
        
        const text = result.text!;
        expect(text).toContain("# Codebase Architecture");
        expect(text).toContain("Module Structure");
        expect(text).toContain("Architectural Layers");
      });
    });

    describe("dependencies resource", () => {
      it("should return real dependency analysis", async () => {
        const result = await resourceHandlers.getResource("codegraph://dependencies");
        
        expect(result).toBeDefined();
        expect(result.text).toBeDefined();
        
        const text = result.text!;
        expect(text).toContain("# Dependency Graph");
        expect(text).toContain("External Dependencies");
        
        // Should find our package.json dependencies
        expect(text).toContain("express");
        expect(text).toContain("lodash");
        expect(text).toContain("jest");
      });
    });

    describe("hotspots resource", () => {
      it("should return code hotspots analysis", async () => {
        const result = await resourceHandlers.getResource("codegraph://hotspots");
        
        expect(result).toBeDefined();
        const text = result.text!;
        expect(text).toContain("# Code Hotspots");
        expect(text).toContain("High Complexity Files");
        expect(text).toContain("Highly Coupled Files");
      });
    });

    describe("status resource", () => {
      it("should return real indexing status", async () => {
        const result = await resourceHandlers.getResource("codegraph://status");
        
        expect(result).toBeDefined();
        const text = result.text!;
        expect(text).toContain("# CodeGraph Indexing Status");
        expect(text).toContain("Current Status");
        expect(text).toContain("Available Capabilities");
        
        // Should show database statistics
        expect(text).toContain("Database Statistics");
        expect(text).toMatch(/Files Indexed.*[1-9]/);
      });
    });

    describe("metrics resource", () => {
      it("should return real code metrics", async () => {
        const result = await resourceHandlers.getResource("codegraph://metrics");
        
        expect(result).toBeDefined();
        const text = result.text!;
        expect(text).toContain("# Code Metrics");
        expect(text).toContain("Project Statistics");
        expect(text).toContain("Total Files");
        expect(text).toContain("Functions");
        expect(text).toContain("Classes");
        
        // Should calculate quality metrics
        expect(text).toContain("Quality Score");
        expect(text).toContain("Complexity Metrics");
      });
    });
  });

  describe("Progressive Enhancement", () => {
    it("should adapt responses based on capabilities", async () => {
      // Test with limited capabilities
      const capabilities = autoIndexer.getCapabilities(testProjectDir);
      
      // All capabilities should be available after indexing
      expect(capabilities.syntaxAnalysis).toBe(true);
      
      // If graph relationships are available, trace should work
      if (capabilities.graphRelationships) {
        const result = await toolHandlers.handleToolCall("trace_execution", {
          entryPoint: "main",
          path: testProjectDir
        });
        
        const text = result.content[0].text;
        expect(text).not.toContain("Execution Tracing Requires Graph Analysis");
      }
    });
  });

  describe("Database Operations", () => {
    it("should store nodes in database", async () => {
      // Check if database exists and has data
      const db = new Database(dbPath, { readonly: true });
      
      const nodeCount = db.prepare("SELECT COUNT(*) as count FROM nodes").get() as any;
      expect(nodeCount.count).toBeGreaterThan(0);
      
      const functionCount = db.prepare("SELECT COUNT(*) as count FROM nodes WHERE type = 'function'").get() as any;
      expect(functionCount.count).toBeGreaterThan(0);
      
      db.close();
    });
    
    it("should store relationships in database", async () => {
      const db = new Database(dbPath, { readonly: true });
      
      const relCount = db.prepare("SELECT COUNT(*) as count FROM relationships").get() as any;
      expect(relCount.count).toBeGreaterThan(0);
      
      db.close();
    });
  });
});

describe("Error Handling", () => {
  let toolHandlers: ProgressiveToolHandlers;
  let resourceHandlers: ResourceHandlers;

  beforeAll(() => {
    const core = new CodeGraphCore();
    const autoIndexer = new AutoIndexer(core);
    toolHandlers = new ProgressiveToolHandlers(core, autoIndexer);
    resourceHandlers = new ResourceHandlers(core, autoIndexer);
  });

  it("should handle non-existent project gracefully", async () => {
    const result = await toolHandlers.handleToolCall("analyze_codebase", {
      path: "/non/existent/path"
    });
    
    expect(result).toBeDefined();
    expect(result.content[0].text).toContain("Database not found");
  });

  it("should handle invalid resource URIs", async () => {
    await expect(resourceHandlers.getResource("codegraph://invalid")).rejects.toThrow();
  });
});