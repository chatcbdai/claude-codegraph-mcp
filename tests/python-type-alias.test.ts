import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CodeGraphCore } from '../src/core/indexer.js';
import { EnhancedCodeParser } from '../src/core/parser-enhanced.js';

describe('Python Type Alias and Enhanced Detection', () => {
  let testDir: string;
  let parser: EnhancedCodeParser;
  let indexer: CodeGraphCore;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), 'codegraph-python-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    
    // Create a test Python file with various components
    const pythonContent = `
from typing import Dict, List, Union, Optional, TypeVar, Protocol, overload
import asyncio

# Type aliases
HTMLContent = str
JSONData = Dict[str, Any]
UserList = List[str]
ConfigValue = Union[str, int, bool]
OptionalString = Optional[str]

# TypeVar definitions
T = TypeVar('T')
K = TypeVar('K', str, bytes)
V = TypeVar('V', bound=dict)

# Constants
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30.0
API_KEY = "secret-key-123"
DEBUG_MODE = True

# Protocol class
class Drawable(Protocol):
    def draw(self) -> None:
        ...
    
    def get_position(self) -> tuple[int, int]:
        ...

# Regular class
class Shape:
    def __init__(self, name: str):
        self.name = name

# Overloaded functions
@overload
def process(data: str) -> str:
    ...

@overload
def process(data: int) -> int:
    ...

@overload
def process(data: list) -> list:
    ...

def process(data):
    """Process different types of data"""
    if isinstance(data, str):
        return data.upper()
    elif isinstance(data, int):
        return data * 2
    else:
        return data

# Regular function
def calculate_sum(a: int, b: int) -> int:
    return a + b

# Async function
async def fetch_data(url: str) -> JSONData:
    # Simulated async operation
    return {"status": "ok"}

# Another type alias after functions
ResponseType = Dict[str, Union[str, int, List[str]]]
`;

    await fs.writeFile(path.join(testDir, 'custom_types.py'), pythonContent);
    
    // Initialize parser and indexer
    parser = new EnhancedCodeParser();
    indexer = new CodeGraphCore();
    await indexer.initialize(testDir);
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('Type Alias Detection', () => {
    test('should detect simple type aliases', async () => {
      const content = await fs.readFile(path.join(testDir, 'custom_types.py'), 'utf-8');
      const parsed = await parser.parseFile(content, 'python');
      
      expect(parsed.typeAliases).toBeDefined();
      const typeAliases = parsed.typeAliases || [];
      
      // Check for simple type alias
      const htmlContent = typeAliases.find((ta: any) => ta.name === 'HTMLContent');
      expect(htmlContent).toBeDefined();
      expect(htmlContent?.value).toBe('str');
    });

    test('should detect complex type aliases with generics', async () => {
      const content = await fs.readFile(path.join(testDir, 'custom_types.py'), 'utf-8');
      const parsed = await parser.parseFile(content, 'python');
      
      const typeAliases = parsed.typeAliases || [];
      
      // Check for Dict type alias
      const jsonData = typeAliases.find((ta: any) => ta.name === 'JSONData');
      expect(jsonData).toBeDefined();
      expect(jsonData?.value).toContain('Dict');
      
      // Check for Union type alias
      const configValue = typeAliases.find((ta: any) => ta.name === 'ConfigValue');
      expect(configValue).toBeDefined();
      expect(configValue?.value).toContain('Union');
      
      // Check for Optional type alias
      const optionalString = typeAliases.find((ta: any) => ta.name === 'OptionalString');
      expect(optionalString).toBeDefined();
      expect(optionalString?.value).toContain('Optional');
    });

    test('should detect TypeVar definitions', async () => {
      const content = await fs.readFile(path.join(testDir, 'custom_types.py'), 'utf-8');
      const parsed = await parser.parseFile(content, 'python');
      
      const typeAliases = parsed.typeAliases || [];
      
      // Check for TypeVar T
      const typeVarT = typeAliases.find((ta: any) => ta.name === 'T' && ta.isTypeVar);
      expect(typeVarT).toBeDefined();
      
      // Check for constrained TypeVar K
      const typeVarK = typeAliases.find((ta: any) => ta.name === 'K' && ta.isTypeVar);
      expect(typeVarK).toBeDefined();
      
      // Check for bounded TypeVar V
      const typeVarV = typeAliases.find((ta: any) => ta.name === 'V' && ta.isTypeVar);
      expect(typeVarV).toBeDefined();
    });
  });

  describe('Constant Detection', () => {
    test('should detect constants', async () => {
      const content = await fs.readFile(path.join(testDir, 'custom_types.py'), 'utf-8');
      const parsed = await parser.parseFile(content, 'python');
      
      expect(parsed.constants).toBeDefined();
      const constants = parsed.constants || [];
      
      // Check for numeric constant
      const maxRetries = constants.find((c: any) => c.name === 'MAX_RETRIES');
      expect(maxRetries).toBeDefined();
      expect(maxRetries?.value).toBe('3');
      
      // Check for float constant
      const timeout = constants.find((c: any) => c.name === 'DEFAULT_TIMEOUT');
      expect(timeout).toBeDefined();
      expect(timeout?.value).toBe('30.0');
      
      // Check for string constant
      const apiKey = constants.find((c: any) => c.name === 'API_KEY');
      expect(apiKey).toBeDefined();
      
      // Check for boolean constant
      const debugMode = constants.find((c: any) => c.name === 'DEBUG_MODE');
      expect(debugMode).toBeDefined();
      expect(debugMode?.value).toBe('True');
    });
  });

  describe('Overloaded Method Detection', () => {
    test('should detect @overload decorated functions', async () => {
      const content = await fs.readFile(path.join(testDir, 'custom_types.py'), 'utf-8');
      const parsed = await parser.parseFile(content, 'python');
      
      const functions = parsed.functions;
      
      // Count overloaded process functions
      const overloadedProcess = functions.filter((f: any) => 
        f.name === 'process' && f.isOverload === true
      );
      
      // Should find 3 overloaded signatures
      expect(overloadedProcess.length).toBe(3);
      
      // Should also find the actual implementation
      const processImpl = functions.find((f: any) => 
        f.name === 'process' && !f.isOverload
      );
      expect(processImpl).toBeDefined();
    });
  });

  describe('Protocol Class Detection', () => {
    test('should detect Protocol classes', async () => {
      const content = await fs.readFile(path.join(testDir, 'custom_types.py'), 'utf-8');
      const parsed = await parser.parseFile(content, 'python');
      
      const classes = parsed.classes;
      
      // Find Protocol class
      const drawableProtocol = classes.find((c: any) => c.name === 'Drawable');
      expect(drawableProtocol).toBeDefined();
      expect(drawableProtocol?.isProtocol).toBe(true);
      
      // Should have methods
      expect(drawableProtocol?.methods).toContain('draw');
      expect(drawableProtocol?.methods).toContain('get_position');
      
      // Regular class should not be marked as Protocol
      const shapeClass = classes.find((c: any) => c.name === 'Shape');
      expect(shapeClass).toBeDefined();
      expect(shapeClass?.isProtocol).toBeFalsy();
    });
  });

  describe('Component Counting', () => {
    test('should count all components correctly', async () => {
      const content = await fs.readFile(path.join(testDir, 'custom_types.py'), 'utf-8');
      const parsed = await parser.parseFile(content, 'python');
      
      // Count all components
      const typeAliases = (parsed.typeAliases || []).length;
      const constants = (parsed.constants || []).length;
      const classes = parsed.classes.length;
      const functions = parsed.functions.length;
      
      // We should have:
      // - 9 type aliases (6 type aliases + 3 TypeVars)
      // - 4 constants
      // - 2 classes (1 Protocol, 1 regular)
      // - 7 functions (3 overloads + 1 process impl + 1 regular + 1 async + __init__)
      
      expect(typeAliases).toBeGreaterThanOrEqual(9);
      expect(constants).toBe(4);
      expect(classes).toBe(2);
      expect(functions).toBeGreaterThanOrEqual(6); // At least the main functions
      
      // Total components should be much higher than before
      const totalComponents = typeAliases + constants + classes + functions;
      expect(totalComponents).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Integration with Indexer', () => {
    test('should properly index Python file with all enhancements', async () => {
      const progressCallback = jest.fn();
      await indexer.runSyntaxPhase(testDir, progressCallback);
      
      // Check that the file was processed
      expect(progressCallback).toHaveBeenCalled();
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1];
      expect(lastCall[0]).toBe(1); // Processed 1 file
      expect(lastCall[1]).toBe(1); // Total 1 file
    });
  });
});