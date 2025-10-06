import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface AzureConfig {
  pat: string;
  org: string;
  project: string;
  repoId: string;
  pullRequestId: string;
}

function validateAzureConfig(): AzureConfig {
  const requiredFields = {
    pat: process.env.AZURE_PAT,
    org: process.env.AZURE_ORG,
    project: process.env.AZURE_PROJECT,
    repoId: process.env.AZURE_REPO_ID,
    pullRequestId: process.env.AZURE_PR_ID
  };

  const missing = Object.entries(requiredFields)
    .filter(([key, value]) => !value)
    .map(([key]) => key.toUpperCase());

  if (missing.length > 0) {
    throw new Error(`Missing required Azure configuration: ${missing.join(', ')}`);
  }

  return {
    pat: requiredFields.pat!,
    org: requiredFields.org!,
    project: requiredFields.project!,
    repoId: requiredFields.repoId!,
    pullRequestId: requiredFields.pullRequestId!
  };
}

export async function postCommentToAzure(reviewText: string): Promise<void> {
  try {
    const config = validateAzureConfig();
    const url = `https://dev.azure.com/${config.org}/${config.project}/_apis/git/repositories/${config.repoId}/pullRequests/${config.pullRequestId}/threads?api-version=7.1-preview.1`;
    const auth = Buffer.from(`:${config.pat}`).toString('base64');

    const thread = {
      comments: [
        {
          parentCommentId: 0,
          content: `## 🤖 AI Code Review\n\n${reviewText}`,
          commentType: 1
        }
      ],
      status: 1
    };

    console.log(`Posting review to Azure DevOps PR #${config.pullRequestId}...`);

    const response = await axios.post(url, thread, {
      timeout: 30000,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Posted review to PR:', response.data.id);
  } catch (err: any) {
    console.error('❌ Failed to post comment to Azure PR:', err.response?.data || err.message);
    throw err;
  }
}

// CLI support: allow running directly with REVIEW_TEXT env var
if (require.main === module) {
  const reviewText = process.env.REVIEW_TEXT || 'No review text found.';
  postCommentToAzure(reviewText);
}