/**
 * Integration tests for large PR review system
 */

import { DiffParser } from '../../chunking/diff-parser';
import { ChunkOrchestrator } from '../../chunking/chunk-orchestrator';
import { ResultAggregator } from '../../aggregation/result-aggregator';
import { ReviewSynthesizer } from '../../aggregation/review-synthesizer';
import { AgentReviewResult } from '../../agents/review-agent';

describe('Large PR Review Integration', () => {
  describe('End-to-end review flow', () => {
    it('should parse, chunk, and aggregate a multi-file diff', () => {
      // Sample diff with multiple files
      const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,10 +1,15 @@
 import jwt from 'jsonwebtoken';
+import bcrypt from 'bcrypt';

 export function authenticate(username: string, password: string) {
-  const query = \`SELECT * FROM users WHERE username = '\${username}'\`;
+  const user = await db.query('SELECT * FROM users WHERE username = $1', [username]);
+
+  if (!user) {
+    return null;
+  }
+
+  const valid = await bcrypt.compare(password, user.passwordHash);
+  return valid ? user : null;
 }

diff --git a/src/utils.ts b/src/utils.ts
index 9876543..fedcba9 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,8 @@
 export function formatDate(date: Date): string {
-  return date.toString();
+  return date.toISOString();
+}
+
+export function slugify(text: string): string {
+  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
 }`;

      // Step 1: Parse diff
      const parser = new DiffParser();
      const parseResult = parser.parseToFiles(sampleDiff);

      expect(parseResult.files).toHaveLength(2);
      expect(parseResult.files[0].path).toBe('src/auth.ts');
      expect(parseResult.files[1].path).toBe('src/utils.ts');

      // Step 2: Create chunks
      const orchestrator = new ChunkOrchestrator({
        maxChunkSize: 8000,
        maxFilesPerChunk: 10,
        minChunkSize: 2000,
        prioritizeHighRisk: true,
      });

      const chunks = orchestrator.createChunks(parseResult.files);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].files.length).toBeGreaterThan(0);

      // Step 3: Simulate agent results
      const mockResults: AgentReviewResult[] = chunks.map(chunk => ({
        chunkId: chunk.id,
        files: chunk.files.map(f => f.path),
        summary: `Reviewed ${chunk.files.length} files`,
        risks: [
          {
            severity: 'HIGH',
            file: chunk.files[0].path,
            line: 10,
            issue: 'Potential security issue',
            description: 'SQL injection vulnerability detected',
            suggestion: 'Use parameterized queries',
          },
        ],
        suggestions: [
          {
            file: chunk.files[0].path,
            line: 5,
            type: 'best-practice',
            suggestion: 'Consider adding error handling',
          },
        ],
        model: 'test-model',
        provider: 'test-provider',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        duration: 1000,
      }));

      // Step 4: Aggregate results
      const aggregator = new ResultAggregator();
      const aggregated = aggregator.aggregate(mockResults);

      expect(aggregated.risks.length).toBeGreaterThan(0);
      expect(aggregated.suggestions.length).toBeGreaterThan(0);
      expect(aggregated.metadata.totalChunks).toBe(chunks.length);

      // Step 5: Synthesize final review
      const synthesizer = new ReviewSynthesizer();
      const finalReview = synthesizer.synthesize(aggregated, {
        author: 'test-user',
        branch: 'feature/test',
      });

      expect(finalReview).toBeDefined();
      expect(finalReview.then).toBeDefined(); // Is a promise
    });

    it('should handle empty diff gracefully', () => {
      const parser = new DiffParser();
      const result = parser.parseToFiles('');

      expect(result.files).toHaveLength(0);
      expect(result.totalAdditions).toBe(0);
      expect(result.totalDeletions).toBe(0);
    });

    it('should prioritize high-risk files in chunks', () => {
      const diff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,3 +1,5 @@
+eval(userInput);
 function login() {}

diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
+# Documentation update`;

      const parser = new DiffParser();
      const parseResult = parser.parseToFiles(diff);

      const orchestrator = new ChunkOrchestrator({
        maxChunkSize: 8000,
        maxFilesPerChunk: 10,
        minChunkSize: 200,
        prioritizeHighRisk: true,
      });

      const chunks = orchestrator.createChunks(parseResult.files);

      // High-risk file should be prioritized (eval detected)
      const highRiskChunk = chunks.find(c => c.riskLevel === 'high-risk');
      expect(highRiskChunk).toBeDefined();

      if (highRiskChunk) {
        expect(highRiskChunk.priority).toBeGreaterThan(0);
      }
    });

    it('should deduplicate similar issues across chunks', () => {
      const mockResults: AgentReviewResult[] = [
        {
          chunkId: 'chunk-1',
          files: ['file1.ts'],
          summary: 'Review 1',
          risks: [
            {
              severity: 'HIGH',
              file: 'file1.ts',
              line: 10,
              issue: 'SQL injection vulnerability',
              description: 'Unsafe query construction',
            },
          ],
          suggestions: [],
          model: 'test',
          provider: 'test',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          duration: 1000,
        },
        {
          chunkId: 'chunk-2',
          files: ['file1.ts'],
          summary: 'Review 2',
          risks: [
            {
              severity: 'MEDIUM',
              file: 'file1.ts',
              line: 10,
              issue: 'SQL injection vulnerability',
              description: 'Unsafe query construction',
            },
          ],
          suggestions: [],
          model: 'test',
          provider: 'test',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          duration: 1000,
        },
      ];

      const aggregator = new ResultAggregator();
      const result = aggregator.aggregate(mockResults);

      // Should deduplicate to 1 issue, keeping higher severity
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].severity).toBe('HIGH');
      expect(result.risks[0].occurrences).toBe(2);
    });
  });

  describe('Statistics and metadata', () => {
    it('should calculate correct statistics', () => {
      const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,10 +1,20 @@
+${'function test() {}\n'.repeat(10)}`;

      const parser = new DiffParser();
      const result = parser.parseToFiles(diff);
      const stats = parser.getStatistics(result);

      expect(stats.totalFiles).toBe(1);
      expect(stats.totalChanges).toBeGreaterThan(0);
      expect(stats.averageComplexity).toBeGreaterThan(0);
    });

    it('should estimate tokens correctly', () => {
      const orchestrator = new ChunkOrchestrator();
      const mockFile = {
        path: 'test.ts',
        additions: 50,
        deletions: 20,
        diff: 'x'.repeat(400),
        complexity: 10,
        category: 'low-risk' as const,
        fileType: '.ts',
        isBinary: false,
      };

      const chunks = orchestrator.createChunks([mockFile]);

      expect(chunks[0].estimatedTokens).toBe(Math.ceil(400 / 4));
    });
  });
});
