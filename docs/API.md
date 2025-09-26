# API Documentation

## Base URL

```
http://localhost:3000
```

## Endpoints

### POST /review

Analyzes a Git diff and returns an AI-generated code review.

#### Request

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "diff": "string",        // Required: Git diff content
  "author": "string",      // Required: PR author name
  "branch": "string",      // Required: Branch name
  "commitHash": "string",  // Required: Commit SHA
  "commitMessage": "string", // Required: Commit message
  "files": ["string"]      // Optional: List of changed files
}
```

#### Response

**Success (200):**
```json
{
  "author": "John Doe",
  "branch": "feature/new-feature",
  "commitHash": "abc123def456",
  "commitMessage": "Add new feature",
  "review": "### Summary\n\nThe changes implement...\n\n### Risks\n\n**MEDIUM**: Potential null reference...\n\n### Suggestions\n\nConsider adding error handling..."
}
```

**Error (400):**
```json
{
  "error": "Missing diff"
}
```

**Error (500):**
```json
{
  "error": "AI review failed"
}
```

## Review Format

The AI review follows this structure:

### Summary
Brief description of what the changes accomplish.

### Risks
Identified issues with severity levels:
- **HIGH**: Critical issues that must be addressed
- **MEDIUM**: Important issues that should be reviewed
- **LOW**: Minor issues or suggestions

### Suggestions
Code quality and performance improvements.

## Rate Limits

- Maximum diff size: 10,000 characters
- Larger diffs receive a summary instead of line-by-line review
- API calls are rate-limited by OpenAI's tier limits

## Example Usage

### cURL

```bash
curl -X POST http://localhost:3000/review \
  -H "Content-Type: application/json" \
  -d '{
    "diff": "diff --git a/file.js b/file.js\n+console.log(\"hello\");",
    "author": "developer",
    "branch": "feature/logging",
    "commitHash": "abc123",
    "commitMessage": "Add logging"
  }'
```

### JavaScript

```javascript
const response = await fetch('http://localhost:3000/review', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    diff: gitDiff,
    author: 'developer',
    branch: 'feature/branch',
    commitHash: 'abc123',
    commitMessage: 'Update feature',
    files: ['src/file1.js', 'src/file2.js']
  })
});

const review = await response.json();
console.log(review.review);
```

### Python

```python
import requests

response = requests.post('http://localhost:3000/review', json={
    'diff': diff_content,
    'author': 'developer',
    'branch': 'feature/branch',
    'commitHash': 'abc123',
    'commitMessage': 'Update feature',
    'files': ['file1.py', 'file2.py']
})

review = response.json()
print(review['review'])
```