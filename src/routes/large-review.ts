/**
 * Large PR Review Route
 * Handles large pull request reviews using chunked agent-based strategy
 */

import { Router, Request, Response } from 'express';
import { DiffParser } from '../chunking/diff-parser';
import { ChunkOrchestrator } from '../chunking/chunk-orchestrator';
import { ReviewAgent } from '../agents/review-agent';
import { ParallelExecutor } from '../agents/parallel-executor';
import { ResultAggregator } from '../aggregation/result-aggregator';
import { ReviewSynthesizer, PRMetadata } from '../aggregation/review-synthesizer';
import { LLMProvider } from '../providers';
import { loadLargeReviewConfig } from '../../config/large-review.config';
import { validateLargeReviewRequest } from '../middleware/smart-router';

export interface LargeReviewRequest {
  diff: string;
  author?: string;
  branch?: string;
  commitHash?: string;
  commitMessage?: string;
  files?: string[];
}

export interface LargeReviewResponse {
  review: string;
  metadata: {
    strategy: string;
    chunks: number;
    files: number;
    totalTokens: number;
    duration: number;
    providers: string[];
    timestamp: string;
  };
  statistics?: {
    parsing: {
      totalFiles: number;
      highRiskFiles: number;
      mediumRiskFiles: number;
      lowRiskFiles: number;
      averageComplexity: number;
    };
    chunking: {
      totalChunks: number;
      averageChunkSize: number;
      largestChunk: number;
    };
    execution: {
      successRate: number;
      failureRate: number;
      averageChunkDuration: number;
    };
  };
}

export function createLargeReviewRouter(
  primaryProvider: LLMProvider,
  fallbackProviders: LLMProvider[] = []
): Router {
  const router = Router();
  const config = loadLargeReviewConfig();

  router.post('/', validateLargeReviewRequest, async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const {
        diff,
        author,
        branch,
        commitHash,
        commitMessage,
        files,
      } = req.body as LargeReviewRequest;

      console.log(`[LargeReview] Starting review for ${diff.length} character diff`);

      // Step 1: Parse diff into files
      const diffParser = new DiffParser();
      const parseResult = diffParser.parseToFiles(diff);

      console.log(`[LargeReview] Parsed ${parseResult.files.length} files`);

      if (parseResult.files.length === 0) {
        return res.json({
          review: '## AI Code Review\n\nNo file changes detected in the diff.',
          metadata: {
            strategy: 'chunked',
            chunks: 0,
            files: 0,
            totalTokens: 0,
            duration: Date.now() - startTime,
            providers: [],
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Step 2: Create optimized chunks
      const chunkOrchestrator = new ChunkOrchestrator(config.chunking);
      const chunks = chunkOrchestrator.createChunks(parseResult.files);

      console.log(`[LargeReview] Created ${chunks.length} chunks`);

      // Step 3: Execute parallel reviews with primary provider
      const providers = [primaryProvider, ...fallbackProviders];
      let executionResult;
      let usedProvider = primaryProvider;

      for (const provider of providers) {
        try {
          const reviewAgent = new ReviewAgent(provider);
          const parallelExecutor = new ParallelExecutor();

          // Set up progress logging
          parallelExecutor.onProgress(progress => {
            console.log(
              `[LargeReview] Progress: ${progress.completed}/${progress.total} chunks (${progress.failed} failed)`
            );
          });

          executionResult = await parallelExecutor.executeWithFallback(chunks, reviewAgent);
          usedProvider = provider;

          console.log(`[LargeReview] Execution completed with provider: ${provider.name}`);
          break;
        } catch (error) {
          console.error(`[LargeReview] Provider ${provider.name} failed:`, error);

          if (provider === providers[providers.length - 1]) {
            throw error;
          }

          console.log('[LargeReview] Trying fallback provider...');
        }
      }

      if (!executionResult) {
        throw new Error('All providers failed to complete the review');
      }

      // Step 4: Aggregate results
      const resultAggregator = new ResultAggregator();
      const aggregatedResult = resultAggregator.aggregate(executionResult.results);

      console.log(
        `[LargeReview] Aggregated ${aggregatedResult.risks.length} risks and ${aggregatedResult.suggestions.length} suggestions`
      );

      // Step 5: Synthesize final review
      const reviewSynthesizer = new ReviewSynthesizer();
      const prMetadata: PRMetadata = {
        author,
        branch,
        commitHash,
        commitMessage,
      };

      const finalReview = await reviewSynthesizer.synthesize(aggregatedResult, prMetadata);

      console.log(`[LargeReview] Review completed in ${Date.now() - startTime}ms`);

      // Prepare response with statistics
      const diffStats = diffParser.getStatistics(parseResult);
      const chunkStats = chunkOrchestrator.getChunkStatistics(chunks);
      const execStats = new ParallelExecutor().getStatistics(executionResult);

      const response: LargeReviewResponse = {
        review: finalReview.content,
        metadata: finalReview.metadata,
        statistics: {
          parsing: {
            totalFiles: diffStats.totalFiles,
            highRiskFiles: diffStats.highRiskFiles,
            mediumRiskFiles: diffStats.mediumRiskFiles,
            lowRiskFiles: diffStats.lowRiskFiles,
            averageComplexity: diffStats.averageComplexity,
          },
          chunking: {
            totalChunks: chunkStats.totalChunks,
            averageChunkSize: chunkStats.averageChunkSize,
            largestChunk: chunkStats.largestChunkSize,
          },
          execution: {
            successRate: execStats.successRate,
            failureRate: execStats.failureRate,
            averageChunkDuration: execStats.averageDuration,
          },
        },
      };

      res.json(response);
    } catch (error) {
      console.error('[LargeReview] Error:', error);

      res.status(500).json({
        error: 'Large review failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
