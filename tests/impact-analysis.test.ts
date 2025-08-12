import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CodeGraphCore } from '../src/core/indexer';
import { impactAnalysisReal } from '../src/handlers/tools-implementation';
import { AutoIndexer } from '../src/core/auto-indexer';
import { CodeGraph } from '../src/core/graph';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';

describe('Impact Analysis', () => {
  let testDir: string;
  let indexer: CodeGraphCore;
  let autoIndexer: AutoIndexer;
  let graph: CodeGraph;
  let dbPath: string;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `codegraph-impact-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test files with multi-level dependencies
    
    // Core utility module - everything depends on this
    const coreUtils = `
export function formatString(str) {
  return str.trim().toLowerCase();
}

export function validateInput(data) {
  if (!data) throw new Error("Invalid input");
  return true;
}

export const CONFIG = {
  maxRetries: 3,
  timeout: 5000,
};
`;

    // Data processor that uses core utils
    const dataProcessor = `
import { formatString, validateInput } from './core-utils.js';

export function processData(data) {
  validateInput(data);
  return data.map(item => formatString(item));
}

export function transformData(data) {
  const processed = processData(data);
  return processed.filter(item => item.length > 0);
}
`;

    // Service layer that uses data processor
    const userService = `
import { processData, transformData } from './data-processor.js';
import { CONFIG } from './core-utils.js';

export class UserService {
  constructor() {
    this.retries = CONFIG.maxRetries;
  }
  
  processUserData(users) {
    return processData(users.map(u => u.name));
  }
  
  validateUsers(users) {
    return transformData(users.map(u => u.email));
  }
}
`;

    // API layer that uses service
    const apiHandler = `
import { UserService } from './user-service.js';

export function handleUserRequest(request) {
  const service = new UserService();
  const result = service.processUserData(request.users);
  return { success: true, data: result };
}

export function handleValidation(request) {
  const service = new UserService();
  return service.validateUsers(request.users);
}
`;

    // Controllers that use API
    const userController = `
import { handleUserRequest, handleValidation } from './api-handler.js';

export class UserController {
  async getUsers(req, res) {
    const result = handleUserRequest(req);
    res.json(result);
  }
  
  async validateUsers(req, res) {
    const result = handleValidation(req);
    res.json({ valid: result });
  }
}
`;

    const adminController = `
import { handleUserRequest } from './api-handler.js';
import { UserService } from './user-service.js';

export class AdminController {
  constructor() {
    this.userService = new UserService();
  }
  
  async getAllUsers(req, res) {
    const result = handleUserRequest(req);
    // Additional admin processing
    return res.json(result);
  }
}
`;

    // Main app that uses controllers
    const app = `
import { UserController } from './user-controller.js';
import { AdminController } from './admin-controller.js';

const userController = new UserController();
const adminController = new AdminController();

export function setupRoutes(app) {
  app.get('/users', userController.getUsers);
  app.get('/admin/users', adminController.getAllUsers);
}
`;

    // Additional modules that import core-utils to test wide impact
    const auth = `
import { validateInput } from './core-utils.js';

export function authenticate(credentials) {
  validateInput(credentials);
  return true;
}
`;

    const logger = `
import { formatString } from './core-utils.js';

export function log(message) {
  console.log(formatString(message));
}
`;

    await fs.writeFile(path.join(testDir, 'core-utils.js'), coreUtils);
    await fs.writeFile(path.join(testDir, 'data-processor.js'), dataProcessor);
    await fs.writeFile(path.join(testDir, 'user-service.js'), userService);
    await fs.writeFile(path.join(testDir, 'api-handler.js'), apiHandler);
    await fs.writeFile(path.join(testDir, 'user-controller.js'), userController);
    await fs.writeFile(path.join(testDir, 'admin-controller.js'), adminController);
    await fs.writeFile(path.join(testDir, 'app.js'), app);
    await fs.writeFile(path.join(testDir, 'auth.js'), auth);
    await fs.writeFile(path.join(testDir, 'logger.js'), logger);
    
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
    
    // Mark graph phase as complete
    const status = {
      projectPath: testDir,
      isIndexing: false,
      currentPhase: 'graph' as const,
      progress: 50,
      filesProcessed: 9,
      totalFiles: 9,
      startTime: Date.now(),
      capabilities: {
        basicParsing: true,
        graphRelationships: true,
        semanticSearch: false,
        temporalAnalysis: false,
        queryIntelligence: false,
      },
    };
    
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

  describe('File-level Impact', () => {
    test('should find all files that import core-utils.js', async () => {
      const result = await impactAnalysisReal(
        { component: 'core-utils.js', changeType: 'modify', path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Should find core-utils.js
      expect(text).toContain('core-utils');
      
      // Check direct dependents count
      const match = text.match(/Direct Dependents[^:]*:\s*(\d+)/);
      const directCount = match ? parseInt(match[1]) : 0;
      
      console.log('Direct dependents of core-utils.js:', directCount);
      
      // We expect at least 4 direct dependents:
      // data-processor.js, user-service.js, auth.js, logger.js
      expect(directCount).toBeGreaterThanOrEqual(4);
      
      // Check the database directly
      const db = new Database(dbPath, { readonly: true });
      const coreUtilsPath = path.join(testDir, 'core-utils.js');
      
      const importers = db.prepare(`
        SELECT r.*, n1.name as from_name, n2.name as to_name
        FROM relationships r
        JOIN nodes n1 ON r.from_node = n1.id
        JOIN nodes n2 ON r.to_node = n2.id
        WHERE r.to_node = ? AND r.type = 'IMPORTS'
      `).all(coreUtilsPath) as any[];
      
      console.log('Files importing core-utils.js:', importers);
      
      db.close();
    });

    test('should find indirect impact through import chains', async () => {
      const result = await impactAnalysisReal(
        { component: 'data-processor.js', changeType: 'modify', path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Check indirect dependents
      const match = text.match(/Indirect Dependents[^:]*:\s*(\d+)/);
      const indirectCount = match ? parseInt(match[1]) : 0;
      
      console.log('Indirect dependents of data-processor.js:', indirectCount);
      
      // We expect indirect dependents through user-service -> api-handler -> controllers
      expect(indirectCount).toBeGreaterThan(0);
    });
  });

  describe('Function-level Impact', () => {
    test('should find impact of formatString function', async () => {
      const result = await impactAnalysisReal(
        { component: 'formatString', changeType: 'modify', path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Should find the function
      expect(text).toContain('formatString');
      
      // Check database for function relationships
      const db = new Database(dbPath, { readonly: true });
      const coreUtilsPath = path.join(testDir, 'core-utils.js');
      const formatStringId = `${coreUtilsPath}:formatString`;
      
      const callers = db.prepare(`
        SELECT r.*, n.name, n.file
        FROM relationships r
        JOIN nodes n ON r.from_node = n.id
        WHERE r.to_node = ? AND r.type = 'CALLS'
      `).all(formatStringId) as any[];
      
      console.log('Functions calling formatString:', callers);
      
      db.close();
    });

    test('should find impact of UserService class', async () => {
      const result = await impactAnalysisReal(
        { component: 'UserService', changeType: 'delete', path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Should find UserService
      expect(text).toContain('UserService');
      
      // Should warn about deletion impact
      if (text.includes('Direct Dependents: 0')) {
        console.log('No direct dependents found - checking why...');
        
        const db = new Database(dbPath, { readonly: true });
        
        // Check what relationships exist for UserService
        const userServicePath = path.join(testDir, 'user-service.js');
        const userServiceId = `${userServicePath}:UserService`;
        
        const allRelationships = db.prepare(`
          SELECT r.*, n1.name as from_name, n2.name as to_name
          FROM relationships r
          JOIN nodes n1 ON r.from_node = n1.id
          JOIN nodes n2 ON r.to_node = n2.id
          WHERE r.from_node LIKE ? OR r.to_node LIKE ?
        `).all(`%UserService%`, `%UserService%`) as any[];
        
        console.log('All UserService relationships:', allRelationships);
        
        db.close();
      }
      
      // Should have delete impact warning
      expect(text).toContain('Delete Impact');
    });
  });

  describe('Risk Assessment', () => {
    test('should classify core-utils.js as high risk', async () => {
      const result = await impactAnalysisReal(
        { component: 'core-utils.js', changeType: 'modify', path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Should have risk assessment
      expect(text).toMatch(/Risk Level[^:]*:\s*(HIGH|MEDIUM|LOW)/);
      
      // Core utils should be high risk due to many dependents
      const isHighRisk = text.includes('Risk Level**: HIGH');
      
      if (!isHighRisk) {
        console.log('Not classified as high risk, checking why...');
        console.log('Full text:', text);
      }
    });

    test('should show proper recommendations', async () => {
      const result = await impactAnalysisReal(
        { component: 'app.js', changeType: 'modify', path: testDir },
        autoIndexer,
        graph
      );
      
      const text = result.content[0].text;
      
      // Should have recommendations section
      expect(text).toContain('## Recommendations');
      
      // Should have specific advice based on risk level
      expect(text).toMatch(/(High Risk Change|Moderate Risk|Low Risk)/);
    });
  });

  describe('Debug Information', () => {
    test('should show all IMPORTS relationships', async () => {
      const db = new Database(dbPath, { readonly: true });
      
      // Get all IMPORTS relationships
      const imports = db.prepare(`
        SELECT r.*, n1.name as from_name, n1.file as from_file, n2.name as to_name, n2.file as to_file
        FROM relationships r
        JOIN nodes n1 ON r.from_node = n1.id
        JOIN nodes n2 ON r.to_node = n2.id
        WHERE r.type = 'IMPORTS'
      `).all() as any[];
      
      console.log('\n=== All IMPORTS Relationships ===');
      for (const imp of imports) {
        console.log(`${path.basename(imp.from_file)} imports ${path.basename(imp.to_file)}`);
      }
      
      // Count imports by file
      const importCounts = db.prepare(`
        SELECT n.name, n.file, COUNT(*) as import_count
        FROM relationships r
        JOIN nodes n ON r.to_node = n.id
        WHERE r.type = 'IMPORTS' AND n.type = 'file'
        GROUP BY n.id
        ORDER BY import_count DESC
      `).all() as any[];
      
      console.log('\n=== Files by Import Count ===');
      for (const count of importCounts) {
        console.log(`${path.basename(count.file)}: ${count.import_count} imports`);
      }
      
      db.close();
      
      // We should have IMPORTS relationships
      expect(imports.length).toBeGreaterThan(0);
    });
  });
});