import { CodeGraphCore } from "../core/indexer.js";
import { AutoIndexer } from "../core/auto-indexer.js";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import { execSync } from "child_process";

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
}

async function getDatabasePath(workingDir: string): Promise<string | null> {
  try {
    const projectHash = crypto.createHash('md5').update(workingDir).digest('hex').substring(0, 8);
    const projectName = path.basename(workingDir);
    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
    
    await fs.access(dbPath);
    return dbPath;
  } catch {
    return null;
  }
}

export async function getArchitectureReal(
  core: CodeGraphCore,
  autoIndexer: AutoIndexer
): Promise<ResourceContent> {
  const workingDir = core.getProjectPath();
  const dbPath = await getDatabasePath(workingDir);
  
  if (!dbPath) {
    return {
      uri: "codegraph://architecture",
      mimeType: "text/markdown",
      text: "# Architecture\n\nNo indexed data available. Please ensure indexing has completed.",
    };
  }
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Get module structure by analyzing file paths
    const files = db.prepare(`
      SELECT DISTINCT file, COUNT(*) as component_count
      FROM nodes
      WHERE type IN ('function', 'class', 'method')
      GROUP BY file
      ORDER BY file
    `).all() as any[];
    
    // Group files by directory to identify modules
    const moduleMap = new Map<string, any>();
    for (const file of files) {
      const dir = path.dirname(file.file);
      const parts = dir.split('/').filter(p => p);
      
      // Create hierarchical module structure
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!moduleMap.has(currentPath)) {
          moduleMap.set(currentPath, {
            path: currentPath,
            name: part,
            files: [],
            totalComponents: 0,
            submodules: new Set<string>(),
          });
        }
        
        // Track parent-child relationships
        if (currentPath !== part) {
          const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
          const parent = moduleMap.get(parentPath);
          if (parent) {
            parent.submodules.add(currentPath);
          }
        }
      }
      
      // Add file to its immediate directory
      const immediateDir = path.dirname(file.file).replace(/^\//, '');
      const module = moduleMap.get(immediateDir);
      if (module) {
        module.files.push(path.basename(file.file));
        module.totalComponents += file.component_count;
      }
    }
    
    // Get architectural layers by analyzing imports
    const layers = db.prepare(`
      SELECT DISTINCT 
        CASE 
          WHEN file LIKE '%controller%' OR file LIKE '%handler%' OR file LIKE '%route%' THEN 'Presentation'
          WHEN file LIKE '%service%' OR file LIKE '%business%' OR file LIKE '%logic%' THEN 'Business'
          WHEN file LIKE '%model%' OR file LIKE '%entity%' OR file LIKE '%schema%' THEN 'Data'
          WHEN file LIKE '%util%' OR file LIKE '%helper%' OR file LIKE '%common%' THEN 'Utility'
          WHEN file LIKE '%test%' OR file LIKE '%spec%' THEN 'Testing'
          ELSE 'Core'
        END as layer,
        COUNT(DISTINCT file) as file_count
      FROM nodes
      WHERE type IN ('function', 'class')
      GROUP BY layer
    `).all() as any[];
    
    // Detect design patterns
    const patterns = [];
    
    // Check for MVC pattern
    const hasControllers = files.some(f => f.file.includes('controller'));
    const hasModels = files.some(f => f.file.includes('model'));
    const hasViews = files.some(f => f.file.includes('view') || f.file.includes('component'));
    if (hasControllers && hasModels) {
      patterns.push({ pattern: "MVC/MVP", confidence: hasViews ? "High" : "Medium" });
    }
    
    // Check for Repository pattern
    const hasRepositories = files.some(f => f.file.includes('repository'));
    if (hasRepositories) {
      patterns.push({ pattern: "Repository", confidence: "High" });
    }
    
    // Check for Service layer
    const hasServices = files.some(f => f.file.includes('service'));
    if (hasServices) {
      patterns.push({ pattern: "Service Layer", confidence: "High" });
    }
    
    // Get entry points
    const entryPoints = db.prepare(`
      SELECT DISTINCT file, name
      FROM nodes
      WHERE (name LIKE '%main%' OR name LIKE '%index%' OR name LIKE '%app%')
      AND type = 'function'
      LIMIT 5
    `).all() as any[];
    
    db.close();
    
    // Format the architecture document
    let content = `# Codebase Architecture\n\n`;
    content += `**Project**: ${workingDir}\n`;
    content += `**Analysis Date**: ${new Date().toISOString()}\n\n`;
    
    content += `## Module Structure\n\n`;
    
    // Show top-level modules
    const topModules = Array.from(moduleMap.values())
      .filter(m => !m.path.includes('/'))
      .sort((a, b) => b.totalComponents - a.totalComponents)
      .slice(0, 10);
    
    if (topModules.length > 0) {
      content += `### Top-Level Modules\n\n`;
      for (const module of topModules) {
        content += `#### ${module.name}\n`;
        content += `- **Files**: ${module.files.length}\n`;
        content += `- **Components**: ${module.totalComponents}\n`;
        if (module.submodules.size > 0) {
          content += `- **Submodules**: ${module.submodules.size}\n`;
        }
        content += `\n`;
      }
    }
    
    content += `## Architectural Layers\n\n`;
    for (const layer of layers) {
      content += `- **${layer.layer}**: ${layer.file_count} files\n`;
    }
    content += `\n`;
    
    if (patterns.length > 0) {
      content += `## Design Patterns Detected\n\n`;
      for (const pattern of patterns) {
        content += `- **${pattern.pattern}** (Confidence: ${pattern.confidence})\n`;
      }
      content += `\n`;
    }
    
    if (entryPoints.length > 0) {
      content += `## Entry Points\n\n`;
      for (const entry of entryPoints) {
        content += `- \`${entry.name}\` in \`${entry.file}\`\n`;
      }
      content += `\n`;
    }
    
    content += `## Architecture Characteristics\n\n`;
    content += `- **Total Modules**: ${moduleMap.size}\n`;
    content += `- **Total Files**: ${files.length}\n`;
    content += `- **Average Components per File**: ${(files.reduce((sum, f) => sum + f.component_count, 0) / files.length).toFixed(1)}\n`;
    
    return {
      uri: "codegraph://architecture",
      mimeType: "text/markdown",
      text: content,
    };
  } catch (error: any) {
    return {
      uri: "codegraph://architecture",
      mimeType: "text/markdown",
      text: `# Architecture\n\nError analyzing architecture: ${error.message}`,
    };
  }
}

export async function getDependenciesReal(
  core: CodeGraphCore,
  autoIndexer: AutoIndexer
): Promise<ResourceContent> {
  const workingDir = core.getProjectPath();
  const dbPath = await getDatabasePath(workingDir);
  
  let content = `# Dependency Graph\n\n`;
  content += `**Project**: ${workingDir}\n\n`;
  
  // Get external dependencies from package.json, requirements.txt, etc.
  const externalDeps: any[] = [];
  
  try {
    // Check for Node.js project
    const packageJsonPath = path.join(workingDir, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          externalDeps.push({ name, version, type: 'runtime' });
        }
      }
      
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          externalDeps.push({ name, version, type: 'dev' });
        }
      }
    } catch {}
    
    // Check for Python project
    const requirementsPath = path.join(workingDir, 'requirements.txt');
    try {
      const requirements = await fs.readFile(requirementsPath, 'utf-8');
      const lines = requirements.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      for (const line of lines) {
        const match = line.match(/^([^=<>]+)([=<>].+)?$/);
        if (match) {
          externalDeps.push({ name: match[1], version: match[2] || 'latest', type: 'runtime' });
        }
      }
    } catch {}
    
    // Check for Go project
    const goModPath = path.join(workingDir, 'go.mod');
    try {
      const goMod = await fs.readFile(goModPath, 'utf-8');
      const requireRegex = /require\s+([^\s]+)\s+([^\s]+)/g;
      let match;
      while ((match = requireRegex.exec(goMod)) !== null) {
        externalDeps.push({ name: match[1], version: match[2], type: 'runtime' });
      }
    } catch {}
  } catch {}
  
  content += `## External Dependencies (${externalDeps.length})\n\n`;
  
  if (externalDeps.length > 0) {
    content += `### Runtime Dependencies\n`;
    const runtimeDeps = externalDeps.filter(d => d.type === 'runtime');
    for (const dep of runtimeDeps.slice(0, 20)) {
      content += `- **${dep.name}**: ${dep.version}\n`;
    }
    if (runtimeDeps.length > 20) {
      content += `\n...and ${runtimeDeps.length - 20} more\n`;
    }
    content += `\n`;
    
    const devDeps = externalDeps.filter(d => d.type === 'dev');
    if (devDeps.length > 0) {
      content += `### Development Dependencies\n`;
      for (const dep of devDeps.slice(0, 10)) {
        content += `- **${dep.name}**: ${dep.version}\n`;
      }
      if (devDeps.length > 10) {
        content += `\n...and ${devDeps.length - 10} more\n`;
      }
      content += `\n`;
    }
  }
  
  // Get internal dependencies from database
  if (dbPath) {
    try {
      const db = new Database(dbPath, { readonly: true });
      
      // Get file-to-file dependencies
      const fileDeps = db.prepare(`
        SELECT DISTINCT 
          n1.file as from_file,
          n2.file as to_file,
          COUNT(*) as connection_count
        FROM relationships r
        JOIN nodes n1 ON r.from_node = n1.id
        JOIN nodes n2 ON r.to_node = n2.id
        WHERE n1.file != n2.file
        GROUP BY n1.file, n2.file
        ORDER BY connection_count DESC
        LIMIT 20
      `).all() as any[];
      
      content += `## Internal Dependencies\n\n`;
      
      if (fileDeps.length > 0) {
        content += `### File Dependencies (Top 20)\n`;
        for (const dep of fileDeps) {
          const fromFile = dep.from_file.replace(workingDir, '').replace(/^\//, '');
          const toFile = dep.to_file.replace(workingDir, '').replace(/^\//, '');
          content += `- \`${fromFile}\` → \`${toFile}\` (${dep.connection_count} connections)\n`;
        }
        content += `\n`;
      }
      
      // Check for circular dependencies
      const circularDeps = db.prepare(`
        WITH RECURSIVE dep_path AS (
          SELECT 
            from_node, 
            to_node, 
            from_node || '->' || to_node as path,
            1 as depth
          FROM relationships
          WHERE type IN ('IMPORTS', 'CALLS')
          
          UNION
          
          SELECT 
            r.from_node,
            r.to_node,
            dp.path || '->' || r.to_node,
            dp.depth + 1
          FROM relationships r
          JOIN dep_path dp ON r.from_node = dp.to_node
          WHERE dp.depth < 5
            AND dp.path NOT LIKE '%' || r.to_node || '%'
        )
        SELECT DISTINCT path
        FROM dep_path
        WHERE from_node = to_node
        LIMIT 5
      `).all() as any[];
      
      if (circularDeps.length > 0) {
        content += `## ⚠️ Circular Dependencies Detected\n\n`;
        for (const circular of circularDeps) {
          content += `- ${circular.path}\n`;
        }
        content += `\n`;
      } else {
        content += `## ✅ No Circular Dependencies\n\n`;
      }
      
      // Get dependency statistics
      const stats = db.prepare(`
        SELECT 
          COUNT(DISTINCT from_node) as total_dependents,
          COUNT(DISTINCT to_node) as total_dependencies,
          COUNT(*) as total_relationships
        FROM relationships
      `).get() as any;
      
      content += `## Dependency Statistics\n\n`;
      content += `- **Total Relationships**: ${stats.total_relationships}\n`;
      content += `- **Unique Dependents**: ${stats.total_dependents}\n`;
      content += `- **Unique Dependencies**: ${stats.total_dependencies}\n`;
      
      db.close();
    } catch (error: any) {
      content += `\n## Internal Dependencies\n\nError analyzing internal dependencies: ${error.message}\n`;
    }
  } else {
    content += `\n## Internal Dependencies\n\nNo indexed data available. Run indexing to analyze internal dependencies.\n`;
  }
  
  content += `\n## Recommendations\n\n`;
  
  if (externalDeps.length > 50) {
    content += `- Consider reviewing external dependencies - you have ${externalDeps.length} total\n`;
  }
  
  content += `- Keep dependencies up to date\n`;
  content += `- Monitor for security vulnerabilities\n`;
  content += `- Consider using dependency injection for loose coupling\n`;
  
  return {
    uri: "codegraph://dependencies",
    mimeType: "text/markdown",
    text: content,
  };
}

export async function getHotspotsReal(
  core: CodeGraphCore,
  autoIndexer: AutoIndexer
): Promise<ResourceContent> {
  const workingDir = core.getProjectPath();
  const dbPath = await getDatabasePath(workingDir);
  
  let content = `# Code Hotspots\n\n`;
  content += `**Project**: ${workingDir}\n\n`;
  
  // Get git history for change frequency
  let gitHistory: any[] = [];
  try {
    const gitLog = execSync(
      'git log --since="30 days ago" --name-only --pretty=format: --no-merges',
      { cwd: workingDir, encoding: 'utf-8' }
    );
    
    const fileChanges = new Map<string, number>();
    const lines = gitLog.split('\n').filter(l => l.trim());
    
    for (const line of lines) {
      const count = fileChanges.get(line) || 0;
      fileChanges.set(line, count + 1);
    }
    
    gitHistory = Array.from(fileChanges.entries())
      .map(([file, changes]) => ({ file, changes }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 20);
  } catch {}
  
  if (gitHistory.length > 0) {
    content += `## High Change Frequency (Last 30 Days)\n\n`;
    for (const item of gitHistory.slice(0, 10)) {
      content += `- \`${item.file}\`: ${item.changes} changes\n`;
    }
    content += `\n`;
  }
  
  if (dbPath) {
    try {
      const db = new Database(dbPath, { readonly: true });
      
      // Get files with most components (complexity)
      const complexFiles = db.prepare(`
        SELECT 
          file,
          COUNT(*) as component_count,
          GROUP_CONCAT(DISTINCT type) as types
        FROM nodes
        WHERE type IN ('function', 'class', 'method')
        GROUP BY file
        ORDER BY component_count DESC
        LIMIT 20
      `).all() as any[];
      
      content += `## High Complexity Files\n\n`;
      for (const file of complexFiles.slice(0, 10)) {
        const fileName = file.file.replace(workingDir, '').replace(/^\//, '');
        content += `- \`${fileName}\`: ${file.component_count} components (${file.types})\n`;
      }
      content += `\n`;
      
      // Get files with most relationships (coupling)
      const coupledFiles = db.prepare(`
        SELECT 
          n.file,
          COUNT(DISTINCT r.to_node) as outgoing,
          COUNT(DISTINCT r2.from_node) as incoming,
          COUNT(DISTINCT r.to_node) + COUNT(DISTINCT r2.from_node) as total_coupling
        FROM nodes n
        LEFT JOIN relationships r ON n.id = r.from_node
        LEFT JOIN relationships r2 ON n.id = r2.to_node
        WHERE n.type IN ('function', 'class')
        GROUP BY n.file
        ORDER BY total_coupling DESC
        LIMIT 20
      `).all() as any[];
      
      content += `## Highly Coupled Files\n\n`;
      for (const file of coupledFiles.slice(0, 10)) {
        const fileName = file.file.replace(workingDir, '').replace(/^\//, '');
        content += `- \`${fileName}\`: ${file.total_coupling} connections (${file.outgoing} out, ${file.incoming} in)\n`;
      }
      content += `\n`;
      
      // Get large files
      const largeFiles = db.prepare(`
        SELECT 
          file,
          MAX(CAST(json_extract(metadata, '$.endLine') AS INTEGER)) as lines,
          COUNT(*) as components
        FROM nodes
        WHERE type IN ('function', 'class', 'method')
          AND metadata IS NOT NULL
          AND json_extract(metadata, '$.endLine') IS NOT NULL
        GROUP BY file
        ORDER BY lines DESC
        LIMIT 10
      `).all() as any[];
      
      if (largeFiles.length > 0) {
        content += `## Large Files\n\n`;
        for (const file of largeFiles) {
          if (file.lines) {
            const fileName = file.file.replace(workingDir, '').replace(/^\//, '');
            content += `- \`${fileName}\`: ~${file.lines} lines, ${file.components} components\n`;
          }
        }
        content += `\n`;
      }
      
      // Calculate risk scores
      const riskFiles = db.prepare(`
        SELECT 
          n.file,
          COUNT(DISTINCT n.id) as components,
          COUNT(DISTINCT r.id) as relationships,
          CAST(COUNT(DISTINCT n.id) * COUNT(DISTINCT r.id) / 10.0 AS INTEGER) as risk_score
        FROM nodes n
        LEFT JOIN relationships r ON n.id = r.from_node OR n.id = r.to_node
        WHERE n.type IN ('function', 'class')
        GROUP BY n.file
        ORDER BY risk_score DESC
        LIMIT 10
      `).all() as any[];
      
      content += `## Risk Analysis (Complexity × Coupling)\n\n`;
      for (const file of riskFiles) {
        const fileName = file.file.replace(workingDir, '').replace(/^\//, '');
        const risk = file.risk_score > 50 ? '🔴 High' : file.risk_score > 20 ? '🟡 Medium' : '🟢 Low';
        content += `- \`${fileName}\`: ${risk} (Score: ${file.risk_score})\n`;
      }
      content += `\n`;
      
      db.close();
    } catch (error: any) {
      content += `\nError analyzing code metrics: ${error.message}\n`;
    }
  } else {
    content += `\n## Analysis Not Available\n\nRun indexing to analyze code complexity and coupling.\n`;
  }
  
  content += `## Recommendations\n\n`;
  
  if (gitHistory.length > 0 && gitHistory[0].changes > 10) {
    content += `- \`${gitHistory[0].file}\` changes very frequently - consider refactoring\n`;
  }
  
  content += `- Review high-complexity files for refactoring opportunities\n`;
  content += `- Reduce coupling in highly connected files\n`;
  content += `- Add tests for frequently changed files\n`;
  content += `- Consider splitting large files into smaller modules\n`;
  
  return {
    uri: "codegraph://hotspots",
    mimeType: "text/markdown",
    text: content,
  };
}

export async function getStatusReal(
  core: CodeGraphCore,
  autoIndexer: AutoIndexer
): Promise<ResourceContent> {
  const workingDir = core.getProjectPath();
  const status = autoIndexer.getStatus(workingDir);
  const capabilities = autoIndexer.getCapabilities(workingDir);
  
  let content = `# CodeGraph Indexing Status\n\n`;
  content += `**Project**: ${workingDir}\n`;
  content += `**Time**: ${new Date().toISOString()}\n\n`;
  
  if (!status) {
    content += `## Status: Not Initialized\n\n`;
    content += `CodeGraph has not been initialized for this directory.\n\n`;
    content += `To start indexing, use one of the CodeGraph tools.\n`;
  } else {
    content += `## Current Status\n\n`;
    
    if (status.error) {
      content += `- **Status**: ❌ Error\n`;
      content += `- **Error**: ${status.error}\n`;
    } else if (status.isComplete) {
      content += `- **Status**: ✅ Complete\n`;
      content += `- **Progress**: 100%\n`;
      content += `- **Files Processed**: ${status.filesProcessed}\n`;
    } else if (status.isIndexing) {
      content += `- **Status**: ⏳ Indexing\n`;
      content += `- **Progress**: ${status.progress}%\n`;
      content += `- **Current Phase**: ${status.currentPhase}\n`;
      content += `- **Files Processed**: ${status.filesProcessed}/${status.totalFiles}\n`;
      
      // Progress bar
      const barLength = 30;
      const filled = Math.floor((status.progress / 100) * barLength);
      const empty = barLength - filled;
      content += `- **Progress Bar**: [${'█'.repeat(filled)}${'░'.repeat(empty)}]\n`;
    } else {
      content += `- **Status**: ⏸️ Ready\n`;
      content += `- **Indexed**: ${status.filesProcessed > 0 ? 'Yes' : 'No'}\n`;
    }
    
    content += `\n## Available Capabilities\n\n`;
    content += `| Capability | Status | Description |\n`;
    content += `|------------|--------|-------------|\n`;
    content += `| Syntax Analysis | ${capabilities.syntaxAnalysis ? '✅' : '⏳'} | AST parsing and structure |\n`;
    content += `| Graph Relationships | ${capabilities.graphRelationships ? '✅' : '⏳'} | Dependency tracking |\n`;
    content += `| Semantic Search | ${capabilities.semanticSearch ? '✅' : '⏳'} | Embedding-based search |\n`;
    content += `| Temporal Analysis | ${capabilities.temporalAnalysis ? '✅' : '⏳'} | Git history analysis |\n`;
    content += `| Query Intelligence | ${capabilities.queryIntelligence ? '✅' : '⏳'} | Smart query routing |\n`;
    
    if (status.isIndexing) {
      content += `\n## Indexing Phases\n\n`;
      
      const phases = [
        { name: 'Syntax Analysis', complete: status.progress >= 20 },
        { name: 'Graph Building', complete: status.progress >= 40 },
        { name: 'Semantic Processing', complete: status.progress >= 60 },
        { name: 'Temporal Analysis', complete: status.progress >= 80 },
        { name: 'Query Optimization', complete: status.progress >= 100 },
      ];
      
      for (const phase of phases) {
        content += `- ${phase.complete ? '✅' : '⏳'} ${phase.name}\n`;
      }
    }
  }
  
  // Check database status
  const dbPath = await getDatabasePath(workingDir);
  if (dbPath) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const stats = db.prepare(`
        SELECT 
          COUNT(DISTINCT file) as file_count,
          COUNT(CASE WHEN type = 'function' THEN 1 END) as function_count,
          COUNT(CASE WHEN type = 'class' THEN 1 END) as class_count,
          COUNT(*) as total_nodes
        FROM nodes
      `).get() as any;
      
      const relStats = db.prepare(`
        SELECT COUNT(*) as relationship_count
        FROM relationships
      `).get() as any;
      
      content += `\n## Database Statistics\n\n`;
      content += `- **Files Indexed**: ${stats.file_count}\n`;
      content += `- **Functions**: ${stats.function_count}\n`;
      content += `- **Classes**: ${stats.class_count}\n`;
      content += `- **Total Nodes**: ${stats.total_nodes}\n`;
      content += `- **Relationships**: ${relStats.relationship_count}\n`;
      
      db.close();
    } catch {}
  }
  
  content += `\n## Actions\n\n`;
  
  if (!status || !status.isIndexing) {
    content += `- Use \`analyze_codebase\` to start analysis\n`;
  }
  
  if (status?.isIndexing) {
    content += `- Use \`wait_for_indexing\` to wait for completion\n`;
    content += `- Continue using tools - they adapt to available capabilities\n`;
  }
  
  if (status?.isComplete) {
    content += `- All CodeGraph features are available\n`;
    content += `- Use tools to explore your codebase\n`;
  }
  
  return {
    uri: "codegraph://status",
    mimeType: "text/markdown",
    text: content,
  };
}

export async function getMetricsReal(
  core: CodeGraphCore,
  autoIndexer: AutoIndexer
): Promise<ResourceContent> {
  const workingDir = core.getProjectPath();
  const dbPath = await getDatabasePath(workingDir);
  
  let content = `# Code Metrics\n\n`;
  content += `**Project**: ${workingDir}\n`;
  content += `**Analysis Date**: ${new Date().toISOString()}\n\n`;
  
  if (!dbPath) {
    content += `## Metrics Not Available\n\n`;
    content += `Run indexing to calculate code metrics.\n`;
    return {
      uri: "codegraph://metrics",
      mimeType: "text/markdown",
      text: content,
    };
  }
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Basic statistics
    const basicStats = db.prepare(`
      SELECT 
        COUNT(DISTINCT file) as file_count,
        COUNT(CASE WHEN type = 'function' THEN 1 END) as function_count,
        COUNT(CASE WHEN type = 'class' THEN 1 END) as class_count,
        COUNT(CASE WHEN type = 'method' THEN 1 END) as method_count,
        COUNT(*) as total_components
      FROM nodes
    `).get() as any;
    
    content += `## Project Statistics\n\n`;
    content += `- **Total Files**: ${basicStats.file_count}\n`;
    content += `- **Functions**: ${basicStats.function_count}\n`;
    content += `- **Classes**: ${basicStats.class_count}\n`;
    content += `- **Methods**: ${basicStats.method_count}\n`;
    content += `- **Total Components**: ${basicStats.total_components}\n`;
    content += `\n`;
    
    // Language distribution
    const languages = db.prepare(`
      SELECT 
        json_extract(metadata, '$.language') as language,
        COUNT(DISTINCT file) as file_count,
        COUNT(*) as component_count
      FROM nodes
      WHERE metadata IS NOT NULL
        AND json_extract(metadata, '$.language') IS NOT NULL
      GROUP BY language
      ORDER BY file_count DESC
    `).all() as any[];
    
    if (languages.length > 0) {
      content += `## Language Distribution\n\n`;
      for (const lang of languages) {
        if (lang.language) {
          content += `- **${lang.language}**: ${lang.file_count} files, ${lang.component_count} components\n`;
        }
      }
      content += `\n`;
    }
    
    // Calculate Lines of Code (approximate from metadata)
    const locStats = db.prepare(`
      SELECT 
        COUNT(DISTINCT file) as files_with_loc,
        SUM(CAST(json_extract(metadata, '$.endLine') AS INTEGER)) as total_lines,
        AVG(CAST(json_extract(metadata, '$.endLine') AS INTEGER)) as avg_lines
      FROM nodes
      WHERE metadata IS NOT NULL
        AND json_extract(metadata, '$.endLine') IS NOT NULL
    `).get() as any;
    
    if (locStats.total_lines) {
      content += `## Lines of Code (Estimated)\n\n`;
      content += `- **Total Lines**: ~${Math.round(locStats.total_lines)}\n`;
      content += `- **Average per Component**: ${Math.round(locStats.avg_lines)}\n`;
      content += `\n`;
    }
    
    // Complexity metrics
    const complexityStats = db.prepare(`
      SELECT 
        file,
        COUNT(*) as complexity_score
      FROM nodes
      WHERE type IN ('function', 'method')
      GROUP BY file
      ORDER BY complexity_score DESC
    `).all() as any[];
    
    const avgComplexity = complexityStats.reduce((sum, f) => sum + f.complexity_score, 0) / complexityStats.length;
    const maxComplexity = complexityStats[0]?.complexity_score || 0;
    
    content += `## Complexity Metrics\n\n`;
    content += `- **Average Complexity**: ${avgComplexity.toFixed(1)} components/file\n`;
    content += `- **Max Complexity**: ${maxComplexity} components\n`;
    content += `- **Files > 10 Components**: ${complexityStats.filter(f => f.complexity_score > 10).length}\n`;
    content += `\n`;
    
    // Coupling metrics
    const couplingStats = db.prepare(`
      SELECT 
        AVG(connection_count) as avg_coupling,
        MAX(connection_count) as max_coupling,
        COUNT(CASE WHEN connection_count > 10 THEN 1 END) as high_coupling_count
      FROM (
        SELECT 
          from_node,
          COUNT(*) as connection_count
        FROM relationships
        GROUP BY from_node
      )
    `).get() as any;
    
    content += `## Coupling Metrics\n\n`;
    content += `- **Average Connections**: ${couplingStats.avg_coupling?.toFixed(1) || 0}\n`;
    content += `- **Max Connections**: ${couplingStats.max_coupling || 0}\n`;
    content += `- **High Coupling (>10)**: ${couplingStats.high_coupling_count || 0} components\n`;
    content += `\n`;
    
    // Test coverage (check for test files)
    const testFiles = db.prepare(`
      SELECT COUNT(DISTINCT file) as test_file_count
      FROM nodes
      WHERE file LIKE '%test%' OR file LIKE '%spec%'
    `).get() as any;
    
    const testCoverage = (testFiles.test_file_count / basicStats.file_count) * 100;
    
    content += `## Test Coverage (Estimated)\n\n`;
    content += `- **Test Files**: ${testFiles.test_file_count}\n`;
    content += `- **Coverage Ratio**: ${testCoverage.toFixed(1)}%\n`;
    content += `- **Status**: ${testCoverage > 50 ? '✅ Good' : testCoverage > 25 ? '⚠️ Fair' : '❌ Low'}\n`;
    content += `\n`;
    
    // Documentation (check for comments/docs)
    const docStats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN content LIKE '%/*%' OR content LIKE '%//%' OR content LIKE '%#%' THEN 1 END) as documented,
        COUNT(*) as total
      FROM nodes
      WHERE type IN ('function', 'class', 'method')
    `).get() as any;
    
    const docPercentage = (docStats.documented / docStats.total) * 100;
    
    content += `## Documentation\n\n`;
    content += `- **Documented Components**: ${docStats.documented}/${docStats.total}\n`;
    content += `- **Documentation Rate**: ${docPercentage.toFixed(1)}%\n`;
    content += `\n`;
    
    // Technical debt estimation
    const debt = Math.round(
      (complexityStats.filter(f => f.complexity_score > 20).length * 4) +
      (couplingStats.high_coupling_count * 2) +
      ((100 - testCoverage) / 10) +
      ((100 - docPercentage) / 20)
    );
    
    content += `## Technical Debt\n\n`;
    content += `- **Estimated Hours**: ${debt}\n`;
    content += `- **Main Contributors**:\n`;
    
    if (avgComplexity > 10) {
      content += `  - High complexity (${avgComplexity.toFixed(1)} avg)\n`;
    }
    if (couplingStats.high_coupling_count > 10) {
      content += `  - High coupling (${couplingStats.high_coupling_count} components)\n`;
    }
    if (testCoverage < 50) {
      content += `  - Low test coverage (${testCoverage.toFixed(1)}%)\n`;
    }
    if (docPercentage < 50) {
      content += `  - Low documentation (${docPercentage.toFixed(1)}%)\n`;
    }
    
    content += `\n## Quality Score\n\n`;
    
    const qualityScore = Math.max(0, Math.min(100,
      100 - (avgComplexity > 10 ? 20 : 0) 
          - (maxComplexity > 50 ? 20 : 0)
          - (testCoverage < 50 ? 20 : 0)
          - (docPercentage < 50 ? 20 : 0)
          - (couplingStats.high_coupling_count > 20 ? 20 : 0)
    ));
    
    content += `- **Overall Score**: ${qualityScore}/100\n`;
    content += `- **Grade**: ${
      qualityScore >= 80 ? 'A' : 
      qualityScore >= 60 ? 'B' : 
      qualityScore >= 40 ? 'C' : 
      qualityScore >= 20 ? 'D' : 'F'
    }\n`;
    
    content += `\n## Recommendations\n\n`;
    
    const recommendations = [];
    
    if (avgComplexity > 10) {
      recommendations.push('- Refactor complex files to reduce average complexity');
    }
    if (testCoverage < 50) {
      recommendations.push('- Increase test coverage to at least 50%');
    }
    if (docPercentage < 60) {
      recommendations.push('- Add documentation to public APIs');
    }
    if (couplingStats.high_coupling_count > 10) {
      recommendations.push('- Reduce coupling between components');
    }
    if (maxComplexity > 50) {
      recommendations.push(`- Split the most complex file (${maxComplexity} components)`);
    }
    
    if (recommendations.length > 0) {
      content += recommendations.join('\n');
    } else {
      content += '- Code quality is good! Keep maintaining standards.';
    }
    
    db.close();
  } catch (error: any) {
    content += `\nError calculating metrics: ${error.message}\n`;
  }
  
  return {
    uri: "codegraph://metrics",
    mimeType: "text/markdown",
    text: content,
  };
}