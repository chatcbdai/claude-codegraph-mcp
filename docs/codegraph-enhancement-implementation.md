# CodeGraph MCP Enhancement Implementation Guide

## Overview

This document provides the complete implementation for the three missing features needed to make CodeGraph a seamless "infusion" into Claude Code:

1. **Automatic Background Indexing** - Auto-trigger when Claude Code starts
2. **Seamless Status Integration** - Real-time progress and capability reporting  
3. **Progressive Enhancement Protocol** - Graceful behavior during and after indexing

## Integration Timeline

### Phase 1 Enhancements (Week 1)
- Add core status tracking system
- Add auto-indexing trigger mechanism
- Enhance MCP server with status capabilities

### Phase 6 Enhancements (Week 3-4) 
- Add status reporting tools to MCP interface
- Add progressive enhancement tool handlers
- Add directory change detection

### Phase 8 Enhanhancements (Week 4)
- Integrate with incremental indexing
- Add real-time status updates
- Add progressive context building

---

## Feature 1: Automatic Background Indexing

### Phase 1 Implementation: Core Auto-Indexer

**File: `src/core/auto-indexer.ts`** (NEW FILE)

```typescript
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { CodeGraphCore } from './indexer.js';
import { Logger } from '../utils/logger.js';

export interface IndexingStatus {
  isIndexing: boolean;
  isComplete: boolean;
  progress: number; // 0-100
  currentPhase: 'syntax' | 'graph' | 'semantic' | 'temporal' | 'complete';
  filesProcessed: number;
  totalFiles: number;
  error?: string;
  capabilities: CapabilityStatus;
}

export interface CapabilityStatus {
  syntaxAnalysis: boolean;
  graphRelationships: boolean;
  semanticSearch: boolean;
  temporalAnalysis: boolean;
  queryIntelligence: boolean;
}

export class AutoIndexer extends EventEmitter {
  private indexingStatus = new Map<string, IndexingStatus>();
  private activeIndexing = new Set<string>();
  private logger = new Logger('AutoIndexer');
  private coreIndexer: CodeGraphCore;
  
  constructor(coreIndexer: CodeGraphCore) {
    super();
    this.coreIndexer = coreIndexer;
  }
  
  /**
   * Called when Claude Code starts in a directory
   * This is the main entry point for auto-indexing
   */
  async onClaudeCodeStart(workingDir: string): Promise<void> {
    try {
      const normalizedPath = path.resolve(workingDir);
      this.logger.info(`Claude Code started in: ${normalizedPath}`);
      
      // Check if this directory needs indexing
      const needsIndexing = await this.needsIndexing(normalizedPath);
      
      if (needsIndexing) {
        this.logger.info(`Starting background indexing for: ${normalizedPath}`);
        await this.startBackgroundIndexing(normalizedPath);
      } else {
        this.logger.info(`Directory already indexed: ${normalizedPath}`);
        // Load existing index status
        await this.loadExistingStatus(normalizedPath);
      }
    } catch (error) {
      this.logger.error(`Error in onClaudeCodeStart: ${error.message}`);
      this.setErrorStatus(workingDir, error.message);
    }
  }
  
  /**
   * Check if directory needs indexing
   */
  private async needsIndexing(dirPath: string): Promise<boolean> {
    try {
      // Check if .codegraph directory exists and is up to date
      const indexPath = path.join(dirPath, '.codegraph');
      const indexExists = await this.fileExists(indexPath);
      
      if (!indexExists) {
        return true;
      }
      
      // Check if index is stale (git HEAD changed, files modified, etc.)
      const isStale = await this.isIndexStale(dirPath);
      return isStale;
    } catch (error) {
      this.logger.warn(`Error checking indexing needs: ${error.message}`);
      return true; // Default to indexing if we can't determine
    }
  }
  
  /**
   * Start background indexing with progress tracking
   */
  private async startBackgroundIndexing(dirPath: string): Promise<void> {
    if (this.activeIndexing.has(dirPath)) {
      this.logger.warn(`Indexing already active for: ${dirPath}`);
      return;
    }
    
    this.activeIndexing.add(dirPath);
    
    // Initialize status
    const status: IndexingStatus = {
      isIndexing: true,
      isComplete: false,
      progress: 0,
      currentPhase: 'syntax',
      filesProcessed: 0,
      totalFiles: 0,
      capabilities: {
        syntaxAnalysis: false,
        graphRelationships: false,
        semanticSearch: false,
        temporalAnalysis: false,
        queryIntelligence: false
      }
    };
    
    this.indexingStatus.set(dirPath, status);
    this.emit('statusChange', dirPath, status);
    
    try {
      // Phase 1: Count total files
      const totalFiles = await this.countFiles(dirPath);
      status.totalFiles = totalFiles;
      this.updateStatus(dirPath, status);
      
      // Phase 2: Syntax Analysis (0-25%)
      status.currentPhase = 'syntax';
      await this.runSyntaxAnalysis(dirPath, status);
      status.capabilities.syntaxAnalysis = true;
      status.progress = 25;
      this.updateStatus(dirPath, status);
      
      // Phase 3: Graph Relationships (25-50%)
      status.currentPhase = 'graph';
      await this.runGraphAnalysis(dirPath, status);
      status.capabilities.graphRelationships = true;
      status.progress = 50;
      this.updateStatus(dirPath, status);
      
      // Phase 4: Semantic Search (50-75%)
      status.currentPhase = 'semantic';
      await this.runSemanticAnalysis(dirPath, status);
      status.capabilities.semanticSearch = true;
      status.progress = 75;
      this.updateStatus(dirPath, status);
      
      // Phase 5: Temporal Analysis (75-90%)
      status.currentPhase = 'temporal';
      await this.runTemporalAnalysis(dirPath, status);
      status.capabilities.temporalAnalysis = true;
      status.progress = 90;
      this.updateStatus(dirPath, status);
      
      // Phase 6: Query Intelligence (90-100%)
      status.currentPhase = 'complete';
      await this.finalizeIndexing(dirPath, status);
      status.capabilities.queryIntelligence = true;
      status.progress = 100;
      status.isIndexing = false;
      status.isComplete = true;
      this.updateStatus(dirPath, status);
      
      this.logger.info(`Indexing completed for: ${dirPath}`);
      
    } catch (error) {
      this.logger.error(`Indexing failed for ${dirPath}: ${error.message}`);
      this.setErrorStatus(dirPath, error.message);
    } finally {
      this.activeIndexing.delete(dirPath);
    }
  }
  
  /**
   * Get current status for a directory
   */
  getStatus(dirPath: string): IndexingStatus | null {
    const normalizedPath = path.resolve(dirPath);
    return this.indexingStatus.get(normalizedPath) || null;
  }
  
  /**
   * Check if indexing is complete for a directory
   */
  isIndexingComplete(dirPath: string): boolean {
    const status = this.getStatus(dirPath);
    return status?.isComplete === true;
  }
  
  /**
   * Get available capabilities for a directory
   */
  getCapabilities(dirPath: string): CapabilityStatus {
    const status = this.getStatus(dirPath);
    return status?.capabilities || {
      syntaxAnalysis: false,
      graphRelationships: false,
      semanticSearch: false,
      temporalAnalysis: false,
      queryIntelligence: false
    };
  }
  
  // Private helper methods
  
  private async countFiles(dirPath: string): Promise<number> {
    return await this.coreIndexer.countIndexableFiles(dirPath);
  }
  
  private async runSyntaxAnalysis(dirPath: string, status: IndexingStatus): Promise<void> {
    await this.coreIndexer.runSyntaxPhase(dirPath, (processed, total) => {
      status.filesProcessed = processed;
      status.progress = Math.floor((processed / total) * 25);
      this.updateStatus(dirPath, status);
    });
  }
  
  private async runGraphAnalysis(dirPath: string, status: IndexingStatus): Promise<void> {
    await this.coreIndexer.runGraphPhase(dirPath, (processed, total) => {
      const phaseProgress = Math.floor((processed / total) * 25);
      status.progress = 25 + phaseProgress;
      this.updateStatus(dirPath, status);
    });
  }
  
  private async runSemanticAnalysis(dirPath: string, status: IndexingStatus): Promise<void> {
    await this.coreIndexer.runSemanticPhase(dirPath, (processed, total) => {
      const phaseProgress = Math.floor((processed / total) * 25);
      status.progress = 50 + phaseProgress;
      this.updateStatus(dirPath, status);
    });
  }
  
  private async runTemporalAnalysis(dirPath: string, status: IndexingStatus): Promise<void> {
    await this.coreIndexer.runTemporalPhase(dirPath, (processed, total) => {
      const phaseProgress = Math.floor((processed / total) * 15);
      status.progress = 75 + phaseProgress;
      this.updateStatus(dirPath, status);
    });
  }
  
  private async finalizeIndexing(dirPath: string, status: IndexingStatus): Promise<void> {
    await this.coreIndexer.finalizeIndex(dirPath);
    await this.saveIndexStatus(dirPath, status);
  }
  
  private updateStatus(dirPath: string, status: IndexingStatus): void {
    this.indexingStatus.set(dirPath, { ...status });
    this.emit('statusChange', dirPath, status);
  }
  
  private setErrorStatus(dirPath: string, errorMessage: string): void {
    const status: IndexingStatus = {
      isIndexing: false,
      isComplete: false,
      progress: 0,
      currentPhase: 'syntax',
      filesProcessed: 0,
      totalFiles: 0,
      error: errorMessage,
      capabilities: {
        syntaxAnalysis: false,
        graphRelationships: false,
        semanticSearch: false,
        temporalAnalysis: false,
        queryIntelligence: false
      }
    };
    this.updateStatus(dirPath, status);
  }
  
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  private async isIndexStale(dirPath: string): Promise<boolean> {
    // Check git HEAD, modification times, etc.
    // Implementation depends on coreIndexer.checkStaleness()
    return await this.coreIndexer.isIndexStale(dirPath);
  }
  
  private async loadExistingStatus(dirPath: string): Promise<void> {
    const status = await this.coreIndexer.loadIndexStatus(dirPath);
    if (status) {
      this.indexingStatus.set(dirPath, status);
      this.emit('statusChange', dirPath, status);
    }
  }
  
  private async saveIndexStatus(dirPath: string, status: IndexingStatus): Promise<void> {
    await this.coreIndexer.saveIndexStatus(dirPath, status);
  }
}
```

### Phase 1 Implementation: Enhanced Core Indexer

**File: `src/core/indexer.ts`** (MODIFICATIONS TO EXISTING FILE)

Add these methods to the existing `CodeGraphCore` class:

```typescript
// Add to existing CodeGraphCore class

/**
 * Count indexable files for progress tracking
 */
async countIndexableFiles(dirPath: string): Promise<number> {
  const files = await this.scanDirectory(dirPath);
  return files.filter(file => this.isIndexableFile(file)).length;
}

/**
 * Run syntax analysis phase with progress callback
 */
async runSyntaxPhase(dirPath: string, progressCallback: (processed: number, total: number) => void): Promise<void> {
  const files = await this.getIndexableFiles(dirPath);
  let processed = 0;
  
  for (const file of files) {
    await this.parseFile(file);
    processed++;
    progressCallback(processed, files.length);
  }
}

/**
 * Run graph analysis phase with progress callback
 */
async runGraphPhase(dirPath: string, progressCallback: (processed: number, total: number) => void): Promise<void> {
  const parsedFiles = await this.getParsedFiles(dirPath);
  let processed = 0;
  
  for (const file of parsedFiles) {
    await this.analyzeRelationships(file);
    processed++;
    progressCallback(processed, parsedFiles.length);
  }
}

/**
 * Run semantic analysis phase with progress callback
 */
async runSemanticPhase(dirPath: string, progressCallback: (processed: number, total: number) => void): Promise<void> {
  const chunks = await this.getCodeChunks(dirPath);
  let processed = 0;
  
  for (const chunk of chunks) {
    await this.generateEmbedding(chunk);
    processed++;
    progressCallback(processed, chunks.length);
  }
}

/**
 * Run temporal analysis phase with progress callback
 */
async runTemporalPhase(dirPath: string, progressCallback: (processed: number, total: number) => void): Promise<void> {
  const files = await this.getTrackedFiles(dirPath);
  let processed = 0;
  
  for (const file of files) {
    await this.analyzeFileHistory(file);
    processed++;
    progressCallback(processed, files.length);
  }
}

/**
 * Finalize indexing process
 */
async finalizeIndex(dirPath: string): Promise<void> {
  await this.buildQueryIndex(dirPath);
  await this.optimizeDatabase(dirPath);
  await this.createIndexManifest(dirPath);
}

/**
 * Check if index is stale
 */
async isIndexStale(dirPath: string): Promise<boolean> {
  const manifestPath = path.join(dirPath, '.codegraph', 'manifest.json');
  
  try {
    const manifest = await this.loadManifest(manifestPath);
    const currentGitHead = await this.getCurrentGitHead(dirPath);
    const lastModified = await this.getLastModifiedTime(dirPath);
    
    return (
      manifest.gitHead !== currentGitHead ||
      manifest.lastModified < lastModified
    );
  } catch {
    return true; // If we can't check, assume stale
  }
}

/**
 * Load existing index status
 */
async loadIndexStatus(dirPath: string): Promise<IndexingStatus | null> {
  const statusPath = path.join(dirPath, '.codegraph', 'status.json');
  
  try {
    const statusContent = await fs.readFile(statusPath, 'utf-8');
    return JSON.parse(statusContent) as IndexingStatus;
  } catch {
    return null;
  }
}

/**
 * Save index status
 */
async saveIndexStatus(dirPath: string, status: IndexingStatus): Promise<void> {
  const codegraphDir = path.join(dirPath, '.codegraph');
  const statusPath = path.join(codegraphDir, 'status.json');
  
  await fs.mkdir(codegraphDir, { recursive: true });
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
}
```

---

## Feature 2: Seamless Status Integration

### Phase 6 Implementation: Status Reporting Tools

**File: `src/handlers/tools.ts`** (MODIFICATIONS TO EXISTING FILE)

Add these tools to the existing `ToolHandlers` class:

```typescript
// Add to existing ToolHandlers.getTools() method

{
  name: "get_indexing_status",
  description: "Get current indexing status and progress for the codebase",
  inputSchema: {
    type: "object",
    properties: {
      path: { 
        type: "string", 
        description: "Working directory path (defaults to current directory)" 
      }
    }
  }
},
{
  name: "get_capabilities",
  description: "Get available CodeGraph capabilities for the current codebase",
  inputSchema: {
    type: "object",
    properties: {
      path: { 
        type: "string", 
        description: "Working directory path (defaults to current directory)" 
      }
    }
  }
},
{
  name: "wait_for_indexing",
  description: "Wait for indexing to complete before proceeding with code analysis",
  inputSchema: {
    type: "object",
    properties: {
      path: { 
        type: "string", 
        description: "Working directory path (defaults to current directory)" 
      },
      maxWaitTime: {
        type: "number",
        description: "Maximum time to wait in seconds (default: 300)"
      }
    }
  }
}

// Add to existing ToolHandlers.handleToolCall() method

case "get_indexing_status":
  return await this.getIndexingStatus(args);
case "get_capabilities":
  return await this.getCapabilities(args);
case "wait_for_indexing":
  return await this.waitForIndexing(args);

// Add these new methods to ToolHandlers class

private async getIndexingStatus(args: any): Promise<ToolResult> {
  try {
    const workingDir = args.path || process.cwd();
    const status = this.core.autoIndexer.getStatus(workingDir);
    
    if (!status) {
      return {
        content: [{
          type: "text",
          text: "No indexing information available for this directory. CodeGraph may not be active."
        }]
      };
    }
    
    const statusMessage = this.formatIndexingStatus(status);
    
    return {
      content: [{
        type: "text",
        text: statusMessage
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error getting indexing status: ${error.message}`
      }]
    };
  }
}

private async getCapabilities(args: any): Promise<ToolResult> {
  try {
    const workingDir = args.path || process.cwd();
    const capabilities = this.core.autoIndexer.getCapabilities(workingDir);
    const status = this.core.autoIndexer.getStatus(workingDir);
    
    const capabilityMessage = this.formatCapabilities(capabilities, status);
    
    return {
      content: [{
        type: "text",
        text: capabilityMessage
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error getting capabilities: ${error.message}`
      }]
    };
  }
}

private async waitForIndexing(args: any): Promise<ToolResult> {
  try {
    const workingDir = args.path || process.cwd();
    const maxWaitTime = args.maxWaitTime || 300; // 5 minutes default
    
    const isComplete = await this.waitForIndexingComplete(workingDir, maxWaitTime);
    
    if (isComplete) {
      return {
        content: [{
          type: "text",
          text: "✅ Indexing complete! CodeGraph is now ready with full codebase intelligence."
        }]
      };
    } else {
      const status = this.core.autoIndexer.getStatus(workingDir);
      return {
        content: [{
          type: "text",
          text: `⏳ Indexing still in progress (${status?.progress}% complete). You can continue with basic assistance, or wait longer for full capabilities.`
        }]
      };
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error waiting for indexing: ${error.message}`
      }]
    };
  }
}

private formatIndexingStatus(status: IndexingStatus): string {
  if (status.error) {
    return `❌ **Indexing Error**\n\nError: ${status.error}\n\nPlease check the logs and try restarting Claude Code.`;
  }
  
  if (status.isComplete) {
    return `✅ **CodeGraph Ready**\n\nIndexing complete! Full codebase intelligence is available.\n\n**Available Capabilities:**\n${this.formatCapabilityList(status.capabilities)}`;
  }
  
  if (status.isIndexing) {
    const progressBar = this.createProgressBar(status.progress);
    return `⏳ **Indexing in Progress**\n\n${progressBar} ${status.progress}%\n\n**Current Phase:** ${status.currentPhase}\n**Files Processed:** ${status.filesProcessed}/${status.totalFiles}\n\n**Available Now:**\n${this.formatCapabilityList(status.capabilities)}\n\n*You can continue working - I'll get smarter as indexing progresses!*`;
  }
  
  return "ℹ️ **No Active Indexing**\n\nCodeGraph is ready to start indexing when needed.";
}

private formatCapabilities(capabilities: CapabilityStatus, status?: IndexingStatus): string {
  const capList = this.formatCapabilityList(capabilities);
  
  if (status?.isIndexing) {
    return `**Currently Available:**\n${capList}\n\n*More capabilities coming as indexing progresses...*`;
  }
  
  return `**Available Capabilities:**\n${capList}`;
}

private formatCapabilityList(capabilities: CapabilityStatus): string {
  const items = [
    { name: "Syntax Analysis", available: capabilities.syntaxAnalysis, desc: "Code parsing and structure understanding" },
    { name: "Graph Relationships", available: capabilities.graphRelationships, desc: "Function calls, imports, and dependencies" },
    { name: "Semantic Search", available: capabilities.semanticSearch, desc: "Intelligent code search and similarity" },
    { name: "Temporal Analysis", available: capabilities.temporalAnalysis, desc: "Git history and evolution patterns" },
    { name: "Query Intelligence", available: capabilities.queryIntelligence, desc: "Advanced query routing and context building" }
  ];
  
  return items
    .map(item => `${item.available ? '✅' : '⏳'} **${item.name}**: ${item.desc}`)
    .join('\n');
}

private createProgressBar(progress: number): string {
  const width = 20;
  const filled = Math.floor((progress / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

private async waitForIndexingComplete(workingDir: string, maxWaitSeconds: number): Promise<boolean> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;
  
  while (Date.now() - startTime < maxWaitMs) {
    if (this.core.autoIndexer.isIndexingComplete(workingDir)) {
      return true;
    }
    
    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return false;
}
```

### Phase 6 Implementation: Directory Change Detection

**File: `src/index.ts`** (MODIFICATIONS TO EXISTING FILE)

Modify the main MCP server to detect directory changes:

```typescript
// Add to existing imports
import { AutoIndexer } from './core/auto-indexer.js';
import chokidar from 'chokidar';

// Add to existing CodeGraphMCPServer class

private autoIndexer: AutoIndexer;
private directoryWatcher?: chokidar.FSWatcher;
private currentWorkingDir?: string;

constructor() {
  // ... existing constructor code ...
  
  this.autoIndexer = new AutoIndexer(this.core);
  this.setupDirectoryDetection();
}

private setupDirectoryDetection(): void {
  // Listen for MCP requests to detect working directory
  this.server.setRequestHandler('tools/call', async (request) => {
    const workingDir = this.detectWorkingDirectory(request);
    if (workingDir && workingDir !== this.currentWorkingDir) {
      await this.onWorkingDirectoryChange(workingDir);
    }
    
    // Continue with normal request handling
    return await this.handleToolCall(request);
  });
}

private detectWorkingDirectory(request: any): string | null {
  try {
    // Claude Code often passes the working directory in the request context
    // or we can infer it from file paths in the arguments
    
    if (request.params?.arguments?.path) {
      return path.dirname(path.resolve(request.params.arguments.path));
    }
    
    // Fallback to process.cwd() which Claude Code should set
    return process.cwd();
  } catch {
    return null;
  }
}

private async onWorkingDirectoryChange(newWorkingDir: string): Promise<void> {
  try {
    this.currentWorkingDir = newWorkingDir;
    console.error(`[CodeGraph] Working directory changed to: ${newWorkingDir}`);
    
    // Trigger auto-indexing for the new directory
    await this.autoIndexer.onClaudeCodeStart(newWorkingDir);
    
    // Set up file watching for incremental updates
    this.setupFileWatching(newWorkingDir);
    
  } catch (error) {
    console.error(`[CodeGraph] Error handling directory change: ${error.message}`);
  }
}

private setupFileWatching(workingDir: string): void {
  // Clean up existing watcher
  if (this.directoryWatcher) {
    this.directoryWatcher.close();
  }
  
  // Watch for file changes to trigger incremental updates
  this.directoryWatcher = chokidar.watch(workingDir, {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.codegraph/**',
      '**/dist/**',
      '**/build/**'
    ],
    ignoreInitial: true,
    persistent: true
  });
  
  this.directoryWatcher.on('change', (filePath) => {
    this.handleFileChange(filePath);
  });
  
  this.directoryWatcher.on('add', (filePath) => {
    this.handleFileAdd(filePath);
  });
  
  this.directoryWatcher.on('unlink', (filePath) => {
    this.handleFileDelete(filePath);
  });
}

private async handleFileChange(filePath: string): Promise<void> {
  // Trigger incremental re-indexing for changed file
  if (this.autoIndexer.isIndexingComplete(this.currentWorkingDir!)) {
    await this.core.reindexFile(filePath);
  }
}

private async handleFileAdd(filePath: string): Promise<void> {
  // Index new file
  if (this.autoIndexer.isIndexingComplete(this.currentWorkingDir!)) {
    await this.core.indexNewFile(filePath);
  }
}

private async handleFileDelete(filePath: string): Promise<void> {
  // Remove file from index
  if (this.autoIndexer.isIndexingComplete(this.currentWorkingDir!)) {
    await this.core.removeFromIndex(filePath);
  }
}
```

---

## Feature 3: Progressive Enhancement Protocol

### Phase 6 Implementation: Progressive Tool Handlers

**File: `src/handlers/progressive-tools.ts`** (NEW FILE)

```typescript
import { ToolResult } from '../types/mcp.js';
import { ToolHandlers } from './tools.js';
import { AutoIndexer, CapabilityStatus } from '../core/auto-indexer.js';

/**
 * Progressive Enhancement wrapper for existing tools
 * Adapts tool behavior based on current indexing status
 */
export class ProgressiveToolHandlers extends ToolHandlers {
  
  async handleToolCall(name: string, args: any): Promise<ToolResult> {
    const workingDir = args.path || process.cwd();
    const capabilities = this.core.autoIndexer.getCapabilities(workingDir);
    const status = this.core.autoIndexer.getStatus(workingDir);
    
    // Route to appropriate handler based on capabilities
    switch (name) {
      case "analyze_codebase":
        return await this.progressiveAnalyzeCodebase(args, capabilities, status);
      case "find_implementation":
        return await this.progressiveFindImplementation(args, capabilities, status);
      case "trace_execution":
        return await this.progressiveTraceExecution(args, capabilities, status);
      case "impact_analysis":
        return await this.progressiveImpactAnalysis(args, capabilities, status);
      case "explain_architecture":
        return await this.progressiveExplainArchitecture(args, capabilities, status);
      default:
        return await super.handleToolCall(name, args);
    }
  }
  
  private async progressiveAnalyzeCodebase(
    args: any, 
    capabilities: CapabilityStatus,
    status: any
  ): Promise<ToolResult> {
    const workingDir = args.path || process.cwd();
    
    if (!capabilities.syntaxAnalysis) {
      return {
        content: [{
          type: "text",
          text: "⏳ **Codebase Analysis Starting**\n\nI'm currently analyzing your codebase structure. This will take a few minutes.\n\nI can provide basic assistance now, but for comprehensive analysis, please wait for indexing to complete.\n\n*Use `get_indexing_status` to track progress.*"
        }]
      };
    }
    
    let analysisLevel = 'basic';
    let limitations: string[] = [];
    
    if (capabilities.syntaxAnalysis && capabilities.graphRelationships) {
      analysisLevel = 'structural';
    }
    
    if (capabilities.semanticSearch) {
      analysisLevel = 'semantic';
    }
    
    if (capabilities.temporalAnalysis) {
      analysisLevel = 'full';
    }
    
    if (!capabilities.queryIntelligence) {
      limitations.push("Advanced query optimization not yet available");
    }
    
    // Run analysis at appropriate level
    const result = await this.runCodebaseAnalysis(workingDir, analysisLevel, args.depth);
    
    // Add progressive enhancement notice
    let enhancementNotice = '';
    if (status?.isIndexing) {
      enhancementNotice = `\n\n*📈 **Enhancement in Progress**: Indexing is ${status.progress}% complete. Analysis will become more comprehensive as indexing progresses.*`;
    } else if (limitations.length > 0) {
      enhancementNotice = `\n\n*ℹ️ **Limitations**: ${limitations.join(', ')}*`;
    }
    
    return {
      content: [{
        type: "text",
        text: result + enhancementNotice
      }]
    };
  }
  
  private async progressiveFindImplementation(
    args: any, 
    capabilities: CapabilityStatus,
    status: any
  ): Promise<ToolResult> {
    const query = args.query;
    const workingDir = args.path || process.cwd();
    
    // Progressive search strategy based on available capabilities
    const searchStrategies: string[] = [];
    
    if (capabilities.syntaxAnalysis) {
      searchStrategies.push('syntax');
    }
    
    if (capabilities.graphRelationships) {
      searchStrategies.push('graph');
    }
    
    if (capabilities.semanticSearch) {
      searchStrategies.push('semantic');
    } else {
      searchStrategies.push('keyword'); // Fallback
    }
    
    const results = await this.runProgressiveSearch(workingDir, query, searchStrategies);
    
    // Format results with capability indicators
    let responseText = this.formatSearchResults(results, searchStrategies);
    
    // Add enhancement notice
    if (status?.isIndexing) {
      responseText += `\n\n*⚡ **Search Enhancement**: Currently using ${searchStrategies.join(', ')} search. Full semantic search will be available when indexing completes (${status.progress}% done).*`;
    } else if (!capabilities.semanticSearch) {
      responseText += `\n\n*ℹ️ **Search Level**: Using ${searchStrategies.join(', ')} search. For more intelligent results, semantic indexing is needed.*`;
    }
    
    return {
      content: [{
        type: "text",
        text: responseText
      }]
    };
  }
  
  private async progressiveTraceExecution(
    args: any, 
    capabilities: CapabilityStatus,
    status: any
  ): Promise<ToolResult> {
    if (!capabilities.graphRelationships) {
      return {
        content: [{
          type: "text",
          text: "⏳ **Execution Tracing Requires Graph Analysis**\n\nI'm still building the relationship graph for your codebase. Execution tracing will be available once graph analysis completes.\n\n*Current progress: Building code relationships...*\n\nFor now, I can help with basic code navigation and syntax analysis."
        }]
      };
    }
    
    const traceDepth = capabilities.semanticSearch ? args.maxDepth : Math.min(args.maxDepth, 3);
    const trace = await this.runExecutionTrace(args.entryPoint, traceDepth, capabilities);
    
    let responseText = this.formatExecutionTrace(trace);
    
    if (!capabilities.semanticSearch) {
      responseText += `\n\n*📊 **Trace Depth Limited**: Showing ${traceDepth} levels. Full deep tracing will be available when semantic analysis completes.*`;
    }
    
    return {
      content: [{
        type: "text",
        text: responseText
      }]
    };
  }
  
  private async progressiveImpactAnalysis(
    args: any, 
    capabilities: CapabilityStatus,
    status: any
  ): Promise<ToolResult> {
    if (!capabilities.graphRelationships) {
      return {
        content: [{
          type: "text",
          text: "⏳ **Impact Analysis Requires Relationship Mapping**\n\nI need to complete the relationship analysis before I can assess change impact.\n\n*Currently building dependency graph...*\n\nI can provide basic syntax-level analysis for now."
        }]
      };
    }
    
    const analysisDepth = this.determineAnalysisDepth(capabilities);
    const impact = await this.runImpactAnalysis(args.component, args.changeType, analysisDepth);
    
    let responseText = this.formatImpactAnalysis(impact);
    
    if (!capabilities.temporalAnalysis) {
      responseText += `\n\n*🔍 **Enhanced Analysis Coming**: Adding historical change patterns when temporal analysis completes.*`;
    }
    
    return {
      content: [{
        type: "text",
        text: responseText
      }]
    };
  }
  
  private async progressiveExplainArchitecture(
    args: any, 
    capabilities: CapabilityStatus,
    status: any
  ): Promise<ToolResult> {
    const explanationLevel = this.determineExplanationLevel(capabilities);
    const architecture = await this.runArchitectureAnalysis(args.scope, explanationLevel);
    
    let responseText = this.formatArchitectureExplanation(architecture, explanationLevel);
    
    // Add progressive enhancement info
    if (status?.isIndexing) {
      responseText += `\n\n*🏗️ **Architecture Understanding Improving**: ${status.progress}% indexed. More detailed architectural insights coming as analysis progresses.*`;
    }
    
    return {
      content: [{
        type: "text",
        text: responseText
      }]
    };
  }
  
  // Helper methods for progressive enhancement
  
  private determineAnalysisDepth(capabilities: CapabilityStatus): number {
    if (capabilities.queryIntelligence) return 5;
    if (capabilities.temporalAnalysis) return 4;
    if (capabilities.semanticSearch) return 3;
    if (capabilities.graphRelationships) return 2;
    return 1;
  }
  
  private determineExplanationLevel(capabilities: CapabilityStatus): 'basic' | 'detailed' | 'comprehensive' {
    if (capabilities.temporalAnalysis && capabilities.semanticSearch) return 'comprehensive';
    if (capabilities.graphRelationships) return 'detailed';
    return 'basic';
  }
  
  private async runProgressiveSearch(
    workingDir: string, 
    query: string, 
    strategies: string[]
  ): Promise<any> {
    // Implementation depends on available capabilities
    return await this.core.search.progressiveSearch(workingDir, query, strategies);
  }
  
  private formatSearchResults(results: any, strategies: string[]): string {
    // Format search results with strategy indicators
    return this.core.formatter.formatSearchResults(results, strategies);
  }
  
  // Additional helper methods...
  private async runCodebaseAnalysis(workingDir: string, level: string, depth: number): Promise<string> {
    return await this.core.analyzer.analyze(workingDir, level, depth);
  }
  
  private async runExecutionTrace(entryPoint: string, depth: number, capabilities: CapabilityStatus): Promise<any> {
    return await this.core.tracer.trace(entryPoint, depth, capabilities);
  }
  
  private async runImpactAnalysis(component: string, changeType: string, depth: number): Promise<any> {
    return await this.core.impact.analyze(component, changeType, depth);
  }
  
  private async runArchitectureAnalysis(scope: string, level: string): Promise<any> {
    return await this.core.architecture.analyze(scope, level);
  }
  
  private formatExecutionTrace(trace: any): string {
    return this.core.formatter.formatTrace(trace);
  }
  
  private formatImpactAnalysis(impact: any): string {
    return this.core.formatter.formatImpact(impact);
  }
  
  private formatArchitectureExplanation(architecture: any, level: string): string {
    return this.core.formatter.formatArchitecture(architecture, level);
  }
}
```

### Phase 8 Implementation: Real-time Status Updates

**File: `src/core/status-broadcaster.ts`** (NEW FILE)

```typescript
import { EventEmitter } from 'events';
import { AutoIndexer, IndexingStatus } from './auto-indexer.js';

/**
 * Broadcasts real-time status updates to connected MCP clients
 */
export class StatusBroadcaster extends EventEmitter {
  private autoIndexer: AutoIndexer;
  private activeConnections = new Set<string>();
  
  constructor(autoIndexer: AutoIndexer) {
    super();
    this.autoIndexer = autoIndexer;
    this.setupStatusListening();
  }
  
  private setupStatusListening(): void {
    this.autoIndexer.on('statusChange', (dirPath: string, status: IndexingStatus) => {
      this.broadcastStatusUpdate(dirPath, status);
    });
  }
  
  private broadcastStatusUpdate(dirPath: string, status: IndexingStatus): void {
    const update = {
      type: 'indexing_status_update',
      dirPath,
      status,
      timestamp: new Date().toISOString()
    };
    
    // In a real MCP implementation, this would send notifications to connected clients
    // For now, we emit events that the MCP server can listen to
    this.emit('statusUpdate', update);
  }
  
  /**
   * Register a connection to receive status updates
   */
  registerConnection(connectionId: string): void {
    this.activeConnections.add(connectionId);
  }
  
  /**
   * Unregister a connection
   */
  unregisterConnection(connectionId: string): void {
    this.activeConnections.delete(connectionId);
  }
  
  /**
   * Get current status for all active directories
   */
  getAllStatuses(): Map<string, IndexingStatus> {
    // Return current status for all directories being tracked
    return new Map(); // Implementation would return actual statuses
  }
}
```

## Integration Points Summary

### In Phase 1 (Foundation)
1. Add `AutoIndexer` class with complete status tracking
2. Enhance `CodeGraphCore` with progress callbacks
3. Set up event-driven status updates

### In Phase 6 (MCP Interface)  
1. Add status reporting tools (`get_indexing_status`, `get_capabilities`, `wait_for_indexing`)
2. Add directory change detection in main server
3. Implement progressive tool handlers that adapt based on capabilities
4. Set up file watching for incremental updates

### In Phase 8 (Advanced Features)
1. Integrate with existing incremental indexing
2. Add real-time status broadcasting
3. Enhance context building to work progressively

## Usage Flow

1. **Claude Code starts in a directory**
   - MCP server detects working directory change
   - `AutoIndexer.onClaudeCodeStart()` is called
   - Background indexing begins if needed

2. **During indexing**
   - Tools adapt their behavior based on `getCapabilities()`
   - Status updates are broadcast via events
   - Users can check progress with `get_indexing_status`

3. **After indexing completes**
   - Full capabilities are available
   - Tools provide maximum intelligence
   - File watching maintains index freshness

## Error Handling

- Graceful degradation if indexing fails
- Clear error messages to users
- Fallback to basic capabilities
- Retry mechanisms for transient failures

## Performance Considerations

- Background indexing doesn't block main thread
- Progressive capability unlocking
- Incremental updates for file changes
- Efficient status tracking with minimal overhead

This implementation provides the seamless "infusion" experience where CodeGraph becomes a fundamental part of Claude Code's intelligence, automatically enhancing its capabilities without user intervention while providing clear feedback about what's available at any given moment.
