import { CodeGraphCore } from "../core/indexer.js";
import { AutoIndexer } from "../core/auto-indexer.js";
import {
  getArchitectureReal,
  getDependenciesReal,
  getHotspotsReal,
  getStatusReal,
  getMetricsReal
} from "./resources-implementation.js";

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
}

export class ResourceHandlers {
  private core: CodeGraphCore;
  private autoIndexer: AutoIndexer;

  constructor(core: CodeGraphCore, autoIndexer?: AutoIndexer) {
    this.core = core;
    this.autoIndexer = autoIndexer || new AutoIndexer(core);
  }

  getResources() {
    return [
      {
        uri: "codegraph://architecture",
        name: "Codebase Architecture",
        description: "High-level architecture overview of the current codebase",
        mimeType: "text/markdown",
      },
      {
        uri: "codegraph://dependencies",
        name: "Dependency Graph",
        description: "Project dependencies and relationships visualization",
        mimeType: "text/markdown",
      },
      {
        uri: "codegraph://hotspots",
        name: "Code Hotspots",
        description: "Frequently changed or complex areas in the codebase",
        mimeType: "text/markdown",
      },
      {
        uri: "codegraph://status",
        name: "Indexing Status",
        description: "Current status of CodeGraph indexing",
        mimeType: "text/markdown",
      },
      {
        uri: "codegraph://metrics",
        name: "Code Metrics",
        description: "Code quality metrics and statistics",
        mimeType: "text/markdown",
      },
    ];
  }

  async getResource(uri: string): Promise<ResourceContent> {
    const path = uri.replace("codegraph://", "");

    switch (path) {
      case "architecture":
        return await this.getArchitecture();
      case "dependencies":
        return await this.getDependencies();
      case "hotspots":
        return await this.getHotspots();
      case "status":
        return await this.getStatus();
      case "metrics":
        return await this.getMetrics();
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  private async getArchitecture(): Promise<ResourceContent> {
    return getArchitectureReal(this.core, this.autoIndexer);
  }

  private async getDependencies(): Promise<ResourceContent> {
    return getDependenciesReal(this.core, this.autoIndexer);
  }

  private async getHotspots(): Promise<ResourceContent> {
    return getHotspotsReal(this.core, this.autoIndexer);
  }

  private async getStatus(): Promise<ResourceContent> {
    return getStatusReal(this.core, this.autoIndexer);
  }

  private async getMetrics(): Promise<ResourceContent> {
    return getMetricsReal(this.core, this.autoIndexer);
  }

  private formatArchitecture(modules: any[], layers: any[], patterns: any[]): string {
    return `# Codebase Architecture

## Overview
Comprehensive architectural analysis of the codebase.

## Module Structure
${modules.map((m) => `- **${m.name}**: ${m.description}`).join("\n")}

## Architectural Layers
${layers.map((l) => `- **${l.name}**: ${l.components.join(", ")}`).join("\n")}

## Design Patterns
${patterns.map((p) => `- **${p.pattern}**: ${p.locations.join(", ")}`).join("\n")}

## Key Components
- Entry Points: Identified main entry points
- Core Services: Business logic components
- Data Layer: Database and storage
- External APIs: Integration points

## Recommendations
1. Follow established patterns
2. Maintain layer separation
3. Document architectural decisions`;
  }

  private async getModules(): Promise<any[]> {
    return [
      { name: "Core", description: "Core business logic" },
      { name: "API", description: "External API interfaces" },
      { name: "Utils", description: "Utility functions" },
    ];
  }

  private async detectLayers(): Promise<any[]> {
    return [
      { name: "Presentation", components: ["views", "components"] },
      { name: "Business", components: ["services", "handlers"] },
      { name: "Data", components: ["models", "repositories"] },
    ];
  }

  private async detectPatterns(): Promise<any[]> {
    return [
      { pattern: "MVC", locations: ["src/controllers", "src/models"] },
      { pattern: "Repository", locations: ["src/repositories"] },
      { pattern: "Factory", locations: ["src/factories"] },
    ];
  }

  private async analyzeDependencies(): Promise<any> {
    return {
      external: [
        { name: "express", version: "4.18.0" },
        { name: "react", version: "18.0.0" },
      ],
      internal: [
        { from: "services", to: "models" },
        { from: "controllers", to: "services" },
      ],
      circular: [],
    };
  }

  private async analyzeHotspots(): Promise<any> {
    return {
      frequent: [
        { file: "src/api/handlers.ts", changes: 25 },
        { file: "src/core/processor.ts", changes: 18 },
      ],
      complex: [
        { file: "src/algorithms/search.ts", score: 15 },
        { file: "src/parsers/ast.ts", score: 12 },
      ],
      large: [
        { file: "src/generated/types.ts", lines: 2500 },
        { file: "src/legacy/old-api.ts", lines: 1800 },
      ],
    };
  }

  private async calculateMetrics(): Promise<any> {
    return {
      files: 150,
      loc: 25000,
      languages: ["TypeScript", "JavaScript", "Python"],
      coverage: 75,
      documented: 65,
      typed: 85,
      avgComplexity: 8,
      maxComplexity: 25,
      debt: 120,
    };
  }
}