import { ClaudeProvider } from '../../src/providers/ClaudeProvider';
import { ProviderConfig, ProviderError, RateLimitError, AuthenticationError } from '../../src/providers/types';

// Create mock create function at module level
const mockCreate = jest.fn();

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate
      }
    }))
  };
});

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  const validConfig: ProviderConfig = {
    apiKey: 'test-claude-api-key',
    model: 'claude-3-sonnet-20240229',
    maxRetries: 2,
    timeout: 10000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockClear();
    provider = new ClaudeProvider();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid config', async () => {
      await provider.initialize(validConfig);

      expect(provider.isAvailable()).toBe(true);
      expect(provider.name).toBe('claude');
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
      expect(modelInfo?.name).toBe('Claude 3 Sonnet');
    });

    it('should use default model if not specified', async () => {
      const configWithoutModel = { ...validConfig };
      delete configWithoutModel.model;

      await provider.initialize(configWithoutModel);

      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('generateReview', () => {
    beforeEach(async () => {
      await provider.initialize(validConfig);
    });

    it('should generate review successfully', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-3-sonnet-20240229',
        content: [{
          type: 'text',
          text: '## Summary\nTest review content'
        }],
        usage: {
          input_tokens: 100,
          output_tokens: 50
        },
        stop_reason: 'end_turn'
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await provider.generateReview('test prompt');

      expect(result.content).toBe('## Summary\nTest review content');
      expect(result.provider).toBe('claude');
      expect(result.model).toBe('claude-3-sonnet-20240229');
      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      });
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-3-sonnet-20240229',
        content: [],
        usage: { input_tokens: 100, output_tokens: 0 },
        stop_reason: 'end_turn'
      };

      mockCreate.mockResolvedValue(mockResponse);

      await expect(provider.generateReview('test prompt')).rejects.toThrow(ProviderError);
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = {
        status: 429,
        error: { type: 'rate_limit_error' },
        headers: { 'retry-after': '60' }
      };

      mockCreate.mockRejectedValue(rateLimitError);

      await expect(provider.generateReview('test prompt')).rejects.toThrow(RateLimitError);
    });

    it('should handle authentication errors', async () => {
      const authError = {
        status: 401,
        error: { type: 'authentication_error' }
      };

      mockCreate.mockRejectedValue(authError);

      await expect(provider.generateReview('test prompt')).rejects.toThrow(AuthenticationError);
    });

    it('should use provided options', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-3-opus-20240229',
        content: [{ type: 'text', text: 'Review' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn'
      };

      mockCreate.mockResolvedValue(mockResponse);

      await provider.generateReview('test', {
        model: 'claude-3-opus-20240229',
        maxTokens: 2000,
        temperature: 0.5
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229',
          max_tokens: 2000,
          temperature: 0.5
        })
      );
    });

    it('should throw error when not initialized', async () => {
      const uninitializedProvider = new ClaudeProvider();

      await expect(uninitializedProvider.generateReview('test')).rejects.toThrow(ProviderError);
    });

    it('should format prompt correctly', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-3-sonnet-20240229',
        content: [{ type: 'text', text: 'Review' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn'
      };

      mockCreate.mockResolvedValue(mockResponse);

      const longPrompt = 'test  \n  prompt  \n  with  extra   whitespace';
      await provider.generateReview(longPrompt);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).not.toContain('  ');
    });
  });

  describe('static methods', () => {
    it('should return available models', () => {
      const models = ClaudeProvider.getAvailableModels();

      expect(models).toContain('claude-3-opus-20240229');
      expect(models).toContain('claude-3-sonnet-20240229');
      expect(models).toContain('claude-3-haiku-20240307');
    });

    it('should get model info', () => {
      const modelInfo = ClaudeProvider.getModelInfo('claude-3-sonnet-20240229');

      expect(modelInfo).toBeDefined();
      expect(modelInfo?.name).toBe('Claude 3 Sonnet');
      expect(modelInfo?.maxTokens).toBe(4096);
    });
  });
});