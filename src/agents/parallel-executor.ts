/**
 * Parallel Execution Manager
 * Manages concurrent agent execution with concurrency control and error handling
 */

import { ReviewChunk } from '../chunking/chunk-orchestrator';
import { ReviewAgent, AgentReviewResult } from './review-agent';
import { loadLargeReviewConfig } from '../../config/large-review.config';

export interface ExecutionProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}

export interface ExecutionResult {
  results: AgentReviewResult[];
  errors: Array<{ chunkId: string; error: string }>;
  progress: ExecutionProgress;
  totalDuration: number;
}

export class ParallelExecutor {
  private config = loadLargeReviewConfig();
  private progressCallbacks: Array<(progress: ExecutionProgress) => void> = [];

  /**
   * Execute reviews for multiple chunks in parallel with concurrency control
   */
  async executeParallel(
    chunks: ReviewChunk[],
    agent: ReviewAgent,
    maxConcurrency?: number
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const concurrency = maxConcurrency || this.config.execution.maxConcurrentAgents;

    const results: AgentReviewResult[] = [];
    const errors: Array<{ chunkId: string; error: string }> = [];

    const progress: ExecutionProgress = {
      total: chunks.length,
      completed: 0,
      failed: 0,
      inProgress: 0,
    };

    // Execute chunks in batches
    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(chunk => this.executeChunkWithRetry(chunk, agent))
      );

      // Process batch results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const chunk = batch[j];

        if (result.status === 'fulfilled') {
          results.push(result.value);
          progress.completed++;
        } else {
          errors.push({
            chunkId: chunk.id,
            error: result.reason?.message || 'Unknown error',
          });
          progress.failed++;
        }

        // Notify progress
        this.notifyProgress(progress);
      }
    }

    return {
      results,
      errors,
      progress,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Execute a single chunk with retry logic
   */
  private async executeChunkWithRetry(
    chunk: ReviewChunk,
    agent: ReviewAgent
  ): Promise<AgentReviewResult> {
    const maxRetries = this.config.execution.retryAttempts;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Execute with timeout
        const result = await this.executeWithTimeout(
          () => agent.reviewChunk(chunk),
          this.config.execution.agentTimeout
        );

        return result;
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await this.sleep(delay);
          console.log(`Retrying chunk ${chunk.id}, attempt ${attempt + 2}/${maxRetries + 1}`);
        }
      }
    }

    throw lastError || new Error(`Failed to execute chunk ${chunk.id} after ${maxRetries + 1} attempts`);
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Execute with fallback to summary generation
   */
  async executeWithFallback(
    chunks: ReviewChunk[],
    agent: ReviewAgent
  ): Promise<ExecutionResult> {
    const result = await this.executeParallel(chunks, agent);

    // Check if fallback is needed
    if (
      this.config.execution.fallbackToSummary &&
      result.errors.length > chunks.length * 0.3
    ) {
      console.warn(
        `High failure rate (${result.errors.length}/${chunks.length}), falling back to summary mode`
      );

      // Generate summary for failed chunks
      for (const error of result.errors) {
        const chunk = chunks.find(c => c.id === error.chunkId);
        if (chunk) {
          result.results.push(this.generateFallbackSummary(chunk, error.error));
        }
      }

      // Clear errors since we provided fallback summaries
      result.errors = [];
    }

    return result;
  }

  /**
   * Generate a fallback summary for failed chunks
   */
  private generateFallbackSummary(
    chunk: ReviewChunk,
    errorMessage: string
  ): AgentReviewResult {
    return {
      chunkId: chunk.id,
      files: chunk.files.map(f => f.path),
      summary: `⚠️ Review failed: ${errorMessage}. Manual review recommended for: ${chunk.files.map(f => f.path).join(', ')}`,
      risks: [
        {
          severity: 'MEDIUM',
          file: chunk.files[0]?.path || 'unknown',
          issue: 'Automated review failed',
          description: `The automated review agent encountered an error: ${errorMessage}. Please manually review these changes.`,
        },
      ],
      suggestions: [],
      model: 'fallback',
      provider: 'fallback',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      duration: 0,
    };
  }

  /**
   * Register a progress callback
   */
  onProgress(callback: (progress: ExecutionProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Notify all progress callbacks
   */
  private notifyProgress(progress: ExecutionProgress): void {
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get execution statistics
   */
  getStatistics(result: ExecutionResult): {
    successRate: number;
    averageDuration: number;
    totalTokensUsed: number;
    failureRate: number;
  } {
    const successCount = result.results.length;
    const totalCount = result.progress.total;
    const totalTokens = result.results.reduce((sum, r) => sum + r.usage.totalTokens, 0);
    const totalDuration = result.results.reduce((sum, r) => sum + r.duration, 0);

    return {
      successRate: totalCount > 0 ? (successCount / totalCount) * 100 : 0,
      failureRate: totalCount > 0 ? (result.errors.length / totalCount) * 100 : 0,
      averageDuration: successCount > 0 ? totalDuration / successCount : 0,
      totalTokensUsed: totalTokens,
    };
  }
}
