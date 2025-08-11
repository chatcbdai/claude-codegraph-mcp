import { simpleGit, SimpleGit, LogResult } from "simple-git";
import { Logger } from "../utils/logger.js";

export interface Evolution {
  changes: Change[];
  refactorings: Refactoring[];
  patterns: Pattern[];
}

export interface Change {
  commit: string;
  date: string;
  author: string;
  message: string;
  files: string[];
  additions: number;
  deletions: number;
}

export interface Refactoring {
  type: string;
  commit: string;
  date: string;
  description: string;
}

export interface Pattern {
  type: string;
  frequency: number;
  examples: string[];
}

export class TemporalAnalyzer {
  private git: SimpleGit;
  private logger: Logger;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
    this.logger = new Logger("TemporalAnalyzer");
  }

  async analyzeEvolution(filePath: string): Promise<Evolution> {
    try {
      const log = await this.git.log({
        file: filePath,
        "--follow": null,
        "-p": null,
      });

      const evolution: Evolution = {
        changes: [],
        refactorings: [],
        patterns: [],
      };

      for (const commit of log.all) {
        const change = await this.analyzeCommit(commit, filePath);
        evolution.changes.push(change);

        if (this.isRefactoring(change)) {
          evolution.refactorings.push({
            type: this.detectRefactoringType(change),
            commit: commit.hash,
            date: commit.date,
            description: this.describeRefactoring(change),
          });
        }
      }

      evolution.patterns = this.identifyPatterns(evolution.changes);

      return evolution;
    } catch (error: any) {
      this.logger.error(`Failed to analyze evolution for ${filePath}: ${error.message}`);
      return {
        changes: [],
        refactorings: [],
        patterns: [],
      };
    }
  }

  async getContextAtCommit(filePath: string, commitHash: string): Promise<string> {
    try {
      const content = await this.git.show([`${commitHash}:${filePath}`]);
      return content;
    } catch (error: any) {
      this.logger.error(`Failed to get context at commit ${commitHash}: ${error.message}`);
      return "";
    }
  }

  async findRelatedChanges(change: Change): Promise<Change[]> {
    try {
      const log = await this.git.log({
        from: change.commit,
        to: change.commit,
        "--name-only": null,
      });

      const relatedChanges: Change[] = [];
      for (const commit of log.all) {
        relatedChanges.push({
          commit: commit.hash,
          date: commit.date,
          author: commit.author_name,
          message: commit.message,
          files: [],
          additions: 0,
          deletions: 0,
        });
      }

      return relatedChanges;
    } catch (error: any) {
      this.logger.error(`Failed to find related changes: ${error.message}`);
      return [];
    }
  }

  async getFileHistory(filePath: string): Promise<Change[]> {
    try {
      const log = await this.git.log({
        file: filePath,
        "--follow": null,
      });

      return log.all.map((commit) => ({
        commit: commit.hash,
        date: commit.date,
        author: commit.author_name,
        message: commit.message,
        files: [filePath],
        additions: 0,
        deletions: 0,
      }));
    } catch (error: any) {
      this.logger.error(`Failed to get file history: ${error.message}`);
      return [];
    }
  }

  async getChangeFrequency(filePath: string, days: number = 30): Promise<number> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const log = await this.git.log({
        file: filePath,
        "--since": since.toISOString(),
      });

      return log.total;
    } catch (error: any) {
      this.logger.error(`Failed to get change frequency: ${error.message}`);
      return 0;
    }
  }

  async getAuthors(filePath: string): Promise<Map<string, number>> {
    try {
      const log = await this.git.log({
        file: filePath,
      });

      const authors = new Map<string, number>();
      for (const commit of log.all) {
        const author = commit.author_name;
        authors.set(author, (authors.get(author) || 0) + 1);
      }

      return authors;
    } catch (error: any) {
      this.logger.error(`Failed to get authors: ${error.message}`);
      return new Map();
    }
  }

  private async analyzeCommit(commit: any, filePath: string): Promise<Change> {
    return {
      commit: commit.hash,
      date: commit.date,
      author: commit.author_name,
      message: commit.message,
      files: [filePath],
      additions: 0,
      deletions: 0,
    };
  }

  private isRefactoring(change: Change): boolean {
    const refactoringKeywords = [
      "refactor",
      "rename",
      "extract",
      "inline",
      "move",
      "restructure",
      "reorganize",
      "cleanup",
      "simplify",
    ];

    const message = change.message.toLowerCase();
    return refactoringKeywords.some((keyword) => message.includes(keyword));
  }

  private detectRefactoringType(change: Change): string {
    const message = change.message.toLowerCase();

    if (message.includes("rename")) return "RENAME";
    if (message.includes("extract")) return "EXTRACT";
    if (message.includes("inline")) return "INLINE";
    if (message.includes("move")) return "MOVE";
    if (message.includes("split")) return "SPLIT";
    if (message.includes("merge")) return "MERGE";

    return "GENERAL";
  }

  private describeRefactoring(change: Change): string {
    return `Refactoring detected in commit ${change.commit.substring(0, 7)}: ${
      change.message
    }`;
  }

  private identifyPatterns(changes: Change[]): Pattern[] {
    const patterns: Pattern[] = [];

    // Pattern: Frequent changes
    if (changes.length > 10) {
      patterns.push({
        type: "FREQUENT_CHANGES",
        frequency: changes.length,
        examples: changes.slice(0, 3).map((c) => c.commit),
      });
    }

    // Pattern: Multiple authors
    const authors = new Set(changes.map((c) => c.author));
    if (authors.size > 3) {
      patterns.push({
        type: "MULTIPLE_AUTHORS",
        frequency: authors.size,
        examples: Array.from(authors).slice(0, 3),
      });
    }

    // Pattern: Bug fixes
    const bugFixes = changes.filter((c) =>
      c.message.toLowerCase().match(/fix|bug|issue|error/)
    );
    if (bugFixes.length > changes.length * 0.3) {
      patterns.push({
        type: "BUG_PRONE",
        frequency: bugFixes.length,
        examples: bugFixes.slice(0, 3).map((c) => c.message),
      });
    }

    return patterns;
  }

  async analyzeCoChanges(filePath: string): Promise<Map<string, number>> {
    try {
      const log = await this.git.log({
        file: filePath,
      });

      const coChanges = new Map<string, number>();

      for (const commit of log.all) {
        const files = await this.git.raw([
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "-r",
          commit.hash,
        ]);

        const changedFiles = files.split("\n").filter((f) => f && f !== filePath);

        for (const file of changedFiles) {
          coChanges.set(file, (coChanges.get(file) || 0) + 1);
        }
      }

      return coChanges;
    } catch (error: any) {
      this.logger.error(`Failed to analyze co-changes: ${error.message}`);
      return new Map();
    }
  }
}