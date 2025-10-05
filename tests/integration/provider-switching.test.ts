import { LLMProviderFactory } from '../../src/providers/LLMProviderFactory';
import { loadProviderConfig } from '../../src/config/provider-config';
import { ProviderConfig } from '../../src/providers/types';

// Mock SDKs
jest.mock('@anthropic-ai/sdk');
jest.mock('openai');

describe('Provider Switching Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    LLMProviderFactory.clearCache();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Runtime Provider Switching', () => {
    it('should switch from OpenAI to Claude via environment', async () => {
      // Start with OpenAI
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'openai-key';

      const openaiProvider = await LLMProviderFactory.createFromEnv();
      expect(openaiProvider.name).toBe('openai');

      // Clear cache and switch to Claude
      LLMProviderFactory.clearCache();
      process.env.AI_PROVIDER = 'claude';
      process.env.CLAUDE_API_KEY = 'claude-key';

      const claudeProvider = await LLMProviderFactory.createFromEnv();
      expect(claudeProvider.name).toBe('claude');
    });

    it('should load different configurations for each provider', async () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.OPENAI_MODEL = 'gpt-4';
      process.env.CLAUDE_API_KEY = 'claude-key';
      process.env.CLAUDE_MODEL = 'claude-3-opus-20240229';

      const openaiConfig = loadProviderConfig('openai');
      const claudeConfig = loadProviderConfig('claude');

      expect(openaiConfig.model).toBe('gpt-4');
      expect(claudeConfig.model).toBe('claude-3-opus-20240229');
    });

    it('should maintain separate instances for different providers', async () => {
      const openaiConfig: ProviderConfig = {
        apiKey: 'openai-key',
        model: 'gpt-3.5-turbo'
      };

      const claudeConfig: ProviderConfig = {
        apiKey: 'claude-key',
        model: 'claude-3-sonnet-20240229'
      };

      const openai1 = await LLMProviderFactory.createProvider('openai', openaiConfig);
      const claude1 = await LLMProviderFactory.createProvider('claude', claudeConfig);
      const openai2 = await LLMProviderFactory.createProvider('openai', openaiConfig);

      // Same provider should be cached
      expect(openai1).toBe(openai2);
      // Different providers should be different instances
      expect(openai1).not.toBe(claude1);
    });
  });

  describe('Fallback Provider Configuration', () => {
    it('should create primary and fallback providers', async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.FALLBACK_PROVIDERS = 'claude';
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.CLAUDE_API_KEY = 'claude-key';

      const primaryConfig: ProviderConfig = {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo'
      };

      const fallbackConfig: ProviderConfig = {
        apiKey: process.env.CLAUDE_API_KEY,
        model: 'claude-3-sonnet-20240229'
      };

      const providers = await LLMProviderFactory.createWithFallback([
        { name: 'openai', config: primaryConfig },
        { name: 'claude', config: fallbackConfig }
      ]);

      expect(providers).toHaveLength(2);
      expect(providers[0].name).toBe('openai');
      expect(providers[1].name).toBe('claude');
    });

    it('should handle missing fallback gracefully', async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.FALLBACK_PROVIDERS = 'claude';
      // No CLAUDE_API_KEY set

      const primaryConfig: ProviderConfig = {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo'
      };

      const fallbackConfig: ProviderConfig = {
        apiKey: '', // Invalid
        model: 'claude-3-sonnet-20240229'
      };

      const providers = await LLMProviderFactory.createWithFallback([
        { name: 'openai', config: primaryConfig },
        { name: 'claude', config: fallbackConfig }
      ]);

      // Should still create primary provider
      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0].name).toBe('openai');
    });
  });

  describe('Configuration Loading', () => {
    it('should load provider-specific settings', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.OPENAI_MAX_RETRIES = '5';
      process.env.OPENAI_TIMEOUT = '60000';
      process.env.OPENAI_MAX_TOKENS = '2000';
      process.env.OPENAI_TEMPERATURE = '0.5';

      const config = loadProviderConfig('openai');

      expect(config.maxRetries).toBe(5);
      expect(config.timeout).toBe(60000);
      expect(config.defaultOptions?.maxTokens).toBe(2000);
      expect(config.defaultOptions?.temperature).toBe(0.5);
    });

    it('should use global defaults when provider-specific not set', () => {
      process.env.CLAUDE_API_KEY = 'claude-key';
      process.env.MAX_RETRIES = '3';
      process.env.TIMEOUT = '30000';
      process.env.MAX_TOKENS = '1500';

      const config = loadProviderConfig('claude');

      expect(config.maxRetries).toBe(3);
      expect(config.timeout).toBe(30000);
      expect(config.defaultOptions?.maxTokens).toBe(1500);
    });

    it('should handle provider priority settings', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.OPENAI_PRIORITY = '1';
      process.env.OPENAI_FALLBACK = 'claude';

      const config = loadProviderConfig('openai');

      expect(config.priority).toBe(1);
      expect(config.fallback).toBe('claude');
    });
  });

  describe('Multi-Provider Scenarios', () => {
    it('should support multiple providers with different models', async () => {
      const openaiConfig: ProviderConfig = {
        apiKey: 'openai-key',
        model: 'gpt-4'
      };

      const claudeConfig: ProviderConfig = {
        apiKey: 'claude-key',
        model: 'claude-3-opus-20240229'
      };

      const openaiProvider = await LLMProviderFactory.createProvider('openai', openaiConfig);
      const claudeProvider = await LLMProviderFactory.createProvider('claude', claudeConfig);

      const openaiInfo = openaiProvider.getModelInfo();
      const claudeInfo = claudeProvider.getModelInfo();

      expect(openaiInfo?.name).toBe('GPT-4');
      expect(claudeInfo?.name).toBe('Claude 3 Opus');
    });

    it('should validate all providers are available', async () => {
      const openaiConfig: ProviderConfig = {
        apiKey: 'openai-key',
        model: 'gpt-3.5-turbo'
      };

      const claudeConfig: ProviderConfig = {
        apiKey: 'claude-key',
        model: 'claude-3-sonnet-20240229'
      };

      const openaiValid = await LLMProviderFactory.validateProvider('openai', openaiConfig);
      const claudeValid = await LLMProviderFactory.validateProvider('claude', claudeConfig);

      expect(openaiValid).toBe(true);
      expect(claudeValid).toBe(true);
    });
  });
});