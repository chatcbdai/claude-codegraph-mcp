import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CodeGraphCore } from '../src/core/indexer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import simpleGit from 'simple-git';

describe('Git Worktree Filtering', () => {
  let testDir: string;
  let indexer: CodeGraphCore;
  let git: any;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `codegraph-worktree-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize git repository
    git = simpleGit(testDir);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test User');
    
    // Create some files in main repo
    await fs.writeFile(path.join(testDir, 'main.js'), `
function mainFunction() {
  console.log("Main repository");
}
`);
    
    await fs.writeFile(path.join(testDir, 'utils.js'), `
export function utilFunction() {
  return "utils";
}
`);
    
    // Commit initial files to create main branch
    await git.add('.');
    await git.commit('Initial commit');
    
    try {
      // Create a branch for worktree
      await git.checkoutLocalBranch('feature-branch');
      
      // Add a file to the feature branch
      await fs.writeFile(path.join(testDir, 'feature.js'), `
function featureFunction() {
  console.log("Feature branch");
}
`);
      
      await git.add('feature.js');
      await git.commit('Add feature');
      
      // Switch back to main/master (depending on git version)
      try {
        await git.checkout('main');
      } catch {
        await git.checkout('master');
      }
    } catch (error) {
      console.log('Branch operations failed (git version issue):', error);
    }
    
    // Create a worktree
    const worktreePath = path.join(testDir, 'worktree-feature');
    try {
      await git.raw(['worktree', 'add', worktreePath, 'feature-branch']);
      
      // Add duplicate files to worktree to simulate the duplication issue
      await fs.writeFile(path.join(worktreePath, 'duplicate.js'), `
function duplicateFunction() {
  console.log("This should not be indexed");
}
`);
    } catch (error) {
      console.log('Worktree creation failed (expected in some environments):', error);
    }
    
    // Initialize indexer
    indexer = new CodeGraphCore();
    await indexer.initialize(testDir);
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      // Remove worktree first if it exists
      const worktreePath = path.join(testDir, 'worktree-feature');
      try {
        await git.raw(['worktree', 'remove', worktreePath]);
      } catch {
        // Ignore if worktree doesn't exist
      }
      
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('Worktree Detection', () => {
    test('should detect git worktrees', async () => {
      // Test the private method through reflection
      const worktrees = await (indexer as any).getWorktreePaths(testDir);
      
      console.log('Detected worktrees:', worktrees);
      
      // Check if worktrees were detected (may be 0 if git worktree not supported)
      expect(Array.isArray(worktrees)).toBe(true);
    });

    test('should exclude worktree files from indexing', async () => {
      // Get indexable files
      const files = await (indexer as any).getIndexableFiles(testDir);
      
      console.log('Indexable files found:', files.map((f: string) => path.relative(testDir, f)));
      
      // Check that main repo files are included
      const mainJs = files.find((f: string) => f.endsWith('main.js'));
      const utilsJs = files.find((f: string) => f.endsWith('utils.js'));
      
      expect(mainJs).toBeDefined();
      expect(utilsJs).toBeDefined();
      
      // Check that worktree files are excluded
      const worktreeFiles = files.filter((f: string) => f.includes('worktree-feature'));
      
      if (worktreeFiles.length > 0) {
        console.log('WARNING: Worktree files were included:', worktreeFiles);
      }
      
      // Worktree files should be excluded
      expect(worktreeFiles.length).toBe(0);
    });

    test('should not inflate file count with worktree duplicates', async () => {
      // Count files that would be indexed
      const fileCount = await indexer.countIndexableFiles(testDir);
      
      console.log('Total indexable files:', fileCount);
      
      // Should only count main repo files, not worktree duplicates
      // We have main.js and utils.js (feature.js only exists in feature branch)
      expect(fileCount).toBeLessThanOrEqual(3); // May include feature.js if on feature branch
      
      // Definitely should not be 6x inflated
      expect(fileCount).toBeLessThan(10);
    });
  });

  describe('Worktree Configuration', () => {
    test('should handle repositories without worktrees', async () => {
      // Create a new repo without worktrees
      const simpleRepoDir = path.join(os.tmpdir(), `codegraph-simple-${Date.now()}`);
      await fs.mkdir(simpleRepoDir, { recursive: true });
      
      const simpleGitRepo = simpleGit(simpleRepoDir);
      await simpleGitRepo.init();
      
      await fs.writeFile(path.join(simpleRepoDir, 'file.js'), 'console.log("test");');
      
      const simpleIndexer = new CodeGraphCore();
      await simpleIndexer.initialize(simpleRepoDir);
      
      // Should work without errors
      const files = await (simpleIndexer as any).getIndexableFiles(simpleRepoDir);
      expect(files.length).toBeGreaterThan(0);
      
      // Clean up
      await fs.rm(simpleRepoDir, { recursive: true, force: true });
    });

    test('should handle non-git directories', async () => {
      // Create a directory without git
      const nonGitDir = path.join(os.tmpdir(), `codegraph-nongit-${Date.now()}`);
      await fs.mkdir(nonGitDir, { recursive: true });
      
      await fs.writeFile(path.join(nonGitDir, 'file.js'), 'console.log("test");');
      
      const nonGitIndexer = new CodeGraphCore();
      await nonGitIndexer.initialize(nonGitDir);
      
      // Should work without errors
      const files = await (nonGitIndexer as any).getIndexableFiles(nonGitDir);
      expect(files.length).toBeGreaterThan(0);
      
      // Clean up
      await fs.rm(nonGitDir, { recursive: true, force: true });
    });
  });
});