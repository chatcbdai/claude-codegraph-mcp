import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CodeGraphCore } from '../src/core/indexer';
import { findImplementationReal } from '../src/handlers/tools-implementation';
import { AutoIndexer } from '../src/core/auto-indexer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';

describe('Semantic Search', () => {
  let testDir: string;
  let indexer: CodeGraphCore;
  let autoIndexer: AutoIndexer;
  let dbPath: string;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `codegraph-semantic-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test files with semantically related functions
    
    // Authentication related functions
    const authModule = `
// User authentication and authorization module

export function authenticateUser(username, password) {
  // Verify user credentials against database
  const user = findUserByUsername(username);
  if (!user) return null;
  
  const isValid = verifyPassword(password, user.hashedPassword);
  if (!isValid) return null;
  
  return generateAuthToken(user);
}

function findUserByUsername(username) {
  // Query database for user
  return db.query('SELECT * FROM users WHERE username = ?', [username]);
}

function verifyPassword(plainPassword, hashedPassword) {
  // Use bcrypt to verify password
  return bcrypt.compare(plainPassword, hashedPassword);
}

function generateAuthToken(user) {
  // Create JWT token for authenticated user
  return jwt.sign({ id: user.id, username: user.username }, SECRET);
}

export function checkUserPermissions(userId, resource) {
  // Verify if user has access to resource
  const userRoles = getUserRoles(userId);
  return hasResourceAccess(userRoles, resource);
}
`;

    // Bot detection functions (semantically related to authentication)
    const securityModule = `
// Security and bot detection module

export function detectBot(request) {
  // Analyze request patterns to identify bots
  const userAgent = request.headers['user-agent'];
  const ipAddress = request.ip;
  
  if (isKnownBotUserAgent(userAgent)) {
    return { isBot: true, type: 'known_bot' };
  }
  
  if (hasSuspiciousBehavior(request)) {
    return { isBot: true, type: 'suspicious' };
  }
  
  return { isBot: false };
}

function isKnownBotUserAgent(userAgent) {
  // Check against list of known bot user agents
  const botPatterns = [/bot/i, /crawler/i, /spider/i, /scraper/i];
  return botPatterns.some(pattern => pattern.test(userAgent));
}

function hasSuspiciousBehavior(request) {
  // Analyze request patterns for bot-like behavior
  const requestRate = getRequestRate(request.ip);
  const hasJavaScript = request.headers['x-javascript-enabled'];
  
  return requestRate > 100 || !hasJavaScript;
}

export function blockSuspiciousUser(ipAddress) {
  // Add IP to blocklist to prevent access
  addToBlocklist(ipAddress);
  logSecurityEvent('blocked_ip', { ip: ipAddress });
}
`;

    // Random user agent functions (different naming but related concept)
    const utilsModule = `
// Utility functions for various operations

export function get_random_user_agent() {
  // Return a random user agent string for testing
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
  ];
  
  const randomIndex = Math.floor(Math.random() * agents.length);
  return agents[randomIndex];
}

export function generateRandomString(length) {
  // Create random string for various purposes
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function parseUserAgentString(uaString) {
  // Extract browser and OS information from user agent
  const browser = extractBrowser(uaString);
  const os = extractOS(uaString);
  return { browser, os };
}
`;

    // Login functionality (semantically similar to authentication)
    const loginModule = `
// User login and session management

export async function handleUserLogin(email, password) {
  // Process user login request
  try {
    const account = await fetchAccountByEmail(email);
    if (!account) {
      return { success: false, error: 'Invalid credentials' };
    }
    
    const passwordMatch = await validateCredentials(password, account.passwordHash);
    if (!passwordMatch) {
      return { success: false, error: 'Invalid credentials' };
    }
    
    const session = await createUserSession(account);
    return { success: true, session };
  } catch (error) {
    return { success: false, error: 'Login failed' };
  }
}

async function fetchAccountByEmail(email) {
  // Retrieve account from database using email
  return await database.findOne({ email });
}

async function validateCredentials(inputPassword, storedHash) {
  // Verify password using secure hashing
  return await argon2.verify(storedHash, inputPassword);
}

async function createUserSession(account) {
  // Initialize new session for logged in user
  const sessionToken = generateSessionToken();
  await storeSession(account.id, sessionToken);
  return sessionToken;
}
`;

    // Data transformation functions (unrelated to security/auth)
    const dataModule = `
// Data processing and transformation

export function transformDataFormat(data, format) {
  // Convert data between different formats
  switch (format) {
    case 'json':
      return JSON.stringify(data);
    case 'csv':
      return convertToCSV(data);
    case 'xml':
      return convertToXML(data);
    default:
      return data;
  }
}

function convertToCSV(data) {
  // Transform array of objects to CSV format
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => Object.values(row).join(','));
  return [headers, ...rows].join('\\n');
}

export function aggregateMetrics(dataPoints) {
  // Calculate statistical aggregations
  return {
    sum: dataPoints.reduce((a, b) => a + b, 0),
    average: dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length,
    min: Math.min(...dataPoints),
    max: Math.max(...dataPoints)
  };
}
`;

    await fs.writeFile(path.join(testDir, 'auth.js'), authModule);
    await fs.writeFile(path.join(testDir, 'security.js'), securityModule);
    await fs.writeFile(path.join(testDir, 'utils.js'), utilsModule);
    await fs.writeFile(path.join(testDir, 'login.js'), loginModule);
    await fs.writeFile(path.join(testDir, 'data.js'), dataModule);
    
    // Initialize indexer
    indexer = new CodeGraphCore();
    await indexer.initialize(testDir);
    
    // Initialize auto-indexer
    autoIndexer = new AutoIndexer(indexer);
    
    // Run indexing phases including semantic
    await indexer.runSyntaxPhase(testDir, jest.fn());
    await indexer.runGraphPhase(testDir, jest.fn());
    await indexer.runSemanticPhase(testDir, jest.fn());
    
    // Mark semantic phase as complete
    const status = {
      projectPath: testDir,
      isIndexing: false,
      currentPhase: 'semantic' as const,
      progress: 75,
      filesProcessed: 5,
      totalFiles: 5,
      startTime: Date.now(),
      capabilities: {
        syntaxAnalysis: true,  // This is what findImplementationReal checks
        basicParsing: true,
        graphRelationships: true,
        semanticSearch: true,
        temporalAnalysis: false,
        queryIntelligence: false,
      },
    };
    
    (autoIndexer as any).indexingStatus.set(testDir, status);
    
    // Get database path
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

  describe('Semantic Similarity Search', () => {
    test('should find bot detection when searching for anti-bot', async () => {
      const result = await findImplementationReal(
        { query: 'anti-bot protection', context: 'security measures', path: testDir },
        autoIndexer
      );
      
      const text = result.content[0].text;
      
      // Should find detectBot function even though it doesn't contain "anti-bot"
      expect(text).toContain('detectBot');
      
      // Should indicate semantic search was used
      if (text.includes('Using semantic search')) {
        console.log('Semantic search was used successfully');
      } else {
        console.log('Semantic search was not used - checking why...');
        
        const db = new Database(dbPath, { readonly: true });
        const embeddingCount = db.prepare(`
          SELECT COUNT(*) as count FROM nodes WHERE embedding IS NOT NULL
        `).get() as any;
        
        console.log('Nodes with embeddings:', embeddingCount.count);
        db.close();
      }
    });

    test('should find login functions when searching for user authentication', async () => {
      const result = await findImplementationReal(
        { query: 'user authentication', context: '', path: testDir },
        autoIndexer
      );
      
      const text = result.content[0].text;
      
      // Should find both authenticateUser and handleUserLogin
      expect(text.toLowerCase()).toMatch(/authenticate|login/);
      
      // Check if multiple related functions were found
      const componentCount = (text.match(/###/g) || []).length;
      console.log('Components found for "user authentication":', componentCount);
      
      // We expect to find multiple authentication-related functions
      expect(componentCount).toBeGreaterThan(1);
    });

    test('should find get_random_user_agent with fuzzy search', async () => {
      const result = await findImplementationReal(
        { query: 'get random user agent', context: '', path: testDir },
        autoIndexer
      );
      
      const text = result.content[0].text;
      
      // Should find get_random_user_agent even with different formatting
      expect(text).toContain('get_random_user_agent');
    });

    test('should not find unrelated functions', async () => {
      const result = await findImplementationReal(
        { query: 'authentication security', context: '', path: testDir },
        autoIndexer
      );
      
      const text = result.content[0].text;
      
      // Should NOT prominently feature data transformation functions
      const lines = text.split('\n');
      const topResults = lines.slice(0, 50).join('\n'); // Check top portion
      
      // Data transformation functions should not be in top results
      expect(topResults).not.toContain('transformDataFormat');
      expect(topResults).not.toContain('aggregateMetrics');
    });
  });

  describe('Fallback to Text Search', () => {
    test('should fall back to text search when exact match needed', async () => {
      const result = await findImplementationReal(
        { query: 'convertToCSV', context: '', path: testDir },
        autoIndexer
      );
      
      const text = result.content[0].text;
      
      // Should find the exact function name
      expect(text).toContain('convertToCSV');
    });
  });

  describe('Embedding Verification', () => {
    test('should have embeddings stored in database', async () => {
      const db = new Database(dbPath, { readonly: true });
      
      // Check embedding statistics
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total_nodes,
          COUNT(embedding) as nodes_with_embeddings,
          COUNT(CASE WHEN embedding IS NOT NULL AND type = 'function' THEN 1 END) as functions_with_embeddings
        FROM nodes
      `).get() as any;
      
      console.log('Embedding statistics:', stats);
      
      // Check a specific function has embedding
      const authFuncEmbedding = db.prepare(`
        SELECT id, name, LENGTH(embedding) as embedding_size
        FROM nodes
        WHERE name = 'authenticateUser' AND type = 'function'
      `).get() as any;
      
      console.log('authenticateUser embedding size:', authFuncEmbedding?.embedding_size);
      
      db.close();
      
      // We expect embeddings to be generated
      expect(stats.nodes_with_embeddings).toBeGreaterThan(0);
    });
  });
});