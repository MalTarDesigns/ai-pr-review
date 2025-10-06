/**
 * Review Synthesizer Module
 * Creates the final formatted review output from aggregated results
 */

import { AggregatedResult, AggregatedIssue, AggregatedSuggestion } from './result-aggregator';
import { loadLargeReviewConfig } from '../../config/large-review.config';

export interface PRMetadata {
  author?: string;
  branch?: string;
  commitHash?: string;
  commitMessage?: string;
  totalLines?: number;
}

export interface FinalReview {
  content: string;
  metadata: {
    strategy: 'standard' | 'chunked' | 'hierarchical';
    chunks: number;
    files: number;
    totalTokens: number;
    duration: number;
    providers: string[];
    timestamp: string;
  };
}

export class ReviewSynthesizer {
  private config = loadLargeReviewConfig();

  /**
   * Synthesize final review from aggregated results
   */
  async synthesize(
    aggregated: AggregatedResult,
    prMetadata: PRMetadata = {}
  ): Promise<FinalReview> {
    const content = this.formatOutput(aggregated, prMetadata);

    return {
      content,
      metadata: {
        strategy: 'chunked',
        chunks: aggregated.metadata.totalChunks,
        files: aggregated.metadata.totalFiles,
        totalTokens: aggregated.metadata.totalTokens,
        duration: aggregated.metadata.totalDuration,
        providers: aggregated.metadata.providers,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Format the final output as markdown
   */
  private formatOutput(aggregated: AggregatedResult, prMetadata: PRMetadata): string {
    const sections: string[] = [];

    // Header
    sections.push(this.createHeader(aggregated, prMetadata));

    // Executive Summary
    sections.push(this.createExecutiveSummary(aggregated));

    // Critical Issues
    const criticalIssues = aggregated.risks.filter(r => r.severity === 'HIGH');
    if (criticalIssues.length > 0) {
      sections.push(this.createCriticalIssuesSection(criticalIssues));
    }

    // Medium Priority Items
    const mediumIssues = aggregated.risks.filter(r => r.severity === 'MEDIUM');
    if (mediumIssues.length > 0) {
      sections.push(this.createMediumPrioritySection(mediumIssues));
    }

    // Low Priority Items (if configured)
    if (this.config.aggregation.includeLowSeverity) {
      const lowIssues = aggregated.risks.filter(r => r.severity === 'LOW');
      if (lowIssues.length > 0) {
        sections.push(this.createLowPrioritySection(lowIssues));
      }
    }

    // Suggestions
    if (aggregated.suggestions.length > 0) {
      sections.push(this.createSuggestionsSection(aggregated.suggestions));
    }

    // File-by-File Breakdown
    if (aggregated.navigation.files.length > 0) {
      sections.push(this.createFileBreakdown(aggregated.navigation));
    }

    // Statistics
    sections.push(this.createStatisticsSection(aggregated));

    return sections.join('\n\n---\n\n');
  }

  /**
   * Create header section
   */
  private createHeader(aggregated: AggregatedResult, prMetadata: PRMetadata): string {
    let header = '## AI Code Review Summary\n\n';

    if (prMetadata.author || prMetadata.branch) {
      header += '**Pull Request Details:**\n';

      if (prMetadata.author) {
        header += `- Author: ${prMetadata.author}\n`;
      }
      if (prMetadata.branch) {
        header += `- Branch: ${prMetadata.branch}\n`;
      }
      if (prMetadata.commitHash) {
        header += `- Commit: ${prMetadata.commitHash}\n`;
      }
      if (prMetadata.commitMessage) {
        header += `- Message: ${prMetadata.commitMessage}\n`;
      }

      header += '\n';
    }

    return header;
  }

  /**
   * Create executive summary section
   */
  private createExecutiveSummary(aggregated: AggregatedResult): string {
    const highCount = aggregated.risks.filter(r => r.severity === 'HIGH').length;
    const mediumCount = aggregated.risks.filter(r => r.severity === 'MEDIUM').length;
    const lowCount = aggregated.risks.filter(r => r.severity === 'LOW').length;

    let summary = '### Executive Summary\n\n';
    summary += `${aggregated.summary}\n\n`;

    summary += '**Review Overview:**\n';
    summary += `- Files Analyzed: ${aggregated.metadata.totalFiles}\n`;
    summary += `- Critical Issues: ${highCount}\n`;
    summary += `- Medium Priority: ${mediumCount}\n`;
    summary += `- Low Priority: ${lowCount}\n`;
    summary += `- Suggestions: ${aggregated.suggestions.length}\n`;

    return summary;
  }

  /**
   * Create critical issues section
   */
  private createCriticalIssuesSection(issues: AggregatedIssue[]): string {
    let section = '### 🚨 Critical Issues\n\n';

    for (let i = 0; i < Math.min(issues.length, 10); i++) {
      const issue = issues[i];
      section += `#### ${i + 1}. ${issue.issue}\n\n`;
      section += `**File:** \`${issue.file}\``;

      if (issue.line) {
        section += ` (line ${issue.line})`;
      }

      section += '\n\n';
      section += `**Description:** ${issue.description}\n\n`;

      if (issue.suggestion) {
        section += `**Fix:** ${issue.suggestion}\n\n`;
      }

      if (issue.occurrences > 1) {
        section += `_Found in ${issue.occurrences} locations_\n\n`;
      }
    }

    return section;
  }

  /**
   * Create medium priority section
   */
  private createMediumPrioritySection(issues: AggregatedIssue[]): string {
    let section = '### ⚠️ Medium Priority Items\n\n';

    for (let i = 0; i < Math.min(issues.length, 15); i++) {
      const issue = issues[i];
      section += `**${i + 1}. ${issue.file}`;

      if (issue.line) {
        section += `:${issue.line}`;
      }

      section += `** - ${issue.issue}\n\n`;

      if (issue.description !== issue.issue) {
        section += `${issue.description}\n\n`;
      }
    }

    return section;
  }

  /**
   * Create low priority section
   */
  private createLowPrioritySection(issues: AggregatedIssue[]): string {
    let section = '### 💡 Low Priority Items\n\n';
    section += '<details>\n<summary>Click to expand low priority issues</summary>\n\n';

    for (const issue of issues) {
      section += `- **${issue.file}** - ${issue.issue}\n`;
    }

    section += '\n</details>\n';

    return section;
  }

  /**
   * Create suggestions section
   */
  private createSuggestionsSection(suggestions: AggregatedSuggestion[]): string {
    let section = '### 💡 Suggestions & Improvements\n\n';

    // Group by type
    const grouped = this.groupSuggestionsByType(suggestions);

    for (const [type, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;

      const icon = this.getSuggestionIcon(type);
      section += `#### ${icon} ${this.capitalizeFirst(type)}\n\n`;

      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const suggestion = items[i];
        section += `- **${suggestion.file}**`;

        if (suggestion.line) {
          section += `:${suggestion.line}`;
        }

        section += ` - ${suggestion.suggestion}`;

        if (suggestion.occurrences > 1) {
          section += ` _(${suggestion.occurrences} occurrences)_`;
        }

        section += '\n';
      }

      section += '\n';
    }

    return section;
  }

  /**
   * Create file breakdown section
   */
  private createFileBreakdown(navigation: AggregatedResult['navigation']): string {
    let section = '### 📁 File-by-File Breakdown\n\n';
    section += '<details>\n<summary>Click to expand file details</summary>\n\n';

    const sortedFiles = navigation.files.sort((a, b) => {
      const aScore = a.risks * 10 + a.suggestions;
      const bScore = b.risks * 10 + b.suggestions;
      return bScore - aScore;
    });

    for (const file of sortedFiles) {
      section += `**${file.path}**\n`;
      section += `- Risks: ${file.risks}\n`;
      section += `- Suggestions: ${file.suggestions}\n`;
      section += '\n';
    }

    section += '</details>\n';

    return section;
  }

  /**
   * Create statistics section
   */
  private createStatisticsSection(aggregated: AggregatedResult): string {
    const durationSeconds = (aggregated.metadata.totalDuration / 1000).toFixed(2);

    let section = '### 📊 Review Statistics\n\n';
    section += `- Review Time: ${durationSeconds}s\n`;
    section += `- Chunks Reviewed: ${aggregated.metadata.totalChunks}\n`;
    section += `- Files Analyzed: ${aggregated.metadata.totalFiles}\n`;
    section += `- Tokens Used: ${aggregated.metadata.totalTokens.toLocaleString()}\n`;
    section += `- Providers: ${aggregated.metadata.providers.join(', ')}\n`;

    return section;
  }

  /**
   * Group suggestions by type
   */
  private groupSuggestionsByType(
    suggestions: AggregatedSuggestion[]
  ): Record<string, AggregatedSuggestion[]> {
    const grouped: Record<string, AggregatedSuggestion[]> = {
      security: [],
      performance: [],
      'best-practice': [],
      'code-quality': [],
    };

    for (const suggestion of suggestions) {
      if (grouped[suggestion.type]) {
        grouped[suggestion.type].push(suggestion);
      }
    }

    return grouped;
  }

  /**
   * Get icon for suggestion type
   */
  private getSuggestionIcon(type: string): string {
    const icons: Record<string, string> = {
      security: '🔒',
      performance: '⚡',
      'best-practice': '✨',
      'code-quality': '🎨',
    };

    return icons[type] || '💡';
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).replace(/-/g, ' ');
  }
}
