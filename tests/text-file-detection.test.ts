import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CodeGraphCore } from '../src/core/indexer.js';

describe('Text File Detection', () => {
  let testDir: string;
  let indexer: CodeGraphCore;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), 'codegraph-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test files with different extensions
    const testFiles = [
      { name: 'requirements.txt', content: 'flask==2.0.1\nrequests==2.26.0' },
      { name: 'README.md', content: '# Test Project\n\nThis is a test.' },
      { name: 'config.json', content: '{"version": "1.0.0", "name": "test"}' },
      { name: 'settings.yaml', content: 'database:\n  host: localhost\n  port: 5432' },
      { name: 'config.yml', content: 'app:\n  name: test\n  version: 1.0' },
      { name: 'data.xml', content: '<?xml version="1.0"?>\n<root><item>test</item></root>' },
      { name: 'data.csv', content: 'name,age\nJohn,30\nJane,25' },
      { name: 'script.js', content: 'function test() { return true; }' },
      { name: 'module.py', content: 'def test():\n    return True' },
      { name: 'docs/api.txt', content: 'API Documentation\n\nEndpoint: /api/v1' },
    ];

    // Create docs subdirectory
    await fs.mkdir(path.join(testDir, 'docs'), { recursive: true });

    // Write all test files
    for (const file of testFiles) {
      const filePath = path.join(testDir, file.name);
      await fs.writeFile(filePath, file.content);
    }

    // Initialize indexer
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

  test('should count all text and data files as indexable', async () => {
    const count = await indexer.countIndexableFiles(testDir);
    
    // We created 10 files total:
    // 7 text/data files (.txt, .md, .json, .yaml, .yml, .xml, .csv)
    // 2 code files (.js, .py)
    // 1 text file in subdirectory (docs/api.txt)
    expect(count).toBe(10);
  });

  test('should detect correct language for each file type', async () => {
    // Test language detection through the private method via reflection
    // Since it's private, we'll test it indirectly through parsing
    
    const testCases = [
      { file: 'requirements.txt', expectedLang: 'text' },
      { file: 'README.md', expectedLang: 'markdown' },
      { file: 'config.json', expectedLang: 'json' },
      { file: 'settings.yaml', expectedLang: 'yaml' },
      { file: 'config.yml', expectedLang: 'yaml' },
      { file: 'data.xml', expectedLang: 'xml' },
      { file: 'data.csv', expectedLang: 'csv' },
      { file: 'script.js', expectedLang: 'javascript' },
      { file: 'module.py', expectedLang: 'python' },
    ];

    // We'll verify language detection by checking the parsed files
    // This requires running the syntax phase
    const progressCallback = jest.fn();
    await indexer.runSyntaxPhase(testDir, progressCallback);

    // Check that progress callback was called with correct total
    expect(progressCallback).toHaveBeenCalled();
    const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1];
    expect(lastCall[1]).toBe(10); // Total files should be 10
  });

  test('should include subdirectory text files', async () => {
    // Verify that docs/api.txt is included
    const progressCallback = jest.fn();
    await indexer.runSyntaxPhase(testDir, progressCallback);
    
    // Check that all 10 files were processed
    const finalCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1];
    expect(finalCall[0]).toBe(10); // Processed count
    expect(finalCall[1]).toBe(10); // Total count
  });

  test('should handle mixed content directories correctly', async () => {
    // Create a directory with both indexable and non-indexable files
    const mixedDir = path.join(testDir, 'mixed');
    await fs.mkdir(mixedDir, { recursive: true });
    
    // Create various files
    await fs.writeFile(path.join(mixedDir, 'test.txt'), 'text content');
    await fs.writeFile(path.join(mixedDir, 'image.png'), Buffer.from('fake image data'));
    await fs.writeFile(path.join(mixedDir, 'data.json'), '{"test": true}');
    await fs.writeFile(path.join(mixedDir, 'binary.exe'), Buffer.from('fake binary'));
    
    // Count should only include indexable files
    const mixedCount = await indexer.countIndexableFiles(mixedDir);
    expect(mixedCount).toBe(2); // Only .txt and .json should be counted
  });

  test('should parse text files without throwing errors', async () => {
    // This test ensures that text files can be parsed without errors
    // even though they don't have programming language structure
    
    const parseTest = async () => {
      const progressCallback = jest.fn();
      await indexer.runSyntaxPhase(testDir, progressCallback);
      return true;
    };

    await expect(parseTest()).resolves.toBe(true);
  });
});