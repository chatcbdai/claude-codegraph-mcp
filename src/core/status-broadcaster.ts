import { EventEmitter } from "events";
import { AutoIndexer, IndexingStatus } from "./auto-indexer.js";

export interface StatusUpdate {
  type: string;
  dirPath: string;
  status: IndexingStatus;
  timestamp: string;
}

export class StatusBroadcaster extends EventEmitter {
  private autoIndexer: AutoIndexer;
  private activeConnections = new Set<string>();

  constructor(autoIndexer: AutoIndexer) {
    super();
    this.autoIndexer = autoIndexer;
    this.setupStatusListening();
  }

  private setupStatusListening(): void {
    this.autoIndexer.on("statusChange", (dirPath: string, status: IndexingStatus) => {
      this.broadcastStatusUpdate(dirPath, status);
    });
  }

  private broadcastStatusUpdate(dirPath: string, status: IndexingStatus): void {
    const update: StatusUpdate = {
      type: "indexing_status_update",
      dirPath,
      status,
      timestamp: new Date().toISOString(),
    };

    this.emit("statusUpdate", update);

    if (status.isComplete) {
      console.error(`[CodeGraph] ✅ Indexing complete for ${dirPath}`);
      console.error(`[CodeGraph] Available capabilities:`);
      console.error(`  - Syntax Analysis: ${status.capabilities.syntaxAnalysis ? "✅" : "❌"}`);
      console.error(`  - Graph Relationships: ${status.capabilities.graphRelationships ? "✅" : "❌"}`);
      console.error(`  - Semantic Search: ${status.capabilities.semanticSearch ? "✅" : "❌"}`);
      console.error(`  - Temporal Analysis: ${status.capabilities.temporalAnalysis ? "✅" : "❌"}`);
      console.error(`  - Query Intelligence: ${status.capabilities.queryIntelligence ? "✅" : "❌"}`);
    } else if (status.isIndexing) {
      const progressBar = this.createProgressBar(status.progress);
      console.error(`[CodeGraph] ${progressBar} ${status.progress}% - ${status.currentPhase}`);
    } else if (status.error) {
      console.error(`[CodeGraph] ❌ Indexing error: ${status.error}`);
    }
  }

  registerConnection(connectionId: string): void {
    this.activeConnections.add(connectionId);
    console.error(`[CodeGraph] Connection registered: ${connectionId}`);
  }

  unregisterConnection(connectionId: string): void {
    this.activeConnections.delete(connectionId);
    console.error(`[CodeGraph] Connection unregistered: ${connectionId}`);
  }

  getAllStatuses(): Map<string, IndexingStatus> {
    const statuses = new Map<string, IndexingStatus>();
    
    return statuses;
  }

  getConnectionCount(): number {
    return this.activeConnections.size;
  }

  private createProgressBar(progress: number): string {
    const width = 20;
    const filled = Math.floor((progress / 100) * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
  }
}