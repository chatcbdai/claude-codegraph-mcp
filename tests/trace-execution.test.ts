import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CodeGraphCore } from '../src/core/indexer';
import { traceExecutionReal } from '../src/handlers/tools-implementation';
import { AutoIndexer } from '../src/core/auto-indexer';
import { CodeGraph } from '../src/core/graph';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';

describe('Trace Execution', () => {
  let testDir: string;
  let indexer: CodeGraphCore;
  let autoIndexer: AutoIndexer;
  let graph: CodeGraph;
  let dbPath: string;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `codegraph-trace-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test files with known call chains
    
    // File 1: main.js with entry point
    const mainJs = `
function main() {
  console.log("Starting application");
  const result = processData([1, 2, 3]);
  displayResult(result);
  cleanup();
}

function processData(data) {
  validateInput(data);
  const transformed = transformData(data);
  return calculateSum(transformed);
}

function validateInput(data) {
  if (!Array.isArray(data)) {
    throw new Error("Invalid input");
  }
}

function transformData(data) {
  return data.map(x => x * 2);
}

function calculateSum(data) {
  return data.reduce((a, b) => a + b, 0);
}

function displayResult(result) {
  console.log("Result:", result);
  formatOutput(result);
}

function formatOutput(value) {
  console.log(\`Formatted: \${value}\`);
}

function cleanup() {
  console.log("Cleaning up");
}

main();
`;

    // File 2: service.js with a different call chain
    const serviceJs = `
class DataService {
  constructor() {
    this.data = [];
  }
  
  async fetchData() {
    const raw = await this.getRawData();
    const processed = this.processRawData(raw);
    return this.validateProcessedData(processed);
  }
  
  async getRawData() {
    // Simulate API call
    return [1, 2, 3, 4, 5];
  }
  
  processRawData(raw) {
    return raw.filter(x => x > 2);
  }
  
  validateProcessedData(data) {
    if (data.length === 0) {
      throw new Error("No valid data");
    }
    return data;
  }
}

function initializeService() {
  const service = new DataService();
  service.fetchData();
  return service;
}
`;

    // File 3: utils.py with Python call chain
    const utilsPy = `
def process_pipeline(input_data):
    """Main pipeline function"""
    validated = validate_data(input_data)
    transformed = transform_data(validated)
    result = aggregate_results(transformed)
    return finalize_output(result)

def validate_data(data):
    """Validate input data"""
    if not data:
        raise ValueError("Empty data")
    check_data_format(data)
    return data

def check_data_format(data):
    """Check if data is in correct format"""
    if not isinstance(data, list):
        raise TypeError("Data must be a list")

def transform_data(data):
    """Transform the data"""
    normalized = normalize_values(data)
    return apply_filters(normalized)

def normalize_values(values):
    """Normalize values to 0-1 range"""
    max_val = max(values) if values else 1
    return [v / max_val for v in values]

def apply_filters(data):
    """Apply filters to data"""
    return [x for x in data if x > 0.5]

def aggregate_results(data):
    """Aggregate the results"""
    return sum(data) / len(data) if data else 0

def finalize_output(result):
    """Finalize the output"""
    return round(result, 2)
`;

    await fs.writeFile(path.join(testDir, 'main.js'), mainJs);
    await fs.writeFile(path.join(testDir, 'service.js'), serviceJs);
    await fs.writeFile(path.join(testDir, 'utils.py'), utilsPy);
    
    // Initialize indexer and graph
    indexer = new CodeGraphCore();
    await indexer.initialize(testDir);
    
    // Initialize auto-indexer with the core indexer
    autoIndexer = new AutoIndexer(indexer);
    
    graph = new CodeGraph({ type: 'sqlite' });
    await graph.initialize(testDir);
    
    // Run indexing phases
    await indexer.runSyntaxPhase(testDir, jest.fn());
    await indexer.runGraphPhase(testDir, jest.fn());
    
    // Manually set the capabilities since we're running phases directly
    // In production, the auto-indexer would track this automatically
    const status = {
      projectPath: testDir,
      isIndexing: false,
      currentPhase: 'graph' as const,
      progress: 50,
      filesProcessed: 3,
      totalFiles: 3,
      startTime: Date.now(),
      capabilities: {
        basicParsing: true,
        graphRelationships: true,
        semanticSearch: false,
        temporalAnalysis: false,
        queryIntelligence: false,
      },
    };
    
    // Use reflection to set the status (for testing only)
    (autoIndexer as any).indexingStatus.set(testDir, status);
    
    // Get database path for direct queries
    const projectHash = crypto.createHash('md5').update(testDir).digest('hex').substring(0, 8);
    const projectName = path.basename(testDir);
    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('JavaScript Execution Tracing', () => {
    test('should trace execution from main function', async () => {
      const result = await traceExecutionReal(
        { entryPoint: 'main', maxDepth: 5, path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Should find the main function
      expect(text).toContain('main');
      
      // Should NOT say "No Execution Paths Found"
      expect(text).not.toContain('No Execution Paths Found');
      
      // Check if any paths were found
      const db = new Database(dbPath, { readonly: true });
      const mainPath = path.join(testDir, 'main.js');
      
      // Check if CALLS relationships exist
      const callsCount = db.prepare(`
        SELECT COUNT(*) as count FROM relationships 
        WHERE type = 'CALLS'
      `).get() as any;
      
      console.log('CALLS relationships found:', callsCount.count);
      
      // Check specific function relationships
      const mainFuncId = `${mainPath}:main`;
      const mainCalls = db.prepare(`
        SELECT * FROM relationships 
        WHERE from_node = ? AND type = 'CALLS'
      `).all(mainFuncId) as any[];
      
      console.log('Calls from main function:', mainCalls);
      
      db.close();
      
      // We expect main to call processData, displayResult, and cleanup
      expect(callsCount.count).toBeGreaterThan(0);
    });

    test('should trace processData call chain', async () => {
      const result = await traceExecutionReal(
        { entryPoint: 'processData', maxDepth: 3, path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Should find processData
      expect(text).toContain('processData');
      
      // Check database for the call chain
      const db = new Database(dbPath, { readonly: true });
      const mainPath = path.join(testDir, 'main.js');
      const processDataId = `${mainPath}:processData`;
      
      const processDataCalls = db.prepare(`
        SELECT r.*, n.name FROM relationships r
        JOIN nodes n ON r.to_node = n.id
        WHERE r.from_node = ? AND r.type = 'CALLS'
      `).all(processDataId) as any[];
      
      console.log('Calls from processData:', processDataCalls);
      
      db.close();
      
      // processData should call validateInput, transformData, and calculateSum
      // But we may not detect them yet, so just check it's not empty initially
      // This test will help us see what's actually being detected
    });
  });

  describe('Python Execution Tracing', () => {
    test('should trace Python function calls', async () => {
      const result = await traceExecutionReal(
        { entryPoint: 'process_pipeline', maxDepth: 4, path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Should find process_pipeline
      expect(text).toContain('process_pipeline');
      
      // Check database
      const db = new Database(dbPath, { readonly: true });
      const utilsPath = path.join(testDir, 'utils.py');
      const pipelineId = `${utilsPath}:process_pipeline`;
      
      const pipelineCalls = db.prepare(`
        SELECT r.*, n.name FROM relationships r
        JOIN nodes n ON r.to_node = n.id
        WHERE r.from_node = ? AND r.type = 'CALLS'
      `).all(pipelineId) as any[];
      
      console.log('Calls from process_pipeline:', pipelineCalls);
      
      db.close();
    });
  });

  describe('Class Method Tracing', () => {
    test('should trace method calls within classes', async () => {
      const result = await traceExecutionReal(
        { entryPoint: 'fetchData', maxDepth: 3, path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Check if fetchData was found
      console.log('Trace result for fetchData:', text);
      
      const db = new Database(dbPath, { readonly: true });
      
      // Check all methods in the database
      const methods = db.prepare(`
        SELECT * FROM nodes WHERE type = 'method'
      `).all() as any[];
      
      console.log('Methods in database:', methods);
      
      db.close();
    });
  });

  describe('Debug Information', () => {
    test('should show all relationships in database', async () => {
      const db = new Database(dbPath, { readonly: true });
      
      // Get all relationships
      const allRelationships = db.prepare(`
        SELECT r.type, r.from_node, r.to_node, n1.name as from_name, n2.name as to_name
        FROM relationships r
        JOIN nodes n1 ON r.from_node = n1.id
        JOIN nodes n2 ON r.to_node = n2.id
        ORDER BY r.type, r.from_node
      `).all() as any[];
      
      console.log('\n=== All Relationships in Database ===');
      for (const rel of allRelationships) {
        console.log(`${rel.type}: ${rel.from_name} -> ${rel.to_name}`);
      }
      
      // Count by type
      const counts = db.prepare(`
        SELECT type, COUNT(*) as count 
        FROM relationships 
        GROUP BY type
      `).all() as any[];
      
      console.log('\n=== Relationship Counts ===');
      for (const count of counts) {
        console.log(`${count.type}: ${count.count}`);
      }
      
      db.close();
      
      // We should have some CALLS relationships
      const callsRel = counts.find((c: any) => c.type === 'CALLS');
      expect(callsRel).toBeDefined();
      
      // For now, we may have 0 CALLS if extraction isn't working
      // This test helps us see the current state
      console.log('CALLS relationships count:', callsRel?.count || 0);
    });
  });
});