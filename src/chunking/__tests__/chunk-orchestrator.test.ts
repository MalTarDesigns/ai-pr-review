/**
 * Unit tests for ChunkOrchestrator
 */

import { ChunkOrchestrator, ReviewChunk } from '../chunk-orchestrator';
import { FileChange } from '../diff-parser';

describe('ChunkOrchestrator', () => {
  let orchestrator: ChunkOrchestrator;

  beforeEach(() => {
    orchestrator = new ChunkOrchestrator({
      maxChunkSize: 1000,
      maxFilesPerChunk: 5,
      minChunkSize: 200,
      prioritizeHighRisk: true,
    });
  });

  const createMockFile = (
    path: string,
    size: number,
    category: 'high-risk' | 'medium-risk' | 'low-risk' = 'low-risk',
    complexity: number = 10
  ): FileChange => ({
    path,
    additions: Math.floor(size / 50),
    deletions: Math.floor(size / 100),
    diff: 'x'.repeat(size),
    complexity,
    category,
    fileType: '.ts',
    isBinary: false,
  });

  describe('createChunks', () => {
    it('should create a single chunk for small file set', () => {
      const files = [
        createMockFile('file1.ts', 200),
        createMockFile('file2.ts', 300),
      ];

      const chunks = orchestrator.createChunks(files);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].files).toHaveLength(2);
      expect(chunks[0].totalSize).toBe(500);
    });

    it('should create multiple chunks when files exceed max chunk size', () => {
      const files = [
        createMockFile('file1.ts', 800),
        createMockFile('file2.ts', 600),
        createMockFile('file3.ts', 400),
      ];

      const chunks = orchestrator.createChunks(files);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.totalSize).toBeLessThanOrEqual(1000);
      });
    });

    it('should respect max files per chunk limit', () => {
      const files = Array.from({ length: 10 }, (_, i) =>
        createMockFile(`file${i}.ts`, 50)
      );

      const chunks = orchestrator.createChunks(files);

      chunks.forEach(chunk => {
        expect(chunk.files.length).toBeLessThanOrEqual(5);
      });
    });

    it('should prioritize high-risk files first', () => {
      const files = [
        createMockFile('low1.ts', 600, 'low-risk'),
        createMockFile('high1.ts', 600, 'high-risk'),
        createMockFile('medium1.ts', 600, 'medium-risk'),
      ];

      const chunks = orchestrator.createChunks(files);

      // Should create separate chunks due to size, first chunk should be high-risk
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].riskLevel).toBe('high-risk');

      // High-risk chunk should have higher priority than low-risk
      const highRiskChunk = chunks.find(c => c.riskLevel === 'high-risk');
      const lowRiskChunk = chunks.find(c => c.riskLevel === 'low-risk');

      if (highRiskChunk && lowRiskChunk) {
        expect(highRiskChunk.priority).toBeGreaterThan(lowRiskChunk.priority);
      }
    });

    it('should handle empty file array', () => {
      const chunks = orchestrator.createChunks([]);
      expect(chunks).toHaveLength(0);
    });

    it('should assign unique IDs to chunks', () => {
      const files = [
        createMockFile('file1.ts', 800),
        createMockFile('file2.ts', 600),
        createMockFile('file3.ts', 400),
      ];

      const chunks = orchestrator.createChunks(files);

      const ids = chunks.map(c => c.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('optimizeChunks', () => {
    it('should merge small chunks when possible', () => {
      // Create orchestrator with small min chunk size for testing
      const testOrchestrator = new ChunkOrchestrator({
        maxChunkSize: 1000,
        minChunkSize: 300,
        maxFilesPerChunk: 10,
      });

      const files = [
        createMockFile('small1.ts', 150),
        createMockFile('small2.ts', 150),
        createMockFile('large1.ts', 800),
      ];

      const chunks = testOrchestrator.createChunks(files);

      // Should merge the two small files into one chunk
      expect(chunks.length).toBeLessThanOrEqual(2);
    });
  });

  describe('prioritizeChunks', () => {
    it('should assign higher priority to high-risk chunks', () => {
      const files = [
        createMockFile('high.ts', 500, 'high-risk', 50),
        createMockFile('low.ts', 500, 'low-risk', 10),
      ];

      const chunks = orchestrator.createChunks(files);

      const highRiskChunk = chunks.find(c => c.riskLevel === 'high-risk');
      const lowRiskChunk = chunks.find(c => c.riskLevel === 'low-risk');

      if (highRiskChunk && lowRiskChunk) {
        expect(highRiskChunk.priority).toBeGreaterThan(lowRiskChunk.priority);
      }
    });

    it('should sort chunks by priority descending', () => {
      const files = [
        createMockFile('low.ts', 400, 'low-risk', 5),
        createMockFile('high.ts', 400, 'high-risk', 50),
        createMockFile('medium.ts', 400, 'medium-risk', 25),
      ];

      const chunks = orchestrator.createChunks(files);

      // Verify chunks are sorted by priority (highest first)
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].priority).toBeGreaterThanOrEqual(chunks[i + 1].priority);
      }
    });
  });

  describe('getChunkStatistics', () => {
    it('should calculate correct statistics', () => {
      const files = [
        createMockFile('high1.ts', 400, 'high-risk'),
        createMockFile('high2.ts', 400, 'high-risk'),
        createMockFile('medium1.ts', 400, 'medium-risk'),
        createMockFile('low1.ts', 200, 'low-risk'),
      ];

      const chunks = orchestrator.createChunks(files);
      const stats = orchestrator.getChunkStatistics(chunks);

      expect(stats.totalChunks).toBe(chunks.length);
      expect(stats.highRiskChunks).toBeGreaterThanOrEqual(1);
      expect(stats.averageChunkSize).toBeGreaterThan(0);
      expect(stats.estimatedTotalTokens).toBeGreaterThan(0);
      expect(stats.largestChunkSize).toBeGreaterThanOrEqual(stats.smallestChunkSize);
    });

    it('should handle empty chunks array', () => {
      const stats = orchestrator.getChunkStatistics([]);

      expect(stats.totalChunks).toBe(0);
      expect(stats.averageChunkSize).toBe(0);
      expect(stats.estimatedTotalTokens).toBe(0);
    });
  });

  describe('splitLargeFile', () => {
    it('should split a very large file into multiple chunks', () => {
      // Create a large file with newlines (more realistic)
      const largeFileContent = Array.from({ length: 200 }, (_, i) => `+line ${i}`).join('\n');
      const largeFile: FileChange = {
        path: 'huge.ts',
        additions: 200,
        deletions: 0,
        diff: largeFileContent,
        complexity: 10,
        category: 'low-risk',
        fileType: '.ts',
        isBinary: false,
      };

      const splitFiles = orchestrator.splitLargeFile(largeFile);

      expect(splitFiles.length).toBeGreaterThan(1);
      splitFiles.forEach(file => {
        expect(file.diff.length).toBeLessThanOrEqual(1000);
      });
    });

    it('should not split files smaller than max chunk size', () => {
      const smallFile = createMockFile('small.ts', 500);

      const splitFiles = orchestrator.splitLargeFile(smallFile);

      expect(splitFiles).toHaveLength(1);
      expect(splitFiles[0]).toEqual(smallFile);
    });

    it('should preserve file metadata when splitting', () => {
      const file = createMockFile('test.ts', 2000, 'high-risk', 30);

      const splitFiles = orchestrator.splitLargeFile(file);

      splitFiles.forEach(split => {
        expect(split.category).toBe('high-risk');
        expect(split.complexity).toBe(30);
        expect(split.fileType).toBe('.ts');
      });
    });

    it('should append part numbers to split file paths', () => {
      const file = createMockFile('test.ts', 3000);

      const splitFiles = orchestrator.splitLargeFile(file);

      splitFiles.forEach((split, index) => {
        expect(split.path).toContain(`part ${index + 1}`);
      });
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      const files = [createMockFile('test.ts', 400)];
      const chunks = orchestrator.createChunks(files);

      expect(chunks[0].estimatedTokens).toBe(Math.ceil(400 / 4));
    });
  });

  describe('bin packing optimization', () => {
    it('should efficiently pack files into minimum number of chunks', () => {
      const files = [
        createMockFile('file1.ts', 300),
        createMockFile('file2.ts', 300),
        createMockFile('file3.ts', 300),
        createMockFile('file4.ts', 200),
      ];

      const chunks = orchestrator.createChunks(files);

      // Should fit into 2 chunks (600 + 500) rather than 3 or 4
      expect(chunks.length).toBeLessThanOrEqual(2);
    });

    it('should not exceed max chunk size when packing', () => {
      const files = Array.from({ length: 20 }, (_, i) =>
        createMockFile(`file${i}.ts`, Math.floor(Math.random() * 400) + 100)
      );

      const chunks = orchestrator.createChunks(files);

      chunks.forEach(chunk => {
        expect(chunk.totalSize).toBeLessThanOrEqual(1000);
      });
    });
  });
});
