import request from 'supertest';
import express from 'express';

// Mock OpenAI before importing server
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: '### Summary\nTest review content\n### Risks\nNo risks found\n### Suggestions\nCode looks good'
            }
          }]
        })
      }
    }
  }))
}));

describe('AI Review API', () => {
  let app: express.Application;

  beforeEach(() => {
    // Reset modules to ensure clean state
    jest.resetModules();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  describe('POST /review', () => {
    it('should return 400 when diff is missing', async () => {
      const { app } = await import('../src/server');

      const response = await request(app)
        .post('/review')
        .send({
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test commit'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing diff');
    });

    it('should handle large diffs gracefully', async () => {
      const { app } = await import('../src/server');
      const largeDiff = 'x'.repeat(11000);

      const response = await request(app)
        .post('/review')
        .send({
          diff: largeDiff,
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test commit',
          files: ['file1.ts', 'file2.ts']
        });

      expect(response.status).toBe(200);
      expect(response.body.review).toContain('too large');
      expect(response.body.review).toContain('11000 characters');
    });

    it('should successfully review normal diff', async () => {
      const { app } = await import('../src/server');

      const response = await request(app)
        .post('/review')
        .send({
          diff: 'diff --git a/test.js\n+console.log("test");',
          author: 'developer',
          branch: 'feature/test',
          commitHash: 'abc123',
          commitMessage: 'add logging',
          files: ['test.js']
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        author: 'developer',
        branch: 'feature/test',
        commitHash: 'abc123',
        commitMessage: 'add logging'
      });
      expect(response.body.review).toContain('Summary');
    });

    it('should handle OpenAI API errors', async () => {
      jest.resetModules();
      jest.doMock('openai', () => ({
        OpenAI: jest.fn().mockImplementation(() => ({
          chat: {
            completions: {
              create: jest.fn().mockRejectedValue(new Error('API Error'))
            }
          }
        }))
      }));

      const { app } = await import('../src/server');

      const response = await request(app)
        .post('/review')
        .send({
          diff: 'test diff',
          author: 'test',
          branch: 'main',
          commitHash: '123',
          commitMessage: 'test'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('AI review failed');
    });
  });
});