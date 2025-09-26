import { execSync } from 'child_process';
import axios from 'axios';
import simpleGit from 'simple-git';
import fs from 'fs';

const git = simpleGit();

interface ReviewPayload {
  diff: string;
  files: string[];
  author: string;
  branch: string;
  commitHash?: string;
  commitMessage?: string;
}

interface ReviewResponse {
  author: string;
  branch: string;
  commitHash?: string;
  commitMessage?: string;
  review: string;
  model?: string;
  timestamp?: string;
}

async function run() {
  const base = process.env.PR_BASE || 'master';
  const diff = execSync(`git diff origin/${base}...HEAD`, {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 10 // 10 MB buffer
  });

  if (!diff.trim()) {
    console.log('No changes found between origin/master and HEAD.');
    return;
  }

  const branchSummary = await git.branch();
  const branchName = branchSummary.current;

  const log = await git.log({ maxCount: 1 });
  const commit = log.latest;

  const fileList = execSync(`git diff --name-only origin/${base}...HEAD`, {
    encoding: 'utf-8'
  })
    .split('\n')
    .filter(Boolean);

  const payload: ReviewPayload = {
    diff,
    files: fileList,
    author: commit?.author_name || 'unknown',
    branch: branchName,
    commitHash: commit?.hash,
    commitMessage: commit?.message
  };

  try {
    const serverUrl = process.env.REVIEW_SERVER_URL || 'http://localhost:3000';
    const response = await axios.post<ReviewResponse>(`${serverUrl}/review`, payload, {
      timeout: 60000, // 60 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('\n--- AI Code Review ---\n');
    console.log(`Author: ${payload.author}`);
    console.log(`Branch: ${payload.branch}`);
    console.log(`Commit: ${payload.commitHash}`);
    console.log(`Message: ${payload.commitMessage}`);

    if (response.data.model) {
      console.log(`Model: ${response.data.model}`);
    }

    console.log('\nReview:\n' + response.data.review);

    // Save review to environment for Azure integration
    const cleanReview = JSON.stringify(response.data.review).replace(/\n/g, '\\n').replace(/"/g, '\\"');
    fs.appendFileSync('.env', `\nREVIEW_TEXT="${cleanReview}"\n`);

    // Run Azure integration if configured
    if (process.env.AZURE_PAT && process.env.AZURE_ORG) {
      console.log('\n📤 Posting to Azure DevOps...');
      execSync('ts-node post-to-azure.ts');
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ Review failed: ${error.response?.data?.error || error.message}`);
      process.exit(1);
    } else {
      console.error(`❌ Unexpected error: ${error}`);
      process.exit(1);
    }
  }
}

run().catch(console.error);