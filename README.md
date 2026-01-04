# Movie Browser (Next.js)

AI-first movie/TV discovery platform built with Next.js 15, React 19, and TypeScript.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **React**: 19.x with Server Components
- **Language**: TypeScript (strict mode)
- **UI**: shadcn/ui + Tailwind CSS v4
- **State**: Zustand (client) + TanStack Query (server)
- **Database**: MongoDB with Mongoose
- **Auth**: Auth.js v5 (NextAuth)
- **AI Agent**: LangGraph.js + AWS Bedrock

## Getting Started

### Prerequisites

- Node.js 22+
- Yarn 4.x
- MongoDB (local or Atlas)

### Environment Setup

Copy `template.env` to `.env.local` and fill in the values:

```bash
cp template.env .env.local
```

Required environment variables:
- `AUTH_SECRET` - Generate with `openssl rand -base64 32`
- `GOOGLE_AUTH_CLIENT_ID` / `GOOGLE_AUTH_CLIENT_SECRET` - From Google Cloud Console
- `MONGODB_URI` or `MONGO_IP`/`MONGO_PASS` - MongoDB connection
- `TMDB_API_KEY` - From TMDB API

### Development

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

### Production URLs

| Environment | URL | Port |
|-------------|-----|------|
| Production (Nuxt legacy) | https://themoviebrowser.com | 3001 |
| Beta (Next.js) | https://beta.themoviebrowser.com | 3002 |

### EC2 Deployment

The app runs on AWS EC2 (Ubuntu ARM64) with nginx reverse proxy.

#### One-Command Deploy

```bash
# Full build + upload + start
yarn deploy

# Skip build (use existing .next folder)
yarn deploy:quick

# Just restart PM2 on EC2
yarn deploy:restart
```

#### What the deploy script does:

1. Builds Next.js locally (`yarn build`)
2. Creates tarball with `.next`, `public`, `package.json`, `next.config.mjs`, `.env.local`
3. Uploads to EC2 via SCP
4. Extracts and runs `npm install --omit=dev`
5. Starts/restarts via PM2 on port 3002

#### SSH Access

```bash
yarn ssh              # SSH into EC2
yarn ssh:logs         # View PM2 logs
```

### Infrastructure

| Service | Details |
|---------|---------|
| EC2 | t4g.medium (ARM64), Ubuntu 24.04 |
| Nginx | Reverse proxy with GeoIP headers, SSL via Let's Encrypt |
| MongoDB | Docker container on port 27018 |
| PM2 | Process manager for Node.js apps |

### Adding a New Subdomain

1. Add Route 53 A record pointing to EC2 IP
2. Get SSL cert: `sudo certbot certonly --standalone -d subdomain.themoviebrowser.com`
3. Add nginx server block proxying to the app port
4. Reload nginx: `sudo systemctl reload nginx`
5. Add to Google OAuth authorized origins/redirects

## Scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | Start dev server with Turbopack |
| `yarn build` | Production build |
| `yarn start` | Start production server |
| `yarn deploy` | Build and deploy to EC2 |
| `yarn typecheck` | Run TypeScript checks |
| `yarn lint` | Run ESLint |
| `yarn test:unit` | Run unit tests |
| `yarn test:e2e` | Run Playwright E2E tests |

## Project Structure

```
src/
├── app/           # Next.js App Router pages
├── components/    # React components
│   ├── ui/        # shadcn/ui (DO NOT MODIFY)
│   └── features/  # Domain components
├── lib/           # Utilities and helpers
├── hooks/         # Custom React hooks
├── stores/        # Zustand stores
├── server/        # Server-side code
│   ├── actions/   # Server Actions
│   ├── services/  # External APIs (TMDB)
│   ├── db/        # MongoDB models
│   └── ai/        # AI agent (LangGraph)
└── types/         # TypeScript types

scripts/
├── deploy-next.sh        # EC2 deployment script
├── setup-beta-domain.sh  # Subdomain setup script
└── generate-sitemap.js   # Sitemap generator

terraform/                # Infrastructure as Code
```

## Architecture Rules

See `.cursor/rules/` for detailed AI-agent guidelines:
- `core.mdc` - Architecture patterns
- `ai-agent.mdc` - AI agent implementation
- `api.mdc` - API and Server Actions
- `components.mdc` - UI component patterns
- `auth.mdc` - Authentication patterns
- `seo.mdc` - SEO requirements
- `testing.mdc` - Testing patterns
