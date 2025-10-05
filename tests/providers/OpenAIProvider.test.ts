import { OpenAIProvider } from '../../src/providers/OpenAIProvider';
import { ProviderConfig, ProviderError, RateLimitError, AuthenticationError } from '../../src/providers/types';

// Mock OpenAI SDK
jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    }))
  };
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockOpenAIInstance: any;

  const validConfig: ProviderConfig = {
    apiKey: 'test-openai-api-key',
    model: 'gpt-3.5-turbo',
    maxRetries: 2,
    timeout: 10000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new OpenAIProvider();

    // Get the mocked OpenAI instance
    const { OpenAI } = require('openai');
    mockOpenAIInstance = new OpenAI();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid config', async () => {
      await provider.initialize(validConfig);

      expect(provider.isAvailable()).toBe(true);
      expect(provider.name).toBe('openai');
      expect(provider.validateConfig()).toBe(true);
    });

    it('should throw error when API key is missing', async () => {
      const invalidConfig = { ...validConfig, apiKey: '' };

      await expect(provider.initialize(invalidConfig)).rejects.toThrow(ProviderError);
    });

    it('should set model info correctly', async () => {
      await provider.initialize(validConfig);

      const modelInfo = provider.getModelInfo();
      expect(modelInfo).not.toBeNull();
      expect(modelInfo?.name).toBe('GPT-3.5 Turbo');
    });

    it('should use default model if not specified', async () => {
      const configWithoutModel = { ...validConfig };
      delete configWithoutModel.model;

      await provider.initialize(configWithoutModel);

      expect(provider.isAvailable()).toBe(true);
    });

    it('should handle organization parameter', async () => {
      const configWithOrg = { ...validConfig, organization: 'test-org' };

      await provider.initialize(configWithOrg);

      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('generateReview', () => {
    beforeEach(async () => {
      await provider.initialize(validConfig);
    });

    it('should generate review successfully', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'gpt-3.5-turbo',
        choices: [{
          message: {
            content: '## Summary\nTest review content'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await provider.generateReview('test prompt');

      expect(result.content).toBe('## Summary\nTest review content');
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-3.5-turbo');
      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      });
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'gpt-3.5-turbo',
        choices: [{
          message: {
            content: null
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 }
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue(mockResponse);

      await expect(provider.generateReview('test prompt')).rejects.toThrow(ProviderError);
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = {
        status: 429,
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded',
        headers: { 'retry-after': '60' }
      };

      mockOpenAIInstance.chat.completions.create.mockRejectedValue(rateLimitError);

      await expect(provider.generateReview('test prompt')).rejects.toThrow(RateLimitError);
    });

    it('should handle authentication errors', async () => {
      const authError = {
        status: 401,
        code: 'invalid_api_key',
        message: 'Invalid API key'
      };

      mockOpenAIInstance.chat.completions.create.mockRejectedValue(authError);

      await expect(provider.generateReview('test prompt')).rejects.toThrow(AuthenticationError);
    });

    it('should use provided options', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [{ message: { content: 'Review' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue(mockResponse);

      await provider.generateReview('test', {
        model: 'gpt-4',
        maxTokens: 2000,
        temperature: 0.5,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2
      });

      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          max_tokens: 2000,
          temperature: 0.5,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.2
        })
      );
    });

    it('should throw error when not initialized', async () => {
      const uninitializedProvider = new OpenAIProvider();

      await expect(uninitializedProvider.generateReview('test')).rejects.toThrow(ProviderError);
    });

    it('should include system message in request', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'gpt-3.5-turbo',
        choices: [{ message: { content: 'Review' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue(mockResponse);

      await provider.generateReview('test prompt');

      const callArgs = mockOpenAIInstance.chat.completions.create.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[1].role).toBe('user');
    });

    it('should handle response without usage data', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'gpt-3.5-turbo',
        choices: [{ message: { content: 'Review' }, finish_reason: 'stop' }]
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await provider.generateReview('test prompt');

      expect(result.usage).toBeUndefined();
    });
  });

  describe('static methods', () => {
    it('should return available models', () => {
      const models = OpenAIProvider.getAvailableModels();

      expect(models).toContain('gpt-3.5-turbo');
      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4o-mini');
    });

    it('should get model info', () => {
      const modelInfo = OpenAIProvider.getModelInfo('gpt-3.5-turbo');

      expect(modelInfo).toBeDefined();
      expect(modelInfo?.name).toBe('GPT-3.5 Turbo');
      expect(modelInfo?.maxTokens).toBe(4096);
    });
  });
});