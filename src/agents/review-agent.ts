/**
 * Review Agent Module
 * Handles code review for individual chunks using LLM providers
 */

import { ReviewChunk } from '../chunking/chunk-orchestrator';
import { LLMProvider } from '../providers';
import { loadLargeReviewConfig } from '../../config/large-review.config';

export interface Risk {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;
  line?: number;
  issue: string;
  description: string;
  suggestion?: string;
}

export interface Suggestion {
  file: string;
  line?: number;
  type: 'performance' | 'code-quality' | 'best-practice' | 'security';
  suggestion: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentReviewResult {
  chunkId: string;
  files: string[];
  summary: string;
  risks: Risk[];
  suggestions: Suggestion[];
  model: string;
  provider: string;
  usage: TokenUsage;
  duration: number;
}

export class ReviewAgent {
  private provider: LLMProvider;
  private config = loadLargeReviewConfig();

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Review a chunk of code changes
   */
  async reviewChunk(chunk: ReviewChunk): Promise<AgentReviewResult> {
    const startTime = Date.now();

    try {
      const prompt = this.buildChunkPrompt(chunk);

      const response = await this.provider.generateReview(prompt, {
        maxTokens: this.config.models.maxTokensPerChunk,
        temperature: 0.2,
      });

      const parsed = this.parseReviewResponse(response.content);

      return {
        chunkId: chunk.id,
        files: chunk.files.map(f => f.path),
        summary: parsed.summary,
        risks: parsed.risks,
        suggestions: parsed.suggestions,
        model: response.model,
        provider: response.provider,
        usage: response.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`Review agent failed for chunk ${chunk.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build a focused review prompt for a chunk
   */
  private buildChunkPrompt(chunk: ReviewChunk): string {
    const fileList = chunk.files.map(f => `- ${f.path} (${f.additions}+ / ${f.deletions}- lines, risk: ${f.category})`).join('\n');

    const diffContent = chunk.files.map(f => `
### File: ${f.path}
Risk: ${f.category.toUpperCase()}
Complexity: ${f.complexity}

\`\`\`diff
${f.diff}
\`\`\`
`).join('\n');

    return `You are an expert code reviewer analyzing a subset of files from a large pull request.

**Your Task:**
Analyze the following code changes and provide:
1. A brief summary of what these changes accomplish
2. Any risks, bugs, or security issues (tagged with severity: HIGH, MEDIUM, or LOW)
3. Suggestions for code quality improvements

**Files in this chunk (${chunk.files.length}):**
${fileList}

**Important:**
- Focus on critical issues (security vulnerabilities, bugs, breaking changes)
- Be concise and specific
- Include file path and approximate line numbers for each issue
- Prioritize actionable feedback

**Diff Content:**
${diffContent}

**Response Format (use valid JSON):**
{
  "summary": "Brief summary of changes in this chunk",
  "risks": [
    {
      "severity": "HIGH|MEDIUM|LOW",
      "file": "path/to/file",
      "line": 123,
      "issue": "Brief issue title",
      "description": "Detailed description",
      "suggestion": "How to fix it"
    }
  ],
  "suggestions": [
    {
      "file": "path/to/file",
      "line": 45,
      "type": "performance|code-quality|best-practice|security",
      "suggestion": "Improvement suggestion"
    }
  ]
}`;
  }

  /**
   * Parse the LLM response into structured data
   */
  private parseReviewResponse(content: string): {
    summary: string;
    risks: Risk[];
    suggestions: Suggestion[];
  } {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        // Fallback: parse markdown format
        return this.parseMarkdownResponse(content);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        summary: parsed.summary || 'No summary provided',
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch (error) {
      // Fallback to markdown parsing
      return this.parseMarkdownResponse(content);
    }
  }

  /**
   * Fallback parser for markdown-formatted responses
   */
  private parseMarkdownResponse(content: string): {
    summary: string;
    risks: Risk[];
    suggestions: Suggestion[];
  } {
    const risks: Risk[] = [];
    const suggestions: Suggestion[] = [];
    let summary = '';

    // Extract summary
    const summaryMatch = content.match(/summary[:\s]+([^\n]+)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    // Extract risks
    const riskPattern = /(\*\*?(HIGH|MEDIUM|LOW)\*\*?)[:\s]+([^\n]+)/gi;
    let riskMatch;

    while ((riskMatch = riskPattern.exec(content)) !== null) {
      risks.push({
        severity: riskMatch[2] as 'HIGH' | 'MEDIUM' | 'LOW',
        file: 'unknown',
        issue: riskMatch[3].trim(),
        description: riskMatch[3].trim(),
      });
    }

    // Extract suggestions
    const suggestionPattern = /💡\s*([^\n]+)/g;
    let suggestionMatch;

    while ((suggestionMatch = suggestionPattern.exec(content)) !== null) {
      suggestions.push({
        file: 'unknown',
        type: 'code-quality',
        suggestion: suggestionMatch[1].trim(),
      });
    }

    return {
      summary: summary || content.substring(0, 200),
      risks,
      suggestions,
    };
  }

  /**
   * Check if provider is available
   */
  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  /**
   * Get the current provider name
   */
  getProviderName(): string {
    return this.provider.name;
  }
}
