# AI Pull Request Review System

An automated code review service that uses OpenAI's GPT models to analyze pull requests and provide intelligent feedback on code changes.

## What It Does

This tool automatically reviews Git diffs when pull requests are created, providing developers with instant feedback about potential issues, risks, and improvements. It integrates seamlessly with CI/CD pipelines and can post reviews directly to Azure DevOps or GitHub.

## Tech Stack

- **Node.js & TypeScript** - Type-safe backend development
- **Express.js** - Lightweight API server
- **OpenAI API** - GPT-3.5/GPT-4 for intelligent code analysis
- **Simple-git** - Git operations and diff extraction
- **Azure DevOps API** - PR comment integration (optional)

## Features

- Automatic diff analysis with configurable size limits
- Risk assessment with severity levels (HIGH, MEDIUM, LOW)
- Code quality suggestions and best practices
- Support for large PRs with summary fallback
- Azure DevOps integration for automated PR comments
- Configurable AI models (GPT-3.5 or GPT-4)

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
# Edit .env with your OpenAI API key and other settings
```

4. Start the server:
```bash
npm run dev  # Development with hot reload
# or
npm start    # Production
```

## Usage

### API Endpoint

Send a POST request to `/review` with the following payload:

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
- OpenAI API key in `.env`
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

### Review Limits

The system automatically handles large diffs:
- Reviews up to 10,000 characters line-by-line
- Larger PRs receive a summary with improvement suggestions
- Configurable via `MAX_DIFF_LENGTH` in server.ts

### AI Model Selection

Choose between GPT models in `.env`:
- `gpt-3.5-turbo` - Faster, cost-effective reviews
- `gpt-4` - More thorough analysis for critical code

## Architecture

```
ai-pr-review/
├── src/
│   └── server.ts        # Express API server
├── send-review.ts       # CLI review script
├── post-to-azure.ts     # Azure DevOps integration
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── .env.example         # Environment template
```

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

- **Token Limits**: Implemented smart diff truncation to stay within API limits while maintaining review quality
- **Large PR Handling**: Graceful degradation for massive changes with helpful summary instead of incomplete reviews
- **Pipeline Integration**: Designed to work seamlessly in CI/CD environments with proper exit codes
- **Rate Limiting**: Built-in retry logic and error handling for API throttling

## Lessons Learned

Working on this project taught me the importance of:
- Setting realistic boundaries for AI analysis (the 10K character limit)
- Providing fallback behaviors for edge cases
- Making tools pipeline-friendly from the start
- Balancing review thoroughness with API costs

## Future Improvements

- Add support for GitHub Actions and GitLab CI
- Implement caching for similar code patterns
- Add configuration for custom review prompts
- Support for multiple programming languages with tailored analysis
- Webhook support for automatic PR triggers
- Review history and analytics dashboard

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT