import { LLMProviderFactory } from '../../src/providers/LLMProviderFactory';
import { ProviderConfig, ProviderError } from '../../src/providers/types';

// Mock the provider modules
jest.mock('../../src/providers/ClaudeProvider');
jest.mock('../../src/providers/OpenAIProvider');
jest.mock('@anthropic-ai/sdk');
jest.mock('openai');

describe('LLMProviderFactory', () => {
  const validOpenAIConfig: ProviderConfig = {
    apiKey: 'test-openai-key',
    model: 'gpt-3.5-turbo'
  };

  const validClaudeConfig: ProviderConfig = {
    apiKey: 'test-claude-key',
    model: 'claude-3-sonnet-20240229'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    LLMProviderFactory.clearCache();
  });

  describe('createProvider', () => {
    it('should create OpenAI provider', async () => {
      const provider = await LLMProviderFactory.createProvider('openai', validOpenAIConfig);

      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
    });

    it('should create Claude provider', async () => {
      const provider = await LLMProviderFactory.createProvider('claude', validClaudeConfig);

      expect(provider).toBeDefined();
      expect(provider.name).toBe('claude');
    });

    it('should handle provider name aliases', async () => {
      const providerGPT = await LLMProviderFactory.createProvider('gpt', validOpenAIConfig);
      expect(providerGPT.name).toBe('openai');

      const providerAnthropic = await LLMProviderFactory.createProvider('anthropic', validClaudeConfig);
      expect(providerAnthropic.name).toBe('claude');
    });

    it('should throw error for unknown provider', async () => {
      await expect(
        LLMProviderFactory.createProvider('unknown', validOpenAIConfig)
      ).rejects.toThrow(ProviderError);
    });

    it('should cache providers by default', async () => {
      const provider1 = await LLMProviderFactory.createProvider('openai', validOpenAIConfig);
      const provider2 = await LLMProviderFactory.createProvider('openai', validOpenAIConfig);

      expect(provider1).toBe(provider2);
    });

    it('should not cache when cache is disabled', async () => {
      const provider1 = await LLMProviderFactory.createProvider('openai', validOpenAIConfig, false);
      const provider2 = await LLMProviderFactory.createProvider('openai', validOpenAIConfig, false);

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('createFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create provider from environment variables', async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_MODEL = 'gpt-3.5-turbo';

      const provider = await LLMProviderFactory.createFromEnv();

      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
    });

    it('should use default provider when AI_PROVIDER is not set', async () => {
      delete process.env.AI_PROVIDER;
      process.env.OPENAI_API_KEY = 'test-key';

      const provider = await LLMProviderFactory.createFromEnv();

      expect(provider.name).toBe('openai');
    });

    it('should throw error when API key is missing', async () => {
      process.env.AI_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;

      await expect(LLMProviderFactory.createFromEnv()).rejects.toThrow(ProviderError);
    });

    it('should use provider-specific env vars', async () => {
      process.env.AI_PROVIDER = 'claude';
      process.env.CLAUDE_API_KEY = 'claude-key';
      process.env.CLAUDE_MODEL = 'claude-3-opus-20240229';

      const provider = await LLMProviderFactory.createFromEnv();

      expect(provider.name).toBe('claude');
    });

    it('should fall back to OPENAI_API_KEY if provider key is missing', async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'fallback-key';

      const provider = await LLMProviderFactory.createFromEnv();

      expect(provider).toBeDefined();
    });
  });

  describe('createWithFallback', () => {
    it('should create multiple providers', async () => {
      const providers = await LLMProviderFactory.createWithFallback([
        { name: 'openai', config: validOpenAIConfig },
        { name: 'claude', config: validClaudeConfig }
      ]);

      expect(providers).toHaveLength(2);
      expect(providers[0].name).toBe('openai');
      expect(providers[1].name).toBe('claude');
    });

    it('should skip failed providers', async () => {
      const invalidConfig = { apiKey: '' };

      const providers = await LLMProviderFactory.createWithFallback([
        { name: 'openai', config: invalidConfig },
        { name: 'claude', config: validClaudeConfig }
      ]);

      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0].name).toBe('claude');
    });

    it('should throw error when all providers fail', async () => {
      const invalidConfig = { apiKey: '' };

      await expect(
        LLMProviderFactory.createWithFallback([
          { name: 'openai', config: invalidConfig },
          { name: 'claude', config: invalidConfig }
        ])
      ).rejects.toThrow(ProviderError);
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      const provider1 = await LLMProviderFactory.createProvider('openai', validOpenAIConfig);

      LLMProviderFactory.clearCache();

      const provider2 = await LLMProviderFactory.createProvider('openai', validOpenAIConfig);

      expect(provider1).not.toBe(provider2);
    });

    it('should get cached provider', async () => {
      await LLMProviderFactory.createProvider('openai', validOpenAIConfig);

      const cached = LLMProviderFactory.getCachedProvider('openai', 'gpt-3.5-turbo');

      expect(cached).toBeDefined();
      expect(cached?.name).toBe('openai');
    });

    it('should return undefined for non-cached provider', () => {
      const cached = LLMProviderFactory.getCachedProvider('nonexistent');

      expect(cached).toBeUndefined();
    });
  });

  describe('utility methods', () => {
    it('should get available providers', () => {
      const providers = LLMProviderFactory.getAvailableProviders();

      expect(providers).toContain('openai');
      expect(providers).toContain('claude');
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should not include aliases in available providers', () => {
      const providers = LLMProviderFactory.getAvailableProviders();

      expect(providers).not.toContain('gpt');
      expect(providers).not.toContain('anthropic');
    });

    it('should validate provider configuration', async () => {
      const isValid = await LLMProviderFactory.validateProvider('openai', validOpenAIConfig);

      expect(isValid).toBe(true);
    });

    it('should return false for invalid configuration', async () => {
      const invalidConfig = { apiKey: '' };
      const isValid = await LLMProviderFactory.validateProvider('openai', invalidConfig);

      expect(isValid).toBe(false);
    });
  });
});