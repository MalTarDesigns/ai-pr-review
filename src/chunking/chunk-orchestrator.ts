/**
 * Chunk Orchestrator Module
 * Creates optimized chunks of files for parallel review
 */

import { FileChange } from './diff-parser';

export interface ReviewChunk {
  id: string;
  files: FileChange[];
  totalSize: number;
  priority: number;
  estimatedTokens: number;
  riskLevel: 'high-risk' | 'medium-risk' | 'low-risk';
}

export interface ChunkingOptions {
  maxChunkSize: number;
  maxFilesPerChunk: number;
  minChunkSize: number;
  prioritizeHighRisk: boolean;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  maxChunkSize: 8000,
  maxFilesPerChunk: 10,
  minChunkSize: 2000,
  prioritizeHighRisk: true,
};

export class ChunkOrchestrator {
  private options: ChunkingOptions;

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Create optimized chunks from file changes
   * Uses bin packing algorithm with priority sorting
   */
  createChunks(files: FileChange[]): ReviewChunk[] {
    if (files.length === 0) {
      return [];
    }

    // Sort files by priority first
    const sortedFiles = this.prioritizeHighRisk
      ? this.sortFilesByPriority(files)
      : [...files];

    // Apply bin packing algorithm
    const chunks = this.binPackFiles(sortedFiles);

    // Optimize chunk sizes
    const optimizedChunks = this.optimizeChunks(chunks);

    // Assign priority to each chunk
    return this.prioritizeChunks(optimizedChunks);
  }

  /**
   * Sort files by priority (high-risk first, then by complexity)
   */
  private sortFilesByPriority(files: FileChange[]): FileChange[] {
    return [...files].sort((a, b) => {
      // Risk category priority
      const riskPriority = {
        'high-risk': 3,
        'medium-risk': 2,
        'low-risk': 1,
      };

      const aPriority = riskPriority[a.category];
      const bPriority = riskPriority[b.category];

      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }

      // Within same risk category, sort by complexity
      return b.complexity - a.complexity;
    });
  }

  /**
   * Bin packing algorithm to group files into chunks
   * Uses First Fit Decreasing (FFD) strategy
   */
  private binPackFiles(files: FileChange[]): ReviewChunk[] {
    const chunks: ReviewChunk[] = [];
    let chunkId = 0;

    for (const file of files) {
      const fileSize = file.diff.length;

      // Try to fit file into existing chunk
      let placed = false;

      for (const chunk of chunks) {
        const canFit =
          chunk.totalSize + fileSize <= this.options.maxChunkSize &&
          chunk.files.length < this.options.maxFilesPerChunk;

        if (canFit) {
          chunk.files.push(file);
          chunk.totalSize += fileSize;
          chunk.estimatedTokens = this.estimateTokens(chunk.totalSize);
          placed = true;
          break;
        }
      }

      // Create new chunk if file doesn't fit
      if (!placed) {
        chunks.push({
          id: `chunk-${chunkId++}`,
          files: [file],
          totalSize: fileSize,
          priority: 0, // Will be calculated later
          estimatedTokens: this.estimateTokens(fileSize),
          riskLevel: file.category,
        });
      }
    }

    return chunks;
  }

  /**
   * Optimize chunks by balancing size and ensuring minimum chunk size
   */
  optimizeChunks(chunks: ReviewChunk[]): ReviewChunk[] {
    const optimized: ReviewChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // If chunk is too small, try to merge with next chunk
      if (chunk.totalSize < this.options.minChunkSize && i < chunks.length - 1) {
        const nextChunk = chunks[i + 1];
        const combinedSize = chunk.totalSize + nextChunk.totalSize;

        if (combinedSize <= this.options.maxChunkSize) {
          // Merge chunks
          const mergedChunk: ReviewChunk = {
            id: chunk.id,
            files: [...chunk.files, ...nextChunk.files],
            totalSize: combinedSize,
            priority: Math.max(chunk.priority, nextChunk.priority),
            estimatedTokens: this.estimateTokens(combinedSize),
            riskLevel: this.getMergedRiskLevel(chunk.riskLevel, nextChunk.riskLevel),
          };

          optimized.push(mergedChunk);
          i++; // Skip next chunk since we merged it
          continue;
        }
      }

      optimized.push(chunk);
    }

    return optimized;
  }

  /**
   * Prioritize chunks by risk level and complexity
   */
  prioritizeChunks(chunks: ReviewChunk[]): ReviewChunk[] {
    return chunks.map((chunk, index) => {
      const priority = this.calculateChunkPriority(chunk);

      return {
        ...chunk,
        priority,
      };
    }).sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  /**
   * Calculate priority score for a chunk
   */
  private calculateChunkPriority(chunk: ReviewChunk): number {
    let priority = 0;

    // Risk level weight
    const riskWeights = {
      'high-risk': 100,
      'medium-risk': 50,
      'low-risk': 10,
    };
    priority += riskWeights[chunk.riskLevel];

    // High-risk file count
    const highRiskCount = chunk.files.filter(f => f.category === 'high-risk').length;
    priority += highRiskCount * 20;

    // Average complexity
    const avgComplexity = chunk.files.reduce((sum, f) => sum + f.complexity, 0) / chunk.files.length;
    priority += avgComplexity;

    // Security-related files get extra priority
    const hasSecurityFiles = chunk.files.some(f =>
      f.path.toLowerCase().includes('auth') ||
      f.path.toLowerCase().includes('security') ||
      f.path.toLowerCase().includes('password')
    );
    if (hasSecurityFiles) {
      priority += 50;
    }

    return Math.round(priority);
  }

  /**
   * Get the highest risk level from two risk levels
   */
  private getMergedRiskLevel(
    level1: 'high-risk' | 'medium-risk' | 'low-risk',
    level2: 'high-risk' | 'medium-risk' | 'low-risk'
  ): 'high-risk' | 'medium-risk' | 'low-risk' {
    const riskOrder = ['high-risk', 'medium-risk', 'low-risk'];
    return riskOrder.find(level => level === level1 || level === level2) as any;
  }

  /**
   * Estimate token count from character count
   * Rough estimate: 1 token ≈ 4 characters for code
   */
  private estimateTokens(charCount: number): number {
    return Math.ceil(charCount / 4);
  }

  /**
   * Get the prioritization flag
   */
  private get prioritizeHighRisk(): boolean {
    return this.options.prioritizeHighRisk;
  }

  /**
   * Get chunk statistics
   */
  getChunkStatistics(chunks: ReviewChunk[]): {
    totalChunks: number;
    highRiskChunks: number;
    mediumRiskChunks: number;
    lowRiskChunks: number;
    averageChunkSize: number;
    averageFilesPerChunk: number;
    estimatedTotalTokens: number;
    largestChunkSize: number;
    smallestChunkSize: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        highRiskChunks: 0,
        mediumRiskChunks: 0,
        lowRiskChunks: 0,
        averageChunkSize: 0,
        averageFilesPerChunk: 0,
        estimatedTotalTokens: 0,
        largestChunkSize: 0,
        smallestChunkSize: 0,
      };
    }

    const totalSize = chunks.reduce((sum, c) => sum + c.totalSize, 0);
    const totalFiles = chunks.reduce((sum, c) => sum + c.files.length, 0);
    const totalTokens = chunks.reduce((sum, c) => sum + c.estimatedTokens, 0);

    return {
      totalChunks: chunks.length,
      highRiskChunks: chunks.filter(c => c.riskLevel === 'high-risk').length,
      mediumRiskChunks: chunks.filter(c => c.riskLevel === 'medium-risk').length,
      lowRiskChunks: chunks.filter(c => c.riskLevel === 'low-risk').length,
      averageChunkSize: Math.round(totalSize / chunks.length),
      averageFilesPerChunk: Math.round((totalFiles / chunks.length) * 10) / 10,
      estimatedTotalTokens: totalTokens,
      largestChunkSize: Math.max(...chunks.map(c => c.totalSize)),
      smallestChunkSize: Math.min(...chunks.map(c => c.totalSize)),
    };
  }

  /**
   * Split a single large file into multiple chunks if needed
   */
  splitLargeFile(file: FileChange): FileChange[] {
    if (file.diff.length <= this.options.maxChunkSize) {
      return [file];
    }

    // Split file diff into chunks
    const chunks: FileChange[] = [];
    const lines = file.diff.split('\n');
    let currentChunk: string[] = [];
    let currentSize = 0;
    let chunkIndex = 0;

    for (const line of lines) {
      const lineSize = line.length + 1; // +1 for newline

      if (currentSize + lineSize > this.options.maxChunkSize && currentChunk.length > 0) {
        // Create a chunk
        chunks.push({
          ...file,
          diff: currentChunk.join('\n'),
          path: `${file.path} (part ${chunkIndex + 1})`,
        });

        currentChunk = [];
        currentSize = 0;
        chunkIndex++;
      }

      currentChunk.push(line);
      currentSize += lineSize;
    }

    // Add remaining lines
    if (currentChunk.length > 0) {
      chunks.push({
        ...file,
        diff: currentChunk.join('\n'),
        path: `${file.path} (part ${chunkIndex + 1})`,
      });
    }

    return chunks;
  }
}
