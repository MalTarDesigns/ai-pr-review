import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Security and middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Input validation middleware
const validateReviewRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { diff, author, branch, commitHash, commitMessage } = req.body;

  if (!diff || typeof diff !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid diff' });
  }

  if (diff.length > 1000000) { // 1MB limit
    return res.status(413).json({ error: 'Diff too large (max 1MB)' });
  }

  next();
};

app.post('/review', validateReviewRequest, async (req, res) => {
  const { diff, author, branch, commitHash, commitMessage, files } = req.body;

  const MAX_DIFF_LENGTH = 10000;
  if (diff.length > MAX_DIFF_LENGTH) {
    const review = `## 🤖 AI Code Review Summary\n\n⚠️ This PR is too large (${
      diff.length
    } characters) to review line-by-line.\n\n📄 **Files changed (${files?.length || 'unknown'}):**\n${
      files?.map((f: any) => `- \`${f}\``).join('\n') || 'Not provided'
    }\n\n🧠 **Suggestions:**\n- Consider breaking this PR into smaller, focused parts for easier review.\n- Highlight complex or risky files in manual reviews.\n\n✅ AI review skipped to avoid incomplete or misleading feedback.`;

    return res.json({
      author,
      branch,
      commitHash,
      commitMessage,
      review
    });
  }
  const prompt = `
    You are an expert code reviewer. Analyze this Git diff and respond with:

    ### ✍️ Summary
    Summarize the purpose of the changes.

    ### ⚠️ Risks
    Identify any bugs, edge cases, or potential problems. Tag each with severity: **HIGH**, **MEDIUM**, or **LOW**.

    ### 💡 Suggestions
    List code quality or performance improvements. Tag with severity if applicable.

    Format the output in **Markdown** with clear section titles, relevant emoji flags, and severity tags in bold.

    Metadata:
    - Author: ${author}
    - Branch: ${branch}
    - Commit: ${commitHash}
    - Message: ${commitMessage}

    Diff:
    ${diff}
  `;

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1500
    });

    const reviewContent = response.choices[0].message?.content?.trim();
    if (!reviewContent) {
      throw new Error('Empty response from OpenAI');
    }

    res.json({
      author,
      branch,
      commitHash,
      commitMessage,
      review: reviewContent,
      model: model,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`AI review failed: ${err instanceof Error ? err.message : 'Unknown error'}`);

    if (err instanceof Error && err.message.includes('rate_limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    res.status(500).json({
      error: 'AI review failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    openai: {
      configured: hasApiKey,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
    },
    uptime: process.uptime()
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'AI Pull Request Review API',
    version: '1.0.0',
    endpoints: {
      'POST /review': 'Submit code diff for AI review',
      'GET /health': 'Health check and system status',
      'GET /api': 'API information'
    },
    documentation: 'https://github.com/MalTarDesigns/ai-pr-review'
  });
});

export { app };

if (require.main === module) {
  app.listen(port, () => {
    console.log(`AI Review server listening at http://localhost:${port}`);
  });
}
