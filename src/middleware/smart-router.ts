/**
 * Smart Router Middleware
 * Routes review requests based on diff size to appropriate strategy
 */

import { Request, Response, NextFunction } from 'express';
import { loadLargeReviewConfig } from '../../config/large-review.config';

export type ReviewStrategy = 'standard' | 'chunked' | 'hierarchical';

export interface ReviewRequest extends Request {
  reviewStrategy?: ReviewStrategy;
}

/**
 * Smart routing middleware that determines review strategy based on diff size
 */
export const smartRouter = (req: ReviewRequest, res: Response, next: NextFunction): void => {
  const { diff } = req.body;
  const config = loadLargeReviewConfig();

  if (!diff || typeof diff !== 'string') {
    req.reviewStrategy = 'standard';
    return next();
  }

  const diffSize = diff.length;

  // Determine strategy based on size thresholds
  if (diffSize <= config.routing.standardThreshold) {
    req.reviewStrategy = 'standard';
    console.log(`[SmartRouter] Using STANDARD review (${diffSize} chars)`);
  } else if (diffSize <= config.routing.chunkedThreshold) {
    req.reviewStrategy = 'chunked';
    console.log(`[SmartRouter] Using CHUNKED review (${diffSize} chars)`);
  } else {
    req.reviewStrategy = 'hierarchical';
    console.log(`[SmartRouter] Using HIERARCHICAL review (${diffSize} chars)`);
  }

  next();
};

/**
 * Validation middleware for large review requests
 */
export const validateLargeReviewRequest = (req: Request, res: Response, next: NextFunction): void => {
  const { diff, files } = req.body;

  if (!diff || typeof diff !== 'string') {
    res.status(400).json({ error: 'Missing or invalid diff' });
    return;
  }

  if (diff.length > 5 * 1024 * 1024) {
    res.status(413).json({
      error: 'Diff too large (max 5MB)',
      size: diff.length,
      maxSize: 5 * 1024 * 1024,
    });
    return;
  }

  next();
};
