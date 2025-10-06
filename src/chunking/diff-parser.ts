/**
 * Diff Parser Module
 * Parses Git diffs into individual file changes with complexity scoring and risk categorization
 */

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  diff: string;
  complexity: number;
  category: 'high-risk' | 'medium-risk' | 'low-risk';
  fileType: string;
  isBinary: boolean;
}

export interface DiffParseResult {
  files: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
  totalComplexity: number;
}

/**
 * Risk patterns for identifying high-risk code changes
 */
const HIGH_RISK_PATTERNS = {
  security: [
    /eval\(/i,
    /exec\(/i,
    /dangerouslySetInnerHTML/i,
    /WHERE.*\$\{/i,
    /SELECT.*FROM.*WHERE/i,
    /password|secret|api[_-]?key/i,
    /\.raw\(/i,
    /innerHTML/i,
    /authentication|authorization/i,
    /jwt|token/i,
  ],
  database: [
    /CREATE TABLE/i,
    /ALTER TABLE/i,
    /DROP TABLE/i,
    /migration/i,
    /schema/i,
  ],
  businessLogic: [
    /payment|billing|invoice/i,
    /transaction|order/i,
    /user.*create|user.*delete/i,
    /permission|role|access/i,
  ],
};

/**
 * File type categories for complexity scoring
 */
const FILE_TYPE_WEIGHTS = {
  '.ts': 1.2,
  '.tsx': 1.3,
  '.js': 1.1,
  '.jsx': 1.2,
  '.py': 1.2,
  '.java': 1.3,
  '.cpp': 1.4,
  '.c': 1.3,
  '.go': 1.2,
  '.rs': 1.4,
  '.sql': 1.5,
  '.yml': 1.0,
  '.yaml': 1.0,
  '.json': 0.8,
  '.md': 0.6,
  '.txt': 0.5,
};

export class DiffParser {
  /**
   * Parse a complete Git diff into individual file changes
   */
  parseToFiles(diff: string): DiffParseResult {
    const files: FileChange[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalComplexity = 0;

    // Split diff into file sections
    const fileSections = this.splitDiffIntoFiles(diff);

    for (const section of fileSections) {
      const fileChange = this.parseFileSection(section);
      if (fileChange) {
        files.push(fileChange);
        totalAdditions += fileChange.additions;
        totalDeletions += fileChange.deletions;
        totalComplexity += fileChange.complexity;
      }
    }

    return {
      files,
      totalAdditions,
      totalDeletions,
      totalComplexity,
    };
  }

  /**
   * Split a diff into individual file sections
   */
  private splitDiffIntoFiles(diff: string): string[] {
    // Match diff headers: "diff --git a/... b/..."
    const sections: string[] = [];
    const lines = diff.split('\n');
    let currentSection: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Start of a new file diff (only on "diff --git")
      if (line.startsWith('diff --git')) {
        if (currentSection.length > 0) {
          sections.push(currentSection.join('\n'));
          currentSection = [];
        }
      }

      currentSection.push(line);
    }

    // Add the last section
    if (currentSection.length > 0) {
      sections.push(currentSection.join('\n'));
    }

    return sections.filter(section => section.trim().length > 0);
  }

  /**
   * Parse a single file section into a FileChange object
   */
  private parseFileSection(section: string): FileChange | null {
    const lines = section.split('\n');

    // Extract file path
    const path = this.extractFilePath(section);
    if (!path) {
      return null;
    }

    // Check if binary file
    const isBinary = section.includes('Binary files') || section.includes('GIT binary patch');

    // Count additions and deletions
    let additions = 0;
    let deletions = 0;

    if (!isBinary) {
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
        }
      }
    }

    // Get file type
    const fileType = this.extractFileType(path);

    // Calculate complexity
    const complexity = this.calculateComplexity({
      path,
      additions,
      deletions,
      diff: section,
      fileType,
      isBinary,
      complexity: 0, // Will be calculated
      category: 'low-risk', // Will be categorized
    });

    // Categorize by risk
    const category = this.categorizeByRisk({
      path,
      additions,
      deletions,
      diff: section,
      fileType,
      isBinary,
      complexity,
      category: 'low-risk',
    });

    return {
      path,
      additions,
      deletions,
      diff: section,
      complexity,
      category,
      fileType,
      isBinary,
    };
  }

  /**
   * Extract file path from diff section
   */
  private extractFilePath(section: string): string | null {
    // Try "diff --git a/path b/path"
    const gitDiffMatch = section.match(/diff --git a\/(.+?) b\/(.+)/);
    if (gitDiffMatch) {
      return gitDiffMatch[2]; // Use the "b/" path (new file path)
    }

    // Try "+++ b/path"
    const newFileMatch = section.match(/\+\+\+ b\/(.+)/);
    if (newFileMatch) {
      return newFileMatch[1];
    }

    // Try "--- a/path"
    const oldFileMatch = section.match(/--- a\/(.+)/);
    if (oldFileMatch) {
      return oldFileMatch[1];
    }

    return null;
  }

  /**
   * Extract file type from path
   */
  private extractFileType(path: string): string {
    const match = path.match(/\.([^.]+)$/);
    return match ? `.${match[1]}` : '';
  }

  /**
   * Calculate complexity score for a file change
   * Factors: lines changed, file type weight, import count, nesting depth
   */
  calculateComplexity(fileChange: FileChange): number {
    if (fileChange.isBinary) {
      return 5; // Binary files have moderate complexity
    }

    // Base complexity from lines changed
    const linesChanged = fileChange.additions + fileChange.deletions;
    let complexity = Math.log10(linesChanged + 1) * 10; // Logarithmic scale

    // Apply file type weight
    const typeWeight = FILE_TYPE_WEIGHTS[fileChange.fileType as keyof typeof FILE_TYPE_WEIGHTS] || 1.0;
    complexity *= typeWeight;

    // Add complexity for imports (indicates integration points)
    const importCount = (fileChange.diff.match(/^[+].*import /gm) || []).length;
    complexity += importCount * 2;

    // Add complexity for function/class definitions
    const functionCount = (fileChange.diff.match(/^[+].*(function |const .* = |class |def |func )/gm) || []).length;
    complexity += functionCount * 3;

    // Add complexity for control structures
    const controlStructures = (fileChange.diff.match(/^[+].*(if |for |while |switch |try |catch )/gm) || []).length;
    complexity += controlStructures * 1.5;

    return Math.round(complexity * 10) / 10;
  }

  /**
   * Categorize file change by risk level
   * Checks for security patterns, database changes, and business logic
   */
  categorizeByRisk(fileChange: FileChange): 'high-risk' | 'medium-risk' | 'low-risk' {
    const diff = fileChange.diff;
    const path = fileChange.path.toLowerCase();

    // Check for high-risk patterns in diff content
    for (const category in HIGH_RISK_PATTERNS) {
      const patterns = HIGH_RISK_PATTERNS[category as keyof typeof HIGH_RISK_PATTERNS];
      for (const pattern of patterns) {
        if (pattern.test(diff)) {
          return 'high-risk';
        }
      }
    }

    // Check for high-risk file paths
    if (
      path.includes('auth') ||
      path.includes('security') ||
      path.includes('payment') ||
      path.includes('migration') ||
      path.includes('database') ||
      path.includes('admin')
    ) {
      return 'high-risk';
    }

    // Medium risk: significant changes or core business logic
    if (
      fileChange.complexity > 30 ||
      fileChange.additions + fileChange.deletions > 100 ||
      path.includes('service') ||
      path.includes('controller') ||
      path.includes('api') ||
      path.includes('model')
    ) {
      return 'medium-risk';
    }

    // Default to low risk
    return 'low-risk';
  }

  /**
   * Get statistics about a diff parse result
   */
  getStatistics(result: DiffParseResult): {
    totalFiles: number;
    highRiskFiles: number;
    mediumRiskFiles: number;
    lowRiskFiles: number;
    averageComplexity: number;
    totalChanges: number;
  } {
    return {
      totalFiles: result.files.length,
      highRiskFiles: result.files.filter(f => f.category === 'high-risk').length,
      mediumRiskFiles: result.files.filter(f => f.category === 'medium-risk').length,
      lowRiskFiles: result.files.filter(f => f.category === 'low-risk').length,
      averageComplexity: result.files.length > 0
        ? Math.round((result.totalComplexity / result.files.length) * 10) / 10
        : 0,
      totalChanges: result.totalAdditions + result.totalDeletions,
    };
  }
}
