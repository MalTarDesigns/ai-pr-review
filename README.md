# AI Pull Request Review System

An automated code review service that uses OpenAI's GPT models to analyze pull requests and provide intelligent feedback on code changes.

## What It Does

This tool automatically reviews Git diffs when pull requests are created, providing developers with instant feedback about potential issues, risks, and improvements. It integrates seamlessly with CI/CD pipelines and can post reviews directly to Azure DevOps or GitHub.

## Tech Stack

- **Node.js & TypeScript** - Type-safe backend development
- **Express.js** - Lightweight API server
- **Multi-LLM Support** - OpenAI (GPT-3.5/GPT-4) and Anthropic Claude (Claude 3 family)
- **Simple-git** - Git operations and diff extraction
- **Azure DevOps API** - PR comment integration (optional)

## Features

- **Multi-Provider Support** - Choose between OpenAI GPT or Anthropic Claude
- **Automatic Fallback** - Seamless failover between providers for high availability
- **Agent-Based Large PR Review** - Handles PRs up to 5MB with intelligent chunking and parallel processing
- **Smart Routing** - Automatically selects optimal strategy based on diff size (standard/chunked/hierarchical)
- **Risk Assessment** - Severity levels (HIGH, MEDIUM, LOW) for identified issues with file categorization
- **Best Practices** - Code quality suggestions and improvements
- **Azure DevOps Integration** - Automated PR comment posting
- **Flexible Configuration** - Provider-specific settings via environment variables

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ai-pr-review.git
cd ai-pr-review
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your provider choice and API keys
# Supports OpenAI, Claude, or both with automatic fallback
```

4. Start the server:
```bash
npm run dev  # Development with hot reload
# or
npm start    # Production
```

## Usage

### API Endpoints

#### POST /review (Smart Routing)

Automatically selects the optimal review strategy based on diff size:

```json
{
  "diff": "git diff content",
  "author": "developer name",
  "branch": "feature/branch-name",
  "commitHash": "abc123",
  "commitMessage": "Add new feature",
  "files": ["src/file1.ts", "src/file2.ts"]
}
```

#### POST /review/large (Explicit Large PR Review)

Force chunked/hierarchical review for large PRs (bypasses automatic routing):

```json
{
  "diff": "large git diff content (up to 5MB)",
  "author": "developer name",
  "branch": "feature/major-refactor",
  "commitHash": "abc123",
  "commitMessage": "Large feature implementation",
  "files": ["src/file1.ts", "src/file2.ts", ...]
}
```

**Response includes:**
- Detailed review with risk categorization
- Statistics (chunks processed, files analyzed, tokens used)
- Execution metadata (duration, providers used, success rate)

### Two Ways to Test

#### Method 1: Terminal Review (Recommended for Testing)

Test the AI review directly in your terminal:

1. Start the server:
```bash
npm start
```

2. Create a test branch and make changes:
```bash
git checkout -b feature/demo-review
echo "// Demo comment for testing" >> src/server.ts
git add .
git commit -m "Add demo comment for AI review testing"
```

3. Run the AI review command:
```bash
npm run ai-review
```

**Output Example:**
```
--- AI Code Review ---

Author: Your Name
Branch: feature/demo-review
Commit: abc123def456
Message: Add demo comment for AI review testing

Review:
## Summary
Added a demo comment to the server file for testing purposes.

## Risks
**LOW**: No functional risks identified with this documentation change.

## Suggestions
Consider adding more descriptive comments that explain functionality.
```

#### Method 2: API Testing

Test the review API directly with curl:

```bash
# Start server
npm start

# Test with sample diff
curl -X POST http://localhost:3000/review \
  -H "Content-Type: application/json" \
  -d '{
    "diff": "diff --git a/src/api.js b/src/api.js\n+  console.log(\"New feature added\");",
    "author": "Developer",
    "branch": "feature/new-feature",
    "commitHash": "abc123",
    "commitMessage": "Add logging for new feature",
    "files": ["src/api.js"]
  }'
```

**Both methods require:**
- Server running (`npm start`)
- At least one LLM provider configured (OpenAI or Claude API key in `.env`)
- For terminal method: git repository with commits to review

### CI/CD Integration

Add to your pipeline:

```yaml
# Azure DevOps Pipeline
- script: |
    npm install
    npm run build
    npm run ai-review
  displayName: 'AI Code Review'
  env:
    OPENAI_API_KEY: $(OpenAIKey)
    AZURE_PAT: $(System.AccessToken)
```

## Configuration

### Multi-Provider Setup

Configure primary and fallback providers in `.env`:

```bash
# Choose your primary provider
AI_PROVIDER=openai          # or 'claude'

# Optional: Configure fallback providers for high availability
FALLBACK_PROVIDERS=claude   # comma-separated list

# OpenAI Configuration
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-3.5-turbo # or gpt-4, gpt-4-turbo, gpt-4o

# Claude Configuration (optional)
CLAUDE_API_KEY=your_key
CLAUDE_MODEL=claude-3-sonnet-20240229 # or haiku, opus, 3.5-sonnet
```

**Provider Options:**
- **OpenAI**: `gpt-3.5-turbo` (fast/economical), `gpt-4` (thorough), `gpt-4-turbo`, `gpt-4o`
- **Claude**: `claude-3-haiku` (fast), `claude-3-sonnet` (balanced), `claude-3-opus` (powerful), `claude-3-5-sonnet` (latest)

### Review Strategies

The system automatically selects the optimal review strategy based on diff size:

**Standard Review (≤ 10KB)**
- Single-shot comprehensive analysis
- Fast response (~2-5 seconds)
- Best for focused PRs and small changes

**Chunked Review (10KB - 100KB)**
- Intelligent file grouping by risk level (HIGH/MEDIUM/LOW)
- Parallel agent execution (up to 3 concurrent)
- Detailed file-level feedback with cross-file awareness
- Response time: ~30-60 seconds

**Hierarchical Review (> 100KB up to 5MB)**
- Advanced chunking with priority-based processing
- Risk categorization and complexity scoring
- Deduplication and aggregation of findings
- Response time: 1-5 minutes

All strategies support automatic provider fallback and retry logic.

### Advanced Configuration

Provider-specific settings (optional):
```bash
# Override defaults per provider
OPENAI_MAX_TOKENS=1500
OPENAI_TEMPERATURE=0.2
CLAUDE_MAX_TOKENS=4096
CLAUDE_TEMPERATURE=0.2

# Global defaults (applied unless overridden)
MAX_RETRIES=3
TIMEOUT=30000
```

### Large PR Review Configuration

Control chunking and agent behavior in `config/large-review.config.ts`:

```typescript
export const LargeReviewConfig = {
  chunking: {
    maxChunkSize: 8000,              // Characters per chunk
    maxFilesPerChunk: 10,            // Files per chunk
    prioritizeHighRisk: true,        // Review high-risk files first
  },
  execution: {
    maxConcurrentAgents: 3,          // Parallel agent limit
    agentTimeout: 30000,             // 30s per agent
    retryAttempts: 2,                // Retry failed chunks
    fallbackToSummary: true,         // Fallback on agent failure
  },
  models: {
    maxTokensPerChunk: 1500,         // Token limit per chunk
  }
};
```

**Environment Variables:**
- All config values can be overridden via environment variables
- Automatic loading from `.env` file
- See `config/large-review.config.ts` for full options

## Architecture

```
ai-pr-review/
├── config/
│   └── large-review.config.ts      # Large PR configuration
├── src/
│   ├── server.ts                    # Express API server
│   ├── config/
│   │   └── provider-config.ts      # Provider configuration
│   ├── providers/                   # Multi-LLM architecture
│   │   ├── BaseLLMProvider.ts      # Abstract base class
│   │   ├── LLMProviderFactory.ts   # Factory pattern
│   │   ├── ClaudeProvider.ts       # Anthropic Claude
│   │   ├── OpenAIProvider.ts       # OpenAI GPT
│   │   └── types.ts                # Interfaces
│   ├── chunking/                    # Large PR chunking system
│   │   ├── diff-parser.ts          # Parse diffs to files
│   │   └── chunk-orchestrator.ts   # Intelligent chunking
│   ├── agents/                      # Agent-based review
│   │   ├── review-agent.ts         # LLM review agent
│   │   └── parallel-executor.ts    # Parallel execution
│   ├── aggregation/                 # Result synthesis
│   │   ├── result-aggregator.ts    # Merge & deduplicate
│   │   └── review-synthesizer.ts   # Final output formatting
│   ├── middleware/
│   │   └── smart-router.ts         # Auto strategy selection
│   └── routes/
│       └── large-review.ts         # Large PR endpoint
├── tests/                          # Comprehensive test suite
│   ├── e2e/                       # End-to-end tests
│   ├── integration/               # Integration tests
│   └── providers/                 # Unit tests
├── send-review.ts                 # CLI review script
├── post-to-azure.ts              # Azure DevOps integration
└── docs/                         # API documentation
```

### Provider Architecture

The system uses a **Factory Pattern** for LLM provider management:

- **BaseLLMProvider** - Abstract base class with common functionality
- **LLMProviderFactory** - Creates and manages provider instances with caching
- **Provider Implementations** - OpenAI and Claude with standardized interfaces
- **Automatic Fallback** - Seamless switching when primary provider fails or hits rate limits

## API Response Format

```json
{
  "author": "John Doe",
  "branch": "feature/new-api",
  "commitHash": "abc123def",
  "commitMessage": "Add user authentication",
  "review": "## Summary\n\n... AI-generated review ..."
}
```

## Development Challenges Solved

- **Multi-Provider Support**: Factory pattern enables switching between OpenAI and Claude without code changes
- **High Availability**: Automatic fallback ensures reviews continue even if primary provider fails or hits rate limits
- **Agent-Based Chunking**: Parallel processing with intelligent file grouping handles PRs up to 5MB while maintaining detailed feedback
- **Smart Routing**: Automatic strategy selection based on diff size optimizes cost and quality
- **Token Optimization**: Intelligent chunking and deduplication minimize token usage while preserving review quality
- **Cross-File Awareness**: Aggregation layer identifies dependencies and patterns across file boundaries
- **Pipeline Integration**: CI/CD ready with proper exit codes, timeouts, and error handling
- **Provider-Specific Config**: Flexible environment-based configuration for each LLM provider

## Lessons Learned

Working on this project taught me the importance of:
- **Abstraction**: Factory pattern makes adding new LLM providers straightforward
- **Resilience**: Fallback mechanisms ensure service continuity during provider outages
- **Boundaries**: Setting realistic limits (10K character) prevents incomplete reviews
- **Flexibility**: Provider-specific configuration allows optimization per use case
- **Pipeline Integration**: Making tools CI/CD-friendly from the start saves headaches later

## Future Improvements

- **Additional Providers**: Google Gemini, Azure OpenAI, local models (Ollama)
- **CI/CD Expansion**: GitHub Actions, GitLab CI native integration
- **Smart Caching**: Review caching for similar code patterns
- **Custom Prompts**: Configurable review templates per project
- **Language Support**: Tailored analysis for different programming languages
- **Webhooks**: Automatic PR triggers without pipeline configuration
- **Analytics**: Review history dashboard and insights
- **Cost Optimization**: Smart provider selection based on diff complexity and cost

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT