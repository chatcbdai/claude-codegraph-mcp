export class CodeGraphError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
    public details?: any
  ) {
    super(message);
    this.name = "CodeGraphError";
  }
}

export class RetryableOperation<T> {
  constructor(
    private operation: () => Promise<T>,
    private maxRetries: number = 3,
    private backoffMs: number = 1000
  ) {}

  async execute(): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.operation();
      } catch (error: any) {
        lastError = error;
        
        if (attempt === this.maxRetries) {
          throw new CodeGraphError(
            `Operation failed after ${this.maxRetries} attempts: ${error.message}`,
            "MAX_RETRIES_EXCEEDED",
            false,
            { originalError: error }
          );
        }
        
        const delay = this.backoffMs * Math.pow(2, attempt - 1);
        console.error(`[Retry] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}

export class ConcurrencyManager {
  private locks: Map<string, Promise<void>> = new Map();
  private queues: Map<string, (() => void)[]> = new Map();

  async acquire(key: string): Promise<() => void> {
    // Wait for existing lock
    const existingLock = this.locks.get(key);
    if (existingLock) {
      await existingLock;
    }
    
    // Create new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    
    this.locks.set(key, lockPromise);
    
    return () => {
      this.locks.delete(key);
      releaseLock!();
      
      // Process queue if any
      const queue = this.queues.get(key);
      if (queue && queue.length > 0) {
        const next = queue.shift()!;
        next();
      }
    };
  }

  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire(key);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export class Debouncer {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  debounce(key: string, func: () => void, delayMs: number = 500): void {
    // Clear existing timer
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      this.timers.delete(key);
      func();
    }, delayMs);
    
    this.timers.set(key, timer);
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}