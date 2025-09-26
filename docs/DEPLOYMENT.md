# Deployment Guide

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run development server:
```bash
npm run dev
```

## Docker Deployment

### Build Image

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Run Container

```bash
docker build -t ai-pr-review .
docker run -p 3000:3000 --env-file .env ai-pr-review
```

## Cloud Deployment

### Heroku

1. Create app:
```bash
heroku create your-app-name
```

2. Set environment variables:
```bash
heroku config:set OPENAI_API_KEY=your_key
heroku config:set NODE_ENV=production
```

3. Deploy:
```bash
git push heroku main
```

### Azure App Service

1. Create Web App in Azure Portal

2. Configure Application Settings:
   - Add all environment variables from .env
   - Set Node version to 18.x

3. Deploy via Git:
```bash
git remote add azure https://your-app.scm.azurewebsites.net/your-app.git
git push azure main
```

### AWS Lambda

1. Install serverless framework:
```bash
npm install -g serverless
```

2. Create serverless.yml:
```yaml
service: ai-pr-review
provider:
  name: aws
  runtime: nodejs18.x
  environment:
    OPENAI_API_KEY: ${env:OPENAI_API_KEY}
functions:
  review:
    handler: lambda.handler
    events:
      - http:
          path: review
          method: post
```

3. Deploy:
```bash
serverless deploy
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run build
      # Add deployment steps for your platform
```

### Azure DevOps Pipeline

```yaml
trigger:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '18.x'

  - script: |
      npm ci
      npm test
      npm run build
    displayName: 'Build and test'

  - task: AzureWebApp@1
    inputs:
      azureSubscription: 'Your Subscription'
      appName: 'your-app-name'
      package: '$(System.DefaultWorkingDirectory)'
```

## Environment Variables

Required for all deployments:
- `OPENAI_API_KEY` - Your OpenAI API key
- `NODE_ENV` - Set to 'production'
- `PORT` - Server port (default: 3000)

Optional for Azure DevOps integration:
- `AZURE_PAT` - Personal Access Token
- `AZURE_ORG` - Organization name
- `AZURE_PROJECT` - Project name
- `AZURE_REPO_ID` - Repository ID
- `AZURE_PR_ID` - Pull Request ID

## Health Check

Add a health endpoint for monitoring:

```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});
```

## Security Considerations

1. **API Keys**: Never commit API keys to source control
2. **Rate Limiting**: Implement rate limiting in production
3. **CORS**: Configure CORS for your specific domains
4. **HTTPS**: Always use HTTPS in production
5. **Input Validation**: Validate diff size and content

## Monitoring

Consider adding:
- Application Performance Monitoring (APM)
- Error tracking (Sentry, Rollbar)
- Logging aggregation (CloudWatch, Application Insights)
- Uptime monitoring (Pingdom, UptimeRobot)

## Scaling

For high traffic:
1. Implement caching for similar diffs
2. Use queue system for async processing
3. Add load balancer for multiple instances
4. Consider serverless for auto-scaling