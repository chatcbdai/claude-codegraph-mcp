import { EventEmitter } from "events";
import path from "path";
import fs from "fs/promises";
import { CodeGraphCore } from "./indexer.js";
import { Logger } from "../utils/logger.js";

export interface IndexingStatus {
  isIndexing: boolean;
  isComplete: boolean;
  progress: number;
  currentPhase: "syntax" | "graph" | "semantic" | "temporal" | "complete";
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
  private logger: Logger;
  private coreIndexer: CodeGraphCore;

  constructor(coreIndexer: CodeGraphCore) {
    super();
    this.coreIndexer = coreIndexer;
    this.logger = new Logger("AutoIndexer");
  }

  async onClaudeCodeStart(workingDir: string): Promise<void> {
    try {
      const normalizedPath = path.resolve(workingDir);
      this.logger.info(`Claude Code started in: ${normalizedPath}`);

      const needsIndexing = await this.needsIndexing(normalizedPath);

      if (needsIndexing) {
        this.logger.info(`Starting background indexing for: ${normalizedPath}`);
        await this.startBackgroundIndexing(normalizedPath);
      } else {
        this.logger.info(`Directory already indexed: ${normalizedPath}`);
        await this.loadExistingStatus(normalizedPath);
      }
    } catch (error: any) {
      this.logger.error(`Error in onClaudeCodeStart: ${error.message}`);
      this.setErrorStatus(workingDir, error.message);
    }
  }

  private async needsIndexing(dirPath: string): Promise<boolean> {
    try {
      const indexPath = path.join(dirPath, ".codegraph");
      const indexExists = await this.fileExists(indexPath);

      if (!indexExists) {
        return true;
      }

      const isStale = await this.isIndexStale(dirPath);
      return isStale;
    } catch (error: any) {
      this.logger.warn(`Error checking indexing needs: ${error.message}`);
      return true;
    }
  }

  private async startBackgroundIndexing(dirPath: string): Promise<void> {
    if (this.activeIndexing.has(dirPath)) {
      this.logger.warn(`Indexing already active for: ${dirPath}`);
      return;
    }

    this.activeIndexing.add(dirPath);

    const status: IndexingStatus = {
      isIndexing: true,
      isComplete: false,
      progress: 0,
      currentPhase: "syntax",
      filesProcessed: 0,
      totalFiles: 0,
      capabilities: {
        syntaxAnalysis: false,
        graphRelationships: false,
        semanticSearch: false,
        temporalAnalysis: false,
        queryIntelligence: false,
      },
    };

    this.indexingStatus.set(dirPath, status);
    this.emit("statusChange", dirPath, status);

    try {
      const totalFiles = await this.countFiles(dirPath);
      status.totalFiles = totalFiles;
      this.updateStatus(dirPath, status);

      status.currentPhase = "syntax";
      await this.runSyntaxAnalysis(dirPath, status);
      status.capabilities.syntaxAnalysis = true;
      status.progress = 25;
      this.updateStatus(dirPath, status);

      status.currentPhase = "graph";
      await this.runGraphAnalysis(dirPath, status);
      status.capabilities.graphRelationships = true;
      status.progress = 50;
      this.updateStatus(dirPath, status);

      status.currentPhase = "semantic";
      await this.runSemanticAnalysis(dirPath, status);
      status.capabilities.semanticSearch = true;
      status.progress = 75;
      this.updateStatus(dirPath, status);

      status.currentPhase = "temporal";
      await this.runTemporalAnalysis(dirPath, status);
      status.capabilities.temporalAnalysis = true;
      status.progress = 90;
      this.updateStatus(dirPath, status);

      status.currentPhase = "complete";
      try {
        await this.finalizeIndexing(dirPath, status);
        // Only mark as complete if finalization succeeds
        status.capabilities.queryIntelligence = true;
        status.progress = 100;
        status.isIndexing = false;
        status.isComplete = true;
        this.updateStatus(dirPath, status);
      } catch (error: any) {
        this.logger.error(`Finalization failed: ${error.message}`);
        // Do NOT mark as complete if finalization fails
        status.error = error.message;
        status.isIndexing = false;
        status.isComplete = false;
        this.updateStatus(dirPath, status);
      }

      this.logger.info(`Indexing completed for: ${dirPath}`);
    } catch (error: any) {
      this.logger.error(`Indexing failed for ${dirPath}: ${error.message}`);
      this.setErrorStatus(dirPath, error.message);
    } finally {
      this.activeIndexing.delete(dirPath);
    }
  }

  getStatus(dirPath: string): IndexingStatus | null {
    const normalizedPath = path.resolve(dirPath);
    return this.indexingStatus.get(normalizedPath) || null;
  }

  isIndexingComplete(dirPath: string): boolean {
    const status = this.getStatus(dirPath);
    return status?.isComplete === true;
  }

  getCapabilities(dirPath: string): CapabilityStatus {
    const status = this.getStatus(dirPath);
    return (
      status?.capabilities || {
        syntaxAnalysis: false,
        graphRelationships: false,
        semanticSearch: false,
        temporalAnalysis: false,
        queryIntelligence: false,
      }
    );
  }

  private async countFiles(dirPath: string): Promise<number> {
    return await this.coreIndexer.countIndexableFiles(dirPath);
  }

  private async runSyntaxAnalysis(
    dirPath: string,
    status: IndexingStatus
  ): Promise<void> {
    await this.coreIndexer.runSyntaxPhase(dirPath, (processed, total) => {
      status.filesProcessed = processed;
      status.progress = Math.floor((processed / total) * 25);
      this.updateStatus(dirPath, status);
    });
  }

  private async runGraphAnalysis(
    dirPath: string,
    status: IndexingStatus
  ): Promise<void> {
    await this.coreIndexer.runGraphPhase(dirPath, (processed, total) => {
      const phaseProgress = Math.floor((processed / total) * 25);
      status.progress = 25 + phaseProgress;
      this.updateStatus(dirPath, status);
    });
  }

  private async runSemanticAnalysis(
    dirPath: string,
    status: IndexingStatus
  ): Promise<void> {
    await this.coreIndexer.runSemanticPhase(dirPath, (processed, total) => {
      const phaseProgress = Math.floor((processed / total) * 25);
      status.progress = 50 + phaseProgress;
      this.updateStatus(dirPath, status);
    });
  }

  private async runTemporalAnalysis(
    dirPath: string,
    status: IndexingStatus
  ): Promise<void> {
    await this.coreIndexer.runTemporalPhase(dirPath, (processed, total) => {
      const phaseProgress = Math.floor((processed / total) * 15);
      status.progress = 75 + phaseProgress;
      this.updateStatus(dirPath, status);
    });
  }

  private async finalizeIndexing(
    dirPath: string,
    status: IndexingStatus
  ): Promise<void> {
    try {
      this.logger.info(`Starting finalization for: ${dirPath}`);
      await this.coreIndexer.finalizeIndex(dirPath);
      this.logger.info(`Finalization complete, saving status for: ${dirPath}`);
      await this.saveIndexStatus(dirPath, status);
      this.logger.info(`Status saved successfully for: ${dirPath}`);
    } catch (error: any) {
      this.logger.error(`Error in finalizeIndexing: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
      throw error; // Re-throw to be caught by the main error handler
    }
  }

  private updateStatus(dirPath: string, status: IndexingStatus): void {
    this.indexingStatus.set(dirPath, { ...status });
    this.emit("statusChange", dirPath, status);
  }

  private setErrorStatus(dirPath: string, errorMessage: string): void {
    const status: IndexingStatus = {
      isIndexing: false,
      isComplete: false,
      progress: 0,
      currentPhase: "syntax",
      filesProcessed: 0,
      totalFiles: 0,
      error: errorMessage,
      capabilities: {
        syntaxAnalysis: false,
        graphRelationships: false,
        semanticSearch: false,
        temporalAnalysis: false,
        queryIntelligence: false,
      },
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
    return await this.coreIndexer.isIndexStale(dirPath);
  }

  private async loadExistingStatus(dirPath: string): Promise<void> {
    const status = await this.coreIndexer.loadIndexStatus(dirPath);
    if (status) {
      // Fix corrupted status that might be stuck at 90%
      if (status.isIndexing && status.progress === 90 && status.currentPhase === "complete") {
        this.logger.warn(`Detected corrupted indexing status for ${dirPath}, resetting...`);
        // Mark as complete if it was stuck
        status.isIndexing = false;
        status.isComplete = true;
        status.progress = 100;
        status.capabilities.queryIntelligence = true;
        // Save the corrected status
        await this.coreIndexer.saveIndexStatus(dirPath, status);
      }
      this.indexingStatus.set(dirPath, status);
      this.emit("statusChange", dirPath, status);
    }
  }

  private async saveIndexStatus(
    dirPath: string,
    status: IndexingStatus
  ): Promise<void> {
    await this.coreIndexer.saveIndexStatus(dirPath, status);
  }
}