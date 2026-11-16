# Movie Browser - Project Context for AI Agents

This is an **AI-first movie/TV discovery platform** built with Next.js 15, React 19, and TypeScript. The codebase is designed to be maintained by AI agents (like Antigravity) with human oversight.

## Quick Reference

- **Production URL**: https://beta.themoviebrowser.com
- **Framework**: Next.js 15 (App Router) + React 19 (Server Components)
- **Database**: PostgreSQL (primary) + MongoDB (enrichment, being migrated)
- **Deployment**: AWS EC2 (ARM64) + PM2 + Nginx

## Key Architecture Files

All detailed rules and patterns are in `.agent/rules/`:

| File | Purpose |
|------|---------|
| `core.md` | Core architecture patterns, tech stack, directory structure |
| `api.md` | API routes and Server Actions patterns |
| `components.md` | UI component patterns and conventions |
| `ai-agent.md` | AI assistant implementation (LangGraph) |
| `auth.md` | Authentication patterns (Auth.js v5) |
| `seo.md` | SEO requirements and OpenGraph setup |
| `testing.md` | Testing patterns (Playwright E2E + Vitest) |
| `enrichment.md` | Data enrichment and scraping logic |
| `ai-maintenance.md` | AI maintenance workflows |

## Critical Patterns

### 1. **Server Components First**
Default to Server Components. Only use `"use client"` for interactivity (hooks, events, browser APIs).

### 2. **Data Hydration Service**
All detail pages use `src/server/services/hydration/`:
- PostgreSQL as source of truth
- MongoDB for enrichment (ratings, watch links)
- Lambda scraping fallback
- Full round-trip verification (upsert → read back → return)

### 3. **Caching Strategy**
- **L1 (Memory)**: node-cache (fast, volatile)
- **L2 (File)**: `.cache/` (persistent, survives restarts)
- **Stale-While-Revalidate**: Instant stale data + background refresh
- **Cache Warming**: L2 → L1 on server start (YouTube quota protection)

### 4. **Image Handling**
CDN-first with TMDB fallback:
```
https://image.themoviebrowser.com/{movie|series}/{id}/{type}.webp
```

### 5. **Logging**
Structured JSON logging via Pino (`src/lib/logger.ts`):
```typescript
import { dataLogger } from "@/lib/logger";
dataLogger.info({ event: "movie_fetched", movieId: id });
```

### 6. **Analytics**
- **Client**: ClickHouse + page views + Web Vitals + error tracking
- **Server**: Structured Pino logs
- **Dashboard**: `/admin` (protected, analytics + users)

## Development Workflow

```bash
yarn dev              # Start dev server (port 3000)
yarn build            # Production build
yarn deploy           # Build + deploy to EC2
yarn deploy:quick     # Deploy without rebuild
yarn ssh              # SSH into EC2
yarn ssh:logs         # View PM2 logs
```

## Common Tasks

### Adding a New Page
1. Create in `src/app/` (Server Component by default)
2. Add metadata export for SEO
3. Split into `client.tsx` if interactivity needed

### Adding a New API Route
1. Prefer Server Actions (`src/server/actions/`)
2. Use API routes only for webhooks or third-party integrations
3. Validate with Zod, log with Pino

### Modifying Database Schema
1. **PostgreSQL**: Update `prisma/schema.prisma` → `npx prisma migrate dev`
2. **MongoDB**: Update `src/server/db/models/` (legacy, avoid)

### Debugging Cache Issues
```bash
GET /api/health?format=detailed    # View cache stats
# Bump CACHE_VERSION in lib/cache-service.ts to invalidate
```

## Project Philosophy

- **AI-First**: Code should be self-documenting for AI agents
- **Type Safety**: Strict TypeScript, Zod validation everywhere
- **Performance**: Server Components, caching, CDN images, virtualization
- **Privacy**: Self-hosted analytics (ClickHouse + Grafana)
- **SEO**: SSR, metadata, OpenGraph, sitemap, GeoIP headers

## Need More Details?

Read the specific rule files in `.agent/rules/` for comprehensive guidance on each domain.
