import fs from "fs/promises";
import path from "path";
import { simpleGit, SimpleGit } from "simple-git";
import ignore from "ignore";

export interface ScanConfig {
  maxDepth: number;
  followSymlinks: boolean;
  respectGitignore: boolean;
  excludePatterns: string[];
  includePatterns: string[];
  maxFileSize: number;
}

export class FileScanner {
  private config: ScanConfig;
  private git?: SimpleGit;
  private gitignore?: any;

  constructor(config: Partial<ScanConfig> = {}) {
    this.config = {
      maxDepth: 10, // Consistent depth limit
      followSymlinks: false,
      respectGitignore: true,
      excludePatterns: [
        "node_modules",
        ".git",
        ".codegraph",
        "dist",
        "build",
        "__pycache__",
        ".cache",
        ".next",
        ".nuxt",
        ".vscode",
        ".idea",
        "*.min.js",
        "*.min.css"
      ],
      includePatterns: [
        "*.ts", "*.tsx", "*.js", "*.jsx",
        "*.py", "*.go", "*.rs", "*.java",
        "*.cpp", "*.c", "*.h", "*.hpp",
        "*.cs", "*.rb", "*.php", "*.swift"
      ],
      maxFileSize: 1024 * 1024, // 1MB default
      ...config
    };
  }

  async initialize(projectPath: string): Promise<void> {
    // Initialize git for worktree detection
    try {
      this.git = simpleGit(projectPath);
      
      // Load .gitignore if it exists
      if (this.config.respectGitignore) {
        const gitignorePath = path.join(projectPath, ".gitignore");
        try {
          const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
          this.gitignore = ignore().add(gitignoreContent);
        } catch {
          // No .gitignore file
        }
      }
    } catch {
      // Not a git repository
    }
  }

  async scanDirectory(
    dirPath: string,
    currentDepth: number = 0
  ): Promise<string[]> {
    const files: string[] = [];
    
    // Check depth limit
    if (currentDepth >= this.config.maxDepth) {
      console.warn(`[FileScanner] Max depth ${this.config.maxDepth} reached at ${dirPath}`);
      return files;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        // Check exclusions
        if (this.shouldExclude(entry.name, relativePath)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Check if it's a symlink and whether we should follow
          if (entry.isSymbolicLink() && !this.config.followSymlinks) {
            continue;
          }
          
          // Recursively scan subdirectory
          const subFiles = await this.scanDirectory(fullPath, currentDepth + 1);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Check file pattern and size
          if (this.shouldIncludeFile(entry.name, fullPath)) {
            const stats = await fs.stat(fullPath);
            if (stats.size <= this.config.maxFileSize) {
              files.push(fullPath);
            } else {
              console.warn(`[FileScanner] File too large: ${fullPath} (${stats.size} bytes)`);
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`[FileScanner] Error scanning ${dirPath}: ${error.message}`);
    }
    
    return files;
  }

  private shouldExclude(name: string, relativePath: string): boolean {
    // Check exclude patterns
    for (const pattern of this.config.excludePatterns) {
      if (name === pattern || name.includes(pattern)) {
        return true;
      }
    }
    
    // Check gitignore
    if (this.gitignore && this.gitignore.ignores(relativePath)) {
      return true;
    }
    
    return false;
  }

  private shouldIncludeFile(name: string, fullPath: string): boolean {
    // Check include patterns
    for (const pattern of this.config.includePatterns) {
      const regex = new RegExp(pattern.replace("*", ".*"));
      if (regex.test(name)) {
        return true;
      }
    }
    return false;
  }

  async getWorktrees(): Promise<string[]> {
    if (!this.git) return [];
    
    try {
      const output = await this.git.raw(["worktree", "list", "--porcelain"]);
      const worktrees: string[] = [];
      
      for (const line of output.split("\n")) {
        if (line.startsWith("worktree ")) {
          worktrees.push(line.substring(9).trim());
        }
      }
      
      return worktrees;
    } catch {
      return [];
    }
  }

  async getFileList(projectPath: string): Promise<string[]> {
    await this.initialize(projectPath);
    
    // Get worktrees to exclude
    const worktrees = await this.getWorktrees();
    const mainPath = path.resolve(projectPath);
    
    // Filter out worktree paths
    const files = await this.scanDirectory(projectPath);
    return files.filter(file => {
      const filePath = path.resolve(file);
      // Exclude files in worktrees (except main)
      return !worktrees.some(wt => 
        wt !== mainPath && filePath.startsWith(wt)
      );
    });
  }
}