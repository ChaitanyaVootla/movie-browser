---
description: Deploy Next.js app to EC2 production server
---

# Deploy to EC2

This workflow deploys the Movie Browser Next.js app to the AWS EC2 production server.

## Prerequisites

- Ensure you have SSH access configured (`~/.ssh/config` with `moviebrowser` host)
- Environment variables are set in `.env.local` on EC2
- PM2 is installed and configured on EC2

## Steps

### 1. Verify local build

```bash
yarn build
```

This ensures the app builds successfully before deployment.

### 2. Run deployment script

// turbo
```bash
yarn deploy
```

This script will:
1. Build the app locally (`yarn build`)
2. Create a tarball with `.next/`, `public/`, `package.json`, `next.config.mjs`, `.env.local`
3. Upload to EC2 via SCP
4. Extract on EC2
5. Run `npm install --omit=dev`
6. Restart PM2 process

### 3. Verify deployment

// turbo
```bash
yarn ssh:logs
```

Check PM2 logs to ensure the app started successfully.

### 4. Test production site

Visit https://beta.themoviebrowser.com and verify:
- Home page loads
- Search works
- Detail pages render
- Authentication functions

## Quick Deploy (Skip Build)

If you've already built locally and just want to upload:

```bash
yarn deploy:quick
```

## Restart Only

If code is already deployed and you just need to restart:

```bash
yarn deploy:restart
```

## Troubleshooting

### Build fails locally

- Check TypeScript errors: `yarn typecheck`
- Check linting: `yarn lint`
- Check tests: `yarn test:unit`

### Upload fails

- Verify SSH access: `yarn ssh`
- Check EC2 disk space: `df -h`

### App won't start on EC2

- SSH in: `yarn ssh`
- Check PM2 status: `pm2 status`
- View full logs: `pm2 logs movie-browser-next --lines 100`
- Check for environment variable issues

### Database connection issues

- Verify MongoDB is running: `docker ps`
- Check `MONGODB_URI` in `.env.local`
- Test connection from EC2

## Rollback

If deployment fails:

1. SSH into EC2: `yarn ssh`
2. Navigate to previous release: `cd ~/movie-browser-previous`
3. Restart PM2 with old version: `pm2 restart movie-browser-next`

## Notes

- Production runs on port 3002
- Nginx proxies port 443 → 3002
- PM2 auto-restarts on crashes
- Logs are in `/home/ubuntu/.pm2/logs/`
