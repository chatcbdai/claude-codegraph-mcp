import { CodeGraphCore } from "../core/indexer.js";
import { AutoIndexer } from "../core/auto-indexer.js";
import { CodeGraph } from "../core/graph.js";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";

export interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export async function findImplementationReal(
  args: any,
  autoIndexer: AutoIndexer
): Promise<ToolResult> {
  const query = args.query;
  const context = args.context || "";
  const workingDir = args.path || process.cwd();

  const capabilities = autoIndexer.getCapabilities(workingDir);
  if (!capabilities.syntaxAnalysis) {
    return {
      content: [
        {
          type: "text",
          text: "⏳ Search requires indexing. Starting background indexing now...",
        },
      ],
    };
  }

  try {
    // Get the actual database path for this project
    const projectHash = crypto.createHash('md5').update(workingDir).digest('hex').substring(0, 8);
    const projectName = path.basename(workingDir);
    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
    
    // Check if database exists
    try {
      await fs.access(dbPath);
    } catch {
      return {
        content: [
          {
            type: "text",
            text: "Database not found. Please ensure indexing has completed.",
          },
        ],
      };
    }

    const db = new Database(dbPath, { readonly: true });
    
    let namedComponents: any[] = [];
    
    // If semantic search is available and embeddings exist, use semantic search
    if (capabilities.semanticSearch) {
      // First check if we have embeddings
      const hasEmbeddings = db.prepare(`
        SELECT COUNT(*) as count FROM nodes WHERE embedding IS NOT NULL
      `).get() as any;
      
      if (hasEmbeddings.count > 0) {
        // Use semantic search
        const { EmbeddingEngine } = await import('../core/embeddings.js');
        const embeddings = new EmbeddingEngine();
        await embeddings.initialize();
        
        // Generate embedding for the query
        const queryEmbedding = await embeddings.embed(query + " " + context);
        const queryBuffer = Buffer.from(queryEmbedding.buffer);
        
        // Get all nodes with embeddings
        const nodesWithEmbeddings = db.prepare(`
          SELECT id, type, name, file, content, metadata, embedding
          FROM nodes
          WHERE embedding IS NOT NULL AND type IN ('function', 'class', 'method')
        `).all() as any[];
        
        // Calculate similarities
        const results: Array<{ node: any; score: number }> = [];
        for (const node of nodesWithEmbeddings) {
          if (node.embedding) {
            const nodeEmbedding = new Float32Array(node.embedding.buffer);
            const similarity = embeddings.cosineSimilarity(queryEmbedding, nodeEmbedding);
            results.push({ node, score: similarity });
          }
        }
        
        // Sort by similarity and take top results
        results.sort((a, b) => b.score - a.score);
        namedComponents = results.slice(0, 20).map(r => ({
          ...r.node,
          similarity_score: r.score
        }));
        
        // Add exact name matches with boosted score
        const exactMatches = db.prepare(`
          SELECT id, type, name, file, content, metadata
          FROM nodes
          WHERE type IN ('function', 'class', 'method') AND name = ?
        `).all(query) as any[];
        
        for (const match of exactMatches) {
          if (!namedComponents.find(c => c.id === match.id)) {
            namedComponents.unshift({ ...match, similarity_score: 1.0 });
          }
        }
      }
    }
    
    // Fallback to text search if semantic search not available or no results
    if (namedComponents.length === 0) {
      const searchTerm = `%${query}%`;
      
      // Search in function and class names
      namedComponents = db.prepare(`
        SELECT id, type, name, file, content, metadata
        FROM nodes
        WHERE (type IN ('function', 'class', 'method')) 
        AND (name LIKE ? OR content LIKE ?)
        ORDER BY 
          CASE 
            WHEN name = ? THEN 0
            WHEN name LIKE ? THEN 1
            ELSE 2
          END,
          length(name)
        LIMIT 20
      `).all(searchTerm, searchTerm, query, `${query}%`) as any[];
    }
    
    // Search in file paths
    const searchTerm = `%${query}%`;
    const fileMatches = db.prepare(`
      SELECT DISTINCT file, type, COUNT(*) as component_count
      FROM nodes
      WHERE file LIKE ?
      GROUP BY file
      ORDER BY component_count DESC
      LIMIT 10
    `).all(searchTerm) as any[];
    
    db.close();
    
    // Format results
    let resultText = `# Implementation Search Results\n\n**Query**: "${query}"\n`;
    if (context) {
      resultText += `**Context**: ${context}\n`;
    }
    resultText += `\n`;
    
    if (namedComponents.length === 0 && fileMatches.length === 0) {
      resultText += `## No Results Found\n\n`;
      resultText += `No implementations found matching "${query}".\n\n`;
      resultText += `Suggestions:\n`;
      resultText += `- Try a more general search term\n`;
      resultText += `- Check if the codebase has been fully indexed\n`;
      resultText += `- Use different keywords or partial matches\n`;
    } else {
      if (namedComponents.length > 0) {
        const isSemanticSearch = namedComponents[0].similarity_score !== undefined;
        resultText += `## Components Found (${namedComponents.length})\n`;
        if (isSemanticSearch) {
          resultText += `*Using semantic search with embeddings*\n\n`;
        }
        
        for (const component of namedComponents.slice(0, 10)) {
          const metadata = component.metadata ? JSON.parse(component.metadata) : {};
          resultText += `### ${component.name} (${component.type})`;
          if (component.similarity_score !== undefined) {
            resultText += ` - ${(component.similarity_score * 100).toFixed(1)}% match`;
          }
          resultText += `\n`;
          resultText += `**File**: \`${component.file}\`\n`;
          if (metadata.startLine && metadata.endLine) {
            resultText += `**Location**: Lines ${metadata.startLine}-${metadata.endLine}\n`;
          }
          if (component.content && component.content.length > 0) {
            const preview = component.content.substring(0, 200).replace(/\n/g, ' ');
            resultText += `**Preview**: \`${preview}${component.content.length > 200 ? '...' : ''}\`\n`;
          }
          resultText += `\n`;
        }
      }
      
      if (fileMatches.length > 0) {
        resultText += `## Files Containing Matches (${fileMatches.length})\n\n`;
        for (const file of fileMatches.slice(0, 5)) {
          resultText += `- \`${file.file}\` (${file.component_count} components)\n`;
        }
        resultText += `\n`;
      }
    }
    
    resultText += `## Search Capabilities\n`;
    resultText += `- ${capabilities.syntaxAnalysis ? '✅' : '⏳'} Syntax Analysis\n`;
    resultText += `- ${capabilities.graphRelationships ? '✅' : '⏳'} Relationship Tracking\n`;
    resultText += `- ${capabilities.semanticSearch ? '✅' : '⏳'} Semantic Search\n`;
    resultText += `\n`;
    resultText += `## Next Steps\n`;
    resultText += `- Use \`trace_execution\` to follow call chains\n`;
    resultText += `- Use \`impact_analysis\` to see what depends on these components\n`;
    resultText += `- Use \`explain_architecture\` to understand the module structure\n`;
    
    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error searching for implementations: ${error.message}\n\nMake sure indexing has completed for this project.`,
        },
      ],
    };
  }
}

export async function traceExecutionReal(
  args: any,
  autoIndexer: AutoIndexer,
  graph: CodeGraph
): Promise<ToolResult> {
  const entryPoint = args.entryPoint;
  const maxDepth = args.maxDepth || 5;
  const workingDir = args.path || process.cwd();

  const capabilities = autoIndexer.getCapabilities(workingDir);
  if (!capabilities.graphRelationships) {
    return {
      content: [
        {
          type: "text",
          text: "⏳ Execution tracing requires graph analysis. Please wait for indexing to reach that phase.",
        },
      ],
    };
  }

  try {
    // Initialize graph for this project
    await graph.initialize(workingDir);
    
    // Find the entry point node
    const projectHash = crypto.createHash('md5').update(workingDir).digest('hex').substring(0, 8);
    const projectName = path.basename(workingDir);
    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
    
    const db = new Database(dbPath, { readonly: true });
    
    // Search for the entry point - prioritize functions and methods over files
    let entryNodes = db.prepare(`
      SELECT id, type, name, file 
      FROM nodes 
      WHERE name = ? AND type IN ('function', 'method', 'class')
      LIMIT 1
    `).all(entryPoint) as any[];
    
    // If exact match not found, try fuzzy match
    if (entryNodes.length === 0) {
      entryNodes = db.prepare(`
        SELECT id, type, name, file 
        FROM nodes 
        WHERE name LIKE ? AND type IN ('function', 'method', 'class')
        ORDER BY LENGTH(name)
        LIMIT 5
      `).all(`%${entryPoint}%`) as any[];
    }
    
    // If still not found, try broader search
    if (entryNodes.length === 0) {
      entryNodes = db.prepare(`
        SELECT id, type, name, file 
        FROM nodes 
        WHERE (name LIKE ? OR id LIKE ?) AND type NOT IN ('file')
        LIMIT 5
      `).all(`%${entryPoint}%`, `%${entryPoint}%`) as any[];
    }
    
    if (entryNodes.length === 0) {
      db.close();
      return {
        content: [
          {
            type: "text",
            text: `No entry point found matching "${entryPoint}". Please specify a valid function name, class name, or file path.`,
          },
        ],
      };
    }
    
    const startNode = entryNodes[0];
    
    // Trace execution paths
    const visited = new Set<string>();
    const executionPaths: any[] = [];
    const queue = [{ node: startNode, path: [startNode], depth: 0 }];
    
    while (queue.length > 0 && executionPaths.length < 10) {
      const current = queue.shift()!;
      
      if (current.depth >= maxDepth) continue;
      if (visited.has(current.node.id)) continue;
      visited.add(current.node.id);
      
      // Get relationships from this node
      const relationships = db.prepare(`
        SELECT r.type, r.to_node, n.name, n.type as node_type, n.file
        FROM relationships r
        JOIN nodes n ON r.to_node = n.id
        WHERE r.from_node = ?
        AND r.type IN ('CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS')
      `).all(current.node.id) as any[];
      
      if (relationships.length === 0 && current.path.length > 1) {
        executionPaths.push(current.path);
      }
      
      for (const rel of relationships) {
        const nextNode = {
          id: rel.to_node,
          name: rel.name,
          type: rel.node_type,
          file: rel.file,
          relationshipType: rel.type,
        };
        
        queue.push({
          node: nextNode,
          path: [...current.path, nextNode],
          depth: current.depth + 1,
        });
      }
    }
    
    db.close();
    
    // Format the execution trace
    let resultText = `# Execution Trace\n\n`;
    resultText += `**Entry Point**: ${startNode.name} (${startNode.type})\n`;
    resultText += `**File**: \`${startNode.file}\`\n`;
    resultText += `**Max Depth**: ${maxDepth}\n\n`;
    
    if (executionPaths.length === 0 && visited.size === 1) {
      resultText += `## No Execution Paths Found\n\n`;
      resultText += `The component "${entryPoint}" doesn't appear to call other functions or have dependencies tracked.\n\n`;
      resultText += `This could mean:\n`;
      resultText += `- It's a leaf function with no calls\n`;
      resultText += `- Dependencies haven't been fully analyzed\n`;
      resultText += `- The component is isolated\n`;
    } else {
      resultText += `## Execution Paths Found (${Math.min(executionPaths.length, 5)} shown)\n\n`;
      
      for (let i = 0; i < Math.min(executionPaths.length, 5); i++) {
        const path = executionPaths[i];
        resultText += `### Path ${i + 1}\n`;
        for (let j = 0; j < path.length; j++) {
          const node = path[j];
          const indent = '  '.repeat(j);
          const arrow = j > 0 ? '→ ' : '';
          const relType = node.relationshipType ? ` (${node.relationshipType})` : '';
          resultText += `${indent}${arrow}**${node.name}**${relType}\n`;
          if (j === 0 || node.file !== path[j - 1].file) {
            resultText += `${indent}  File: \`${node.file}\`\n`;
          }
        }
        resultText += `\n`;
      }
      
      resultText += `## Statistics\n`;
      resultText += `- **Nodes Visited**: ${visited.size}\n`;
      resultText += `- **Paths Found**: ${executionPaths.length}\n`;
      resultText += `- **Max Depth Reached**: ${Math.min(maxDepth, executionPaths.reduce((max, p) => Math.max(max, p.length - 1), 0))}\n`;
    }
    
    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error tracing execution: ${error.message}\n\nMake sure indexing has completed and the entry point exists.`,
        },
      ],
    };
  }
}

export async function impactAnalysisReal(
  args: any,
  autoIndexer: AutoIndexer,
  graph: CodeGraph
): Promise<ToolResult> {
  const component = args.component;
  const changeType = args.changeType || "modify";
  const workingDir = args.path || process.cwd();

  const capabilities = autoIndexer.getCapabilities(workingDir);
  if (!capabilities.graphRelationships) {
    return {
      content: [
        {
          type: "text",
          text: "⏳ Impact analysis requires relationship mapping. Indexing in progress...",
        },
      ],
    };
  }

  try {
    // Initialize graph for this project  
    await graph.initialize(workingDir);
    
    const projectHash = crypto.createHash('md5').update(workingDir).digest('hex').substring(0, 8);
    const projectName = path.basename(workingDir);
    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
    
    const db = new Database(dbPath, { readonly: true });
    
    // Find the component
    const componentNodes = db.prepare(`
      SELECT id, type, name, file 
      FROM nodes 
      WHERE name LIKE ? OR id LIKE ? OR file LIKE ?
      LIMIT 1
    `).all(`%${component}%`, `%${component}%`, `%${component}%`) as any[];
    
    if (componentNodes.length === 0) {
      db.close();
      return {
        content: [
          {
            type: "text",
            text: `Component "${component}" not found. Please specify a valid function name, class name, or file path.`,
          },
        ],
      };
    }
    
    const targetNode = componentNodes[0];
    
    // Find direct dependents (what depends on this)
    const directDependents = db.prepare(`
      SELECT n.id, n.name, n.type, n.file, r.type as rel_type
      FROM relationships r
      JOIN nodes n ON r.from_node = n.id
      WHERE r.to_node = ?
    `).all(targetNode.id) as any[];
    
    // Find direct dependencies (what this depends on)
    const directDependencies = db.prepare(`
      SELECT n.id, n.name, n.type, n.file, r.type as rel_type
      FROM relationships r
      JOIN nodes n ON r.to_node = n.id
      WHERE r.from_node = ?
    `).all(targetNode.id) as any[];
    
    // Find indirect impact (2 levels deep)
    const indirectDependents = db.prepare(`
      WITH RECURSIVE impact AS (
        SELECT n.id, n.name, n.type, n.file, 1 as level
        FROM relationships r
        JOIN nodes n ON r.from_node = n.id
        WHERE r.to_node = ?
        UNION
        SELECT n.id, n.name, n.type, n.file, i.level + 1
        FROM relationships r
        JOIN nodes n ON r.from_node = n.id
        JOIN impact i ON r.to_node = i.id
        WHERE i.level < 2
      )
      SELECT DISTINCT id, name, type, file, MIN(level) as level
      FROM impact
      WHERE level > 1
      GROUP BY id
    `).all(targetNode.id) as any[];
    
    db.close();
    
    // Calculate impact score
    const impactScore = directDependents.length * 10 + indirectDependents.length * 5 + directDependencies.length * 2;
    const riskLevel = impactScore > 50 ? "HIGH" : impactScore > 20 ? "MEDIUM" : "LOW";
    
    // Format results
    let resultText = `# Impact Analysis\n\n`;
    resultText += `**Component**: ${targetNode.name} (${targetNode.type})\n`;
    resultText += `**File**: \`${targetNode.file}\`\n`;
    resultText += `**Change Type**: ${changeType}\n\n`;
    
    resultText += `## Impact Summary\n`;
    resultText += `- **Risk Level**: ${riskLevel}\n`;
    resultText += `- **Impact Score**: ${impactScore}\n`;
    resultText += `- **Direct Dependents**: ${directDependents.length}\n`;
    resultText += `- **Indirect Dependents**: ${indirectDependents.length}\n`;
    resultText += `- **Dependencies**: ${directDependencies.length}\n\n`;
    
    if (directDependents.length > 0) {
      resultText += `## Direct Impact (Components that depend on this)\n\n`;
      for (const dep of directDependents.slice(0, 10)) {
        resultText += `- **${dep.name}** (${dep.type}) - ${dep.rel_type}\n`;
        resultText += `  File: \`${dep.file}\`\n`;
      }
      if (directDependents.length > 10) {
        resultText += `\n...and ${directDependents.length - 10} more\n`;
      }
      resultText += `\n`;
    }
    
    if (indirectDependents.length > 0) {
      resultText += `## Indirect Impact (2 levels deep)\n\n`;
      for (const dep of indirectDependents.slice(0, 5)) {
        resultText += `- **${dep.name}** (${dep.type}) - Level ${dep.level}\n`;
        resultText += `  File: \`${dep.file}\`\n`;
      }
      if (indirectDependents.length > 5) {
        resultText += `\n...and ${indirectDependents.length - 5} more\n`;
      }
      resultText += `\n`;
    }
    
    if (directDependencies.length > 0) {
      resultText += `## Dependencies (What this component needs)\n\n`;
      for (const dep of directDependencies.slice(0, 10)) {
        resultText += `- **${dep.name}** (${dep.type}) - ${dep.rel_type}\n`;
        resultText += `  File: \`${dep.file}\`\n`;
      }
      resultText += `\n`;
    }
    
    resultText += `## Recommendations\n`;
    if (riskLevel === "HIGH") {
      resultText += `- ⚠️ **High Risk Change**: This component is heavily depended upon\n`;
      resultText += `- Consider breaking the change into smaller steps\n`;
      resultText += `- Ensure comprehensive testing of all dependent components\n`;
      resultText += `- Document the change clearly for other developers\n`;
    } else if (riskLevel === "MEDIUM") {
      resultText += `- ⚠️ **Moderate Risk**: Several components depend on this\n`;
      resultText += `- Test the direct dependents thoroughly\n`;
      resultText += `- Review the impact on indirect dependents\n`;
    } else {
      resultText += `- ✅ **Low Risk**: This component has minimal dependencies\n`;
      resultText += `- Standard testing should be sufficient\n`;
      resultText += `- Change can be made with confidence\n`;
    }
    
    if (changeType === "delete") {
      resultText += `\n### Delete Impact\n`;
      if (directDependents.length > 0) {
        resultText += `- ❌ Cannot safely delete - ${directDependents.length} components depend on this\n`;
        resultText += `- Must update dependent components first\n`;
      } else {
        resultText += `- ✅ Can be safely deleted - no direct dependents found\n`;
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error analyzing impact: ${error.message}\n\nMake sure indexing has completed and the component exists.`,
        },
      ],
    };
  }
}

export async function explainArchitectureReal(
  args: any,
  autoIndexer: AutoIndexer
): Promise<ToolResult> {
  const scope = args.scope || process.cwd();
  const level = args.level || "high";
  const workingDir = path.isAbsolute(scope) ? scope : process.cwd();

  const capabilities = autoIndexer.getCapabilities(workingDir);

  try {
    const projectHash = crypto.createHash('md5').update(workingDir).digest('hex').substring(0, 8);
    const projectName = path.basename(workingDir);
    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
    
    // Check if database exists
    try {
      await fs.access(dbPath);
    } catch {
      return {
        content: [
          {
            type: "text",
            text: "Database not found. Please ensure indexing has completed.",
          },
        ],
      };
    }

    const db = new Database(dbPath, { readonly: true });
    
    // Analyze module structure
    const fileStats = db.prepare(`
      SELECT 
        file,
        COUNT(*) as component_count,
        GROUP_CONCAT(DISTINCT type) as types
      FROM nodes
      WHERE type IN ('function', 'class', 'method')
      GROUP BY file
      ORDER BY component_count DESC
    `).all() as any[];
    
    // Detect modules/directories
    const modules = new Map<string, any>();
    for (const fileStat of fileStats) {
      const dir = path.dirname(fileStat.file);
      if (!modules.has(dir)) {
        modules.set(dir, {
          path: dir,
          files: 0,
          components: 0,
          types: new Set(),
        });
      }
      const module = modules.get(dir)!;
      module.files++;
      module.components += fileStat.component_count;
      fileStat.types.split(',').forEach((t: string) => module.types.add(t));
    }
    
    // Get relationship statistics
    const relationshipStats = db.prepare(`
      SELECT type, COUNT(*) as count
      FROM relationships
      GROUP BY type
      ORDER BY count DESC
    `).all() as any[];
    
    // Get most connected components (architectural centers)
    const architecturalCenters = db.prepare(`
      SELECT 
        n.name, 
        n.type, 
        n.file,
        COUNT(DISTINCT r1.from_node) as dependents,
        COUNT(DISTINCT r2.to_node) as dependencies
      FROM nodes n
      LEFT JOIN relationships r1 ON n.id = r1.to_node
      LEFT JOIN relationships r2 ON n.id = r2.from_node
      WHERE n.type IN ('class', 'function')
      GROUP BY n.id
      ORDER BY (dependents + dependencies) DESC
      LIMIT 10
    `).all() as any[];
    
    db.close();
    
    // Format architecture explanation
    let resultText = `# Architecture Explanation\n\n`;
    resultText += `**Scope**: ${scope}\n`;
    resultText += `**Analysis Level**: ${level}\n\n`;
    
    resultText += `## Project Structure\n\n`;
    
    // Show top modules
    const sortedModules = Array.from(modules.values())
      .sort((a, b) => b.components - a.components)
      .slice(0, 10);
    
    resultText += `### Key Modules\n\n`;
    for (const module of sortedModules) {
      const moduleName = module.path.replace(workingDir, '').replace(/^\//, '') || 'root';
      resultText += `- **${moduleName}**\n`;
      resultText += `  - Files: ${module.files}\n`;
      resultText += `  - Components: ${module.components}\n`;
      resultText += `  - Types: ${Array.from(module.types).join(', ')}\n`;
    }
    resultText += `\n`;
    
    resultText += `## Architectural Patterns\n\n`;
    
    // Detect patterns based on directory names and structure
    const patterns: string[] = [];
    const moduleNames = Array.from(modules.keys());
    
    if (moduleNames.some(m => m.includes('controller') || m.includes('handler'))) {
      patterns.push("MVC/Controller pattern detected");
    }
    if (moduleNames.some(m => m.includes('service') || m.includes('provider'))) {
      patterns.push("Service layer pattern detected");
    }
    if (moduleNames.some(m => m.includes('model') || m.includes('entity'))) {
      patterns.push("Data model layer detected");
    }
    if (moduleNames.some(m => m.includes('test') || m.includes('spec'))) {
      patterns.push("Test structure present");
    }
    if (moduleNames.some(m => m.includes('api') || m.includes('route'))) {
      patterns.push("API layer detected");
    }
    
    if (patterns.length > 0) {
      for (const pattern of patterns) {
        resultText += `- ${pattern}\n`;
      }
    } else {
      resultText += `- No clear architectural patterns detected\n`;
    }
    resultText += `\n`;
    
    resultText += `## Relationship Analysis\n\n`;
    for (const stat of relationshipStats) {
      resultText += `- **${stat.type}**: ${stat.count} relationships\n`;
    }
    resultText += `\n`;
    
    resultText += `## Architectural Centers\n`;
    resultText += `These components are most connected and likely central to the architecture:\n\n`;
    
    for (const center of architecturalCenters.slice(0, 5)) {
      resultText += `- **${center.name}** (${center.type})\n`;
      resultText += `  - File: \`${center.file}\`\n`;
      resultText += `  - ${center.dependents} components depend on this\n`;
      resultText += `  - Depends on ${center.dependencies} components\n`;
    }
    resultText += `\n`;
    
    if (level === "detailed") {
      resultText += `## Detailed Analysis\n\n`;
      resultText += `### Complexity Indicators\n`;
      resultText += `- **Total Modules**: ${modules.size}\n`;
      resultText += `- **Total Components**: ${fileStats.reduce((sum, f) => sum + f.component_count, 0)}\n`;
      resultText += `- **Average Components per File**: ${(fileStats.reduce((sum, f) => sum + f.component_count, 0) / fileStats.length).toFixed(1)}\n`;
      resultText += `\n`;
    }
    
    resultText += `## Recommendations\n`;
    
    const avgComponentsPerFile = fileStats.reduce((sum, f) => sum + f.component_count, 0) / fileStats.length;
    if (avgComponentsPerFile > 10) {
      resultText += `- Consider splitting large files - average of ${avgComponentsPerFile.toFixed(1)} components per file\n`;
    }
    
    if (!patterns.includes("Test structure present")) {
      resultText += `- Add test coverage - no test structure detected\n`;
    }
    
    if (architecturalCenters[0] && architecturalCenters[0].dependents > 20) {
      resultText += `- Review ${architecturalCenters[0].name} - it has ${architecturalCenters[0].dependents} dependents\n`;
    }
    
    resultText += `- Use \`impact_analysis\` before modifying architectural centers\n`;
    resultText += `- Use \`find_implementation\` to locate specific patterns\n`;
    
    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error explaining architecture: ${error.message}\n\nMake sure indexing has completed for this project.`,
        },
      ],
    };
  }
}