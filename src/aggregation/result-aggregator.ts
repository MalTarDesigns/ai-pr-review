/**
 * Result Aggregator Module
 * Merges and deduplicates results from multiple review agents
 */

import { AgentReviewResult, Risk, Suggestion } from '../agents/review-agent';
import { loadLargeReviewConfig } from '../../config/large-review.config';

export interface AggregatedIssue extends Risk {
  occurrences: number;
  chunkIds: string[];
}

export interface AggregatedSuggestion extends Suggestion {
  occurrences: number;
  chunkIds: string[];
}

export interface NavigationMap {
  files: Array<{
    path: string;
    risks: number;
    suggestions: number;
    chunkIds: string[];
  }>;
}

export interface AggregatedResult {
  summary: string;
  risks: AggregatedIssue[];
  suggestions: AggregatedSuggestion[];
  navigation: NavigationMap;
  metadata: {
    totalChunks: number;
    totalFiles: number;
    totalTokens: number;
    totalDuration: number;
    providers: string[];
  };
}

export class ResultAggregator {
  private config = loadLargeReviewConfig();

  /**
   * Aggregate results from multiple agent reviews
   */
  aggregate(results: AgentReviewResult[]): AggregatedResult {
    if (results.length === 0) {
      return this.createEmptyResult();
    }

    // Deduplicate and merge issues
    const risks = this.deduplicateIssues(results);
    const suggestions = this.deduplicateSuggestions(results);

    // Prioritize findings
    const prioritizedRisks = this.prioritizeFindings(risks);
    const prioritizedSuggestions = this.prioritizeSuggestions(suggestions);

    // Generate overall summary
    const summary = this.generateSummary(results);

    // Create navigation map
    const navigation = this.createNavigationMap(results, risks, suggestions);

    // Collect metadata
    const metadata = this.collectMetadata(results);

    return {
      summary,
      risks: prioritizedRisks,
      suggestions: prioritizedSuggestions,
      navigation,
      metadata,
    };
  }

  /**
   * Deduplicate issues using similarity matching
   */
  private deduplicateIssues(results: AgentReviewResult[]): AggregatedIssue[] {
    const allRisks: Array<Risk & { chunkId: string }> = [];

    for (const result of results) {
      for (const risk of result.risks) {
        allRisks.push({ ...risk, chunkId: result.chunkId });
      }
    }

    const aggregated: AggregatedIssue[] = [];

    for (const risk of allRisks) {
      // Find similar existing issue
      const similar = aggregated.find(existing =>
        this.isSimilarIssue(existing, risk)
      );

      if (similar) {
        // Merge with existing
        similar.occurrences++;
        similar.chunkIds.push(risk.chunkId);

        // Keep higher severity
        if (this.getSeverityValue(risk.severity) > this.getSeverityValue(similar.severity)) {
          similar.severity = risk.severity;
        }
      } else {
        // Add as new issue
        aggregated.push({
          ...risk,
          occurrences: 1,
          chunkIds: [risk.chunkId],
        });
      }
    }

    return aggregated;
  }

  /**
   * Deduplicate suggestions
   */
  private deduplicateSuggestions(results: AgentReviewResult[]): AggregatedSuggestion[] {
    const allSuggestions: Array<Suggestion & { chunkId: string }> = [];

    for (const result of results) {
      for (const suggestion of result.suggestions) {
        allSuggestions.push({ ...suggestion, chunkId: result.chunkId });
      }
    }

    const aggregated: AggregatedSuggestion[] = [];

    for (const suggestion of allSuggestions) {
      const similar = aggregated.find(existing =>
        this.isSimilarSuggestion(existing, suggestion)
      );

      if (similar) {
        similar.occurrences++;
        similar.chunkIds.push(suggestion.chunkId);
      } else {
        aggregated.push({
          ...suggestion,
          occurrences: 1,
          chunkIds: [suggestion.chunkId],
        });
      }
    }

    return aggregated;
  }

  /**
   * Check if two issues are similar
   */
  private isSimilarIssue(issue1: Risk, issue2: Risk): boolean {
    // Same file and similar issue text
    if (issue1.file !== issue2.file) {
      return false;
    }

    // Calculate text similarity
    const similarity = this.calculateSimilarity(issue1.issue, issue2.issue);

    return similarity >= this.config.aggregation.deduplicationThreshold;
  }

  /**
   * Check if two suggestions are similar
   */
  private isSimilarSuggestion(sugg1: Suggestion, sugg2: Suggestion): boolean {
    if (sugg1.file !== sugg2.file || sugg1.type !== sugg2.type) {
      return false;
    }

    const similarity = this.calculateSimilarity(sugg1.suggestion, sugg2.suggestion);

    return similarity >= this.config.aggregation.deduplicationThreshold;
  }

  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Prioritize findings by severity and impact
   */
  private prioritizeFindings(issues: AggregatedIssue[]): AggregatedIssue[] {
    return issues.sort((a, b) => {
      // Sort by severity first
      const severityDiff = this.getSeverityValue(b.severity) - this.getSeverityValue(a.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      // Then by occurrences
      return b.occurrences - a.occurrences;
    });
  }

  /**
   * Prioritize suggestions
   */
  private prioritizeSuggestions(suggestions: AggregatedSuggestion[]): AggregatedSuggestion[] {
    const typeOrder = { security: 4, performance: 3, 'best-practice': 2, 'code-quality': 1 };

    return suggestions.sort((a, b) => {
      const typeDiff = (typeOrder[b.type] || 0) - (typeOrder[a.type] || 0);
      if (typeDiff !== 0) {
        return typeDiff;
      }

      return b.occurrences - a.occurrences;
    });
  }

  /**
   * Get numeric value for severity
   */
  private getSeverityValue(severity: 'HIGH' | 'MEDIUM' | 'LOW'): number {
    const values = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return values[severity] || 0;
  }

  /**
   * Generate overall summary
   */
  private generateSummary(results: AgentReviewResult[]): string {
    const summaries = results.map(r => r.summary).filter(s => s && s.length > 0);

    if (summaries.length === 0) {
      return 'No summary available';
    }

    // Combine unique summaries
    const uniqueSummaries = [...new Set(summaries)];

    if (uniqueSummaries.length === 1) {
      return uniqueSummaries[0];
    }

    return `Multiple changes across ${results.length} chunks: ${uniqueSummaries.slice(0, 3).join('; ')}`;
  }

  /**
   * Create navigation map for files
   */
  private createNavigationMap(
    results: AgentReviewResult[],
    risks: AggregatedIssue[],
    suggestions: AggregatedSuggestion[]
  ): NavigationMap {
    const fileMap = new Map<string, { risks: number; suggestions: number; chunkIds: Set<string> }>();

    // Collect file data
    for (const result of results) {
      for (const file of result.files) {
        if (!fileMap.has(file)) {
          fileMap.set(file, { risks: 0, suggestions: 0, chunkIds: new Set() });
        }
        fileMap.get(file)!.chunkIds.add(result.chunkId);
      }
    }

    // Count risks per file
    for (const risk of risks) {
      const fileData = fileMap.get(risk.file);
      if (fileData) {
        fileData.risks++;
      }
    }

    // Count suggestions per file
    for (const suggestion of suggestions) {
      const fileData = fileMap.get(suggestion.file);
      if (fileData) {
        fileData.suggestions++;
      }
    }

    return {
      files: Array.from(fileMap.entries()).map(([path, data]) => ({
        path,
        risks: data.risks,
        suggestions: data.suggestions,
        chunkIds: Array.from(data.chunkIds),
      })),
    };
  }

  /**
   * Collect metadata from results
   */
  private collectMetadata(results: AgentReviewResult[]): AggregatedResult['metadata'] {
    const uniqueFiles = new Set<string>();
    const providers = new Set<string>();
    let totalTokens = 0;
    let totalDuration = 0;

    for (const result of results) {
      for (const file of result.files) {
        uniqueFiles.add(file);
      }

      providers.add(result.provider);
      totalTokens += result.usage.totalTokens;
      totalDuration += result.duration;
    }

    return {
      totalChunks: results.length,
      totalFiles: uniqueFiles.size,
      totalTokens,
      totalDuration,
      providers: Array.from(providers),
    };
  }

  /**
   * Create empty result
   */
  private createEmptyResult(): AggregatedResult {
    return {
      summary: 'No review results available',
      risks: [],
      suggestions: [],
      navigation: { files: [] },
      metadata: {
        totalChunks: 0,
        totalFiles: 0,
        totalTokens: 0,
        totalDuration: 0,
        providers: [],
      },
    };
  }
}
