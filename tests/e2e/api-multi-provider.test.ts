import request from 'supertest';
import express from 'express';

// Mock providers before importing server
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        id: 'msg_claude_123',
        model: 'claude-3-sonnet-20240229',
        content: [{
          type: 'text',
          text: '### Summary\nClaude review content\n### Risks\nNo major risks\n### Suggestions\nLooks good'
        }],
        usage: {
          input_tokens: 100,
          output_tokens: 50
        },
        stop_reason: 'end_turn'
      })
    }
  }))
}));

jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          id: 'chatcmpl_openai_123',
          model: 'gpt-3.5-turbo',
          choices: [{
            message: {
              content: '### Summary\nOpenAI review content\n### Risks\nNo issues found\n### Suggestions\nCode is fine'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150
          }
        })
      }
    }
  }))
}));

describe('API Multi-Provider E2E Tests', () => {
  let app: express.Application;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /review with OpenAI', () => {
    beforeEach(async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.OPENAI_MODEL = 'gpt-3.5-turbo';

      const serverModule = await import('../../src/server');
      app = serverModule.app;
    });

    it('should successfully review with OpenAI provider', async () => {
      const response = await request(app)
        .post('/review')
        .send({
          diff: 'diff --git a/test.js\n+console.log("test");',
          author: 'developer',
          branch: 'feature/test',
          commitHash: 'abc123',
          commitMessage: 'add logging'
        });

      expect(response.status).toBe(200);
      expect(response.body.provider).toBe('openai');
      expect(response.body.model).toBe('gpt-3.5-turbo');
      expect(response.body.review).toContain('OpenAI review');
      expect(response.body.usage).toBeDefined();
    });

    it('should include usage statistics in response', async () => {
      const response = await request(app)
        .post('/review')
        .send({
          diff: 'test diff',
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test'
        });

      expect(response.status).toBe(200);
      expect(response.body.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      });
    });
  });

  describe('POST /review with Claude', () => {
    beforeEach(async () => {
      process.env.AI_PROVIDER = 'claude';
      process.env.CLAUDE_API_KEY = 'test-claude-key';
      process.env.CLAUDE_MODEL = 'claude-3-sonnet-20240229';

      const serverModule = await import('../../src/server');
      app = serverModule.app;
    });

    it('should successfully review with Claude provider', async () => {
      const response = await request(app)
        .post('/review')
        .send({
          diff: 'diff --git a/test.js\n+console.log("test");',
          author: 'developer',
          branch: 'feature/test',
          commitHash: 'abc123',
          commitMessage: 'add logging'
        });

      expect(response.status).toBe(200);
      expect(response.body.provider).toBe('claude');
      expect(response.body.model).toBe('claude-3-sonnet-20240229');
      expect(response.body.review).toContain('Claude review');
      expect(response.body.usage).toBeDefined();
    });

    it('should include Claude usage statistics', async () => {
      const response = await request(app)
        .post('/review')
        .send({
          diff: 'test diff',
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test'
        });

      expect(response.status).toBe(200);
      expect(response.body.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      });
    });
  });

  describe('GET /health with multiple providers', () => {
    beforeEach(async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.FALLBACK_PROVIDERS = 'claude';
      process.env.CLAUDE_API_KEY = 'test-claude-key';

      const serverModule = await import('../../src/server');
      app = serverModule.app;
    });

    it('should show multiple provider status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.providers).toBeDefined();
      expect(response.body.configuration).toBeDefined();
      expect(response.body.configuration.primaryProvider).toBeDefined();
      expect(response.body.configuration.availableProviders).toContain('openai');
      expect(response.body.configuration.availableProviders).toContain('claude');
    });

    it('should include provider availability', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.providers).toHaveProperty('openai');
      expect(response.body.providers.openai).toHaveProperty('available');
      expect(response.body.providers.openai).toHaveProperty('status');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';
    });

    it('should return 400 for missing diff', async () => {
      const serverModule = await import('../../src/server');
      app = serverModule.app;

      const response = await request(app)
        .post('/review')
        .send({
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('diff');
    });

    it('should handle large diffs', async () => {
      const serverModule = await import('../../src/server');
      app = serverModule.app;

      const largeDiff = 'x'.repeat(11000);

      const response = await request(app)
        .post('/review')
        .send({
          diff: largeDiff,
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test'
        });

      expect(response.status).toBe(200);
      expect(response.body.review).toContain('too large');
      expect(response.body.provider).toBe('none');
    });
  });

  describe('Backward Compatibility', () => {
    beforeEach(async () => {
      // Test with old-style env vars
      delete process.env.AI_PROVIDER;
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_MODEL = 'gpt-3.5-turbo';

      const serverModule = await import('../../src/server');
      app = serverModule.app;
    });

    it('should default to OpenAI when AI_PROVIDER not set', async () => {
      const response = await request(app)
        .post('/review')
        .send({
          diff: 'test diff',
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test'
        });

      expect(response.status).toBe(200);
      expect(response.body.provider).toBe('openai');
    });

    it('should maintain existing response format', async () => {
      const response = await request(app)
        .post('/review')
        .send({
          diff: 'test diff',
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('author');
      expect(response.body).toHaveProperty('branch');
      expect(response.body).toHaveProperty('commitHash');
      expect(response.body).toHaveProperty('commitMessage');
      expect(response.body).toHaveProperty('review');
      expect(response.body).toHaveProperty('model');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});