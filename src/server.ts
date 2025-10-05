import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { LLMProvider, LLMProviderFactory, ProviderError, RateLimitError } from './providers';
import { loadAppConfig } from './config/provider-config';

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

// Initialize LLM provider
let llmProvider: LLMProvider | null = null;
let fallbackProviders: LLMProvider[] = [];

async function initializeLLMProviders() {
  try {
    const config = loadAppConfig();

    // Initialize primary provider
    console.log(`Initializing primary provider: ${config.primaryProvider}`);
    llmProvider = await LLMProviderFactory.createFromEnv(config.primaryProvider);

    // Initialize fallback providers
    for (const fallbackName of config.fallbackProviders) {
      try {
        const fallback = await LLMProviderFactory.createFromEnv(fallbackName);
        fallbackProviders.push(fallback);
        console.log(`Initialized fallback provider: ${fallbackName}`);
      } catch (error) {
        console.warn(`Failed to initialize fallback provider ${fallbackName}: ${error}`);
      }
    }

    console.log(`Provider initialization complete. Primary: ${config.primaryProvider}, Fallbacks: ${fallbackProviders.length}`);
  } catch (error) {
    console.error('Failed to initialize LLM provider:', error);
    throw error;
  }
}

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
      review,
      provider: 'none',
      model: 'n/a'
    });
  }

  if (!llmProvider) {
    return res.status(503).json({ error: 'LLM provider not initialized' });
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

  // Try primary provider, then fallbacks
  const providers = [llmProvider, ...fallbackProviders];
  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      console.log(`Attempting review with provider: ${provider.name}`);
      const reviewResponse = await provider.generateReview(prompt, {
        maxTokens: 1500,
        temperature: 0.2
      });

      if (!reviewResponse.content) {
        throw new Error('Empty response from provider');
      }

      return res.json({
        author,
        branch,
        commitHash,
        commitMessage,
        review: reviewResponse.content,
        model: reviewResponse.model,
        provider: reviewResponse.provider,
        timestamp: new Date().toISOString(),
        usage: reviewResponse.usage
      });
    } catch (err) {
      lastError = err as Error;
      console.error(`Provider ${provider.name} failed: ${err instanceof Error ? err.message : 'Unknown error'}`);

      // Handle rate limit errors specially
      if (err instanceof RateLimitError) {
        // Try next provider if available
        if (provider !== providers[providers.length - 1]) {
          console.log('Rate limited, trying fallback provider...');
          continue;
        }
        // No more providers, return rate limit error
        return res.status(429).json({
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: (err as RateLimitError).retryAfter
        });
      }

      // For other errors, try next provider
      if (provider !== providers[providers.length - 1]) {
        console.log('Provider failed, trying fallback...');
        continue;
      }
    }
  }

  // All providers failed
  console.error('All providers failed. Last error:', lastError);
  res.status(500).json({
    error: 'AI review failed with all providers',
    timestamp: new Date().toISOString(),
    details: lastError?.message
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const config = loadAppConfig();

  const providerStatus: Record<string, any> = {};

  // Check primary provider
  if (llmProvider) {
    providerStatus[llmProvider.name] = {
      status: 'active',
      available: llmProvider.isAvailable(),
      model: llmProvider.getModelInfo()?.name || 'unknown',
      role: 'primary'
    };
  }

  // Check fallback providers
  fallbackProviders.forEach((provider, index) => {
    providerStatus[`${provider.name}-${index}`] = {
      status: 'standby',
      available: provider.isAvailable(),
      model: provider.getModelInfo()?.name || 'unknown',
      role: 'fallback'
    };
  });

  const isHealthy = llmProvider?.isAvailable() || fallbackProviders.some(p => p.isAvailable());

  res.json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    providers: providerStatus,
    configuration: {
      primaryProvider: config.primaryProvider,
      fallbackCount: fallbackProviders.length,
      availableProviders: LLMProviderFactory.getAvailableProviders()
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
  // Initialize providers before starting server
  initializeLLMProviders()
    .then(() => {
      app.listen(port, () => {
        console.log(`AI Review server listening at http://localhost:${port}`);
        console.log(`Primary provider: ${llmProvider?.name || 'none'}`);
        console.log(`Fallback providers: ${fallbackProviders.map(p => p.name).join(', ') || 'none'}`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize providers:', err);
      process.exit(1);
    });
}
