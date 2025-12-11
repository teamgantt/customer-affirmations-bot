# Deployment Guide

This project uses GitHub Actions to automatically deploy to Cloudflare Workers when changes are pushed to the main branch.

## Prerequisites

1. A Cloudflare account
2. A GitHub repository
3. Cloudflare API token with appropriate permissions

## Setup Instructions

### 1. Create a Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template, or create a custom token with:
   - **Account** → **Cloudflare Workers:Edit** permissions
   - **Zone** → **Zone:Read** (if needed)
4. Copy the API token (you won't be able to see it again!)

### 2. Get Your Cloudflare Account ID

1. Login to wrangler
2. `wrangler whoami`

### 3. Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

   - **Name**: `CLOUDFLARE_API_TOKEN`

     - **Value**: Your Cloudflare API token from step 1

   - **Name**: `CLOUDFLARE_ACCOUNT_ID`
     - **Value**: Your Cloudflare Account ID from step 2

### 4. Ensure wrangler.toml is Committed

The `wrangler.toml` file contains your Worker configuration and should be committed to the repository. If it's in `.gitignore`, remove it from there:

```bash
# Remove wrangler.toml from .gitignore if it's there
```

### 5. Deploy

Once the secrets are configured:

- **Automatic**: Push to the `main` or `master` branch to trigger automatic deployment
- **Manual**: Go to **Actions** tab → **Deploy to Cloudflare Workers** → **Run workflow**

## Workflow Details

The GitHub Actions workflow (`.github/workflows/deploy.yml`) will:

1. Checkout your code
2. Setup Node.js 18
3. Install dependencies (`npm ci`)
4. Deploy to Cloudflare Workers using Wrangler

## Troubleshooting

### Deployment Fails

1. **Check secrets**: Ensure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set correctly
2. **Check permissions**: Verify your API token has "Workers:Edit" permissions
3. **Check logs**: View the Actions tab for detailed error messages

### Authentication Errors

- Verify your API token is valid and not expired
- Ensure the token has the correct permissions
- Check that the Account ID matches your Cloudflare account

### Build Errors

- Ensure `package.json` has all required dependencies
- Check that Node.js version matches (18+)
- Verify `wrangler.toml` is properly configured

## Manual Deployment

If you need to deploy manually without GitHub Actions:

```bash
# Install dependencies
npm install

# Authenticate (if not already done)
npx wrangler login

# Deploy
npm run deploy
```

## Environment-Specific Deployments

To deploy to different environments (staging/production), you can:

1. Create separate workflows for different branches
2. Use GitHub Environments with different secrets
3. Modify `wrangler.toml` to use different configurations

Example for staging:

```yaml
# .github/workflows/deploy-staging.yml
on:
  push:
    branches:
      - develop
```
