# Movie Browser Migration: Nuxt.js → Next.js

## Overview

This document tracks the migration from Nuxt.js 4/Vue 3 to Next.js 15/React 19.

**Status**: 🚧 In Progress  
**Started**: December 2024  
**Target Completion**: January 2025

## Tech Stack Comparison

| Aspect         | Nuxt (Old)           | Next (New)        |
| -------------- | -------------------- | ----------------- |
| Framework      | Nuxt 4               | Next.js 15        |
| UI Library     | Vue 3                | React 19          |
| UI Components  | Vuetify              | shadcn/ui         |
| Styling        | Tailwind + LESS      | Tailwind v4       |
| State (Client) | Pinia                | Zustand           |
| State (Server) | useLazyAsyncData     | TanStack Query    |
| Auth           | nuxt-auth (NextAuth) | Auth.js v5        |
| Database       | Mongoose             | Mongoose (same)   |
| Animation      | Vue transitions      | Framer Motion     |
| Testing E2E    | Playwright           | Playwright (same) |
| Testing Unit   | Vitest               | Vitest (same)     |

## Migration Phases

### Phase 1: Foundation ✅

- [x] Create Next.js 15 project with TypeScript strict mode
- [x] Configure shadcn/ui + Tailwind v4
- [x] Set up Cursor rules for AI maintenance
- [ ] Configure next-themes (dark/light/custom)
- [ ] Set up Auth.js with Google provider
- [ ] Set up Mongoose connection
- [ ] Create base layout with NavBar

### Phase 2: Core Pages 🚧

- [ ] Homepage with trending carousel
- [ ] Movie details page with full SEO
- [ ] Series details page
- [ ] Person page
- [ ] Browse/Discover page

### Phase 3: User Features

- [ ] User authentication flow
- [ ] Watch list functionality
- [ ] Watched movies tracking
- [ ] Ratings system
- [ ] Continue watching

### Phase 4: Polish & Optimization

- [ ] Page transitions with Framer Motion
- [ ] Micro-interactions
- [ ] PWA setup (next-pwa)
- [ ] Image optimization with CDN
- [ ] Performance audit

### Phase 5: Testing & Launch

- [ ] Migrate Playwright SEO tests
- [ ] Add new E2E tests
- [ ] Performance benchmarks
- [ ] Staging deployment
- [ ] Production cutover

## Directory Structure

```
next-app/
├── .cursor/rules/           # AI agent guidelines
│   ├── core/RULE.md
│   ├── components/RULE.md
│   ├── seo/RULE.md
│   ├── testing/RULE.md
│   ├── api/RULE.md
│   └── ai-maintenance/RULE.md
├── src/
│   ├── app/                 # Pages (App Router)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── movie/[movieId]/
│   │   ├── series/[seriesId]/
│   │   ├── person/[personId]/
│   │   └── browse/
│   ├── components/
│   │   ├── ui/              # shadcn (don't modify)
│   │   └── features/        # Domain components
│   ├── lib/                 # Utilities
│   ├── hooks/               # Custom hooks
│   ├── stores/              # Zustand stores
│   ├── server/
│   │   ├── actions/         # Server Actions
│   │   ├── db/              # Mongoose models
│   │   └── services/        # External APIs (TMDB)
│   ├── types/               # TypeScript types
│   └── styles/              # Global CSS
├── e2e/                     # Playwright tests
├── public/                  # Static assets
└── docs/                    # Documentation
```

## Component Migration Map

| Nuxt Component     | Next Component      | Notes               |
| ------------------ | ------------------- | ------------------- |
| NavBar.vue         | nav-bar.tsx         | Rewrite with shadcn |
| PosterCard.vue     | movie-card.tsx      | Split Server/Client |
| Scroller.vue       | carousel.tsx        | Use shadcn carousel |
| HoverCard.vue      | hover-preview.tsx   | Use Radix + Framer  |
| Ratings.vue        | ratings-display.tsx | Keep external logos |
| Grid.vue           | content-grid.tsx    | Virtual scroll      |
| DetailsTopInfo.vue | hero-section.tsx    | New design          |

## API Migration Map

Most APIs can remain similar. Key changes:

| Nuxt API                       | Next Equivalent                 |
| ------------------------------ | ------------------------------- |
| `/api/movie/[movieId]`         | Server Action `getMovie()`      |
| `/api/user/movie/[id]/watched` | Server Action `toggleWatched()` |
| `/api/trending`                | Server Action `getTrending()`   |
| `/api/search`                  | API Route (needs streaming)     |

## Data Models (Unchanged)

Mongoose models stay the same:

- Movie
- Series
- User
- Watchlist
- Ratings
- ContinueWatching

## Environment Variables

```env
# Database
MONGODB_URI=

# Auth
AUTH_SECRET=
GOOGLE_AUTH_CLIENT_ID=
GOOGLE_AUTH_CLIENT_SECRET=

# TMDB
TMDB_API_KEY=

# CDN
CDN_API_URL=https://api.themoviebrowser.com

# App
NEXT_PUBLIC_SITE_URL=https://themoviebrowser.com
```

## SEO Requirements

### Must Preserve

- Meta tags structure
- Open Graph tags
- Twitter cards
- Structured data (JSON-LD)
- Canonical URLs
- Sitemap generation
- robots.txt

### Must Verify

- SSR output contains H1
- Images have alt text
- Core Web Vitals scores

## Testing Strategy

### Before Migration Complete

- Run both apps in parallel
- Compare SSR output
- Compare meta tags
- Compare structured data
- Lighthouse scores

### Acceptance Criteria

- [ ] All existing Playwright SEO tests pass
- [ ] Lighthouse Performance score ≥ 90
- [ ] Lighthouse SEO score = 100
- [ ] No accessibility regressions
- [ ] All user flows work

## Rollback Plan

1. Keep Nuxt app deployable
2. Use feature flags for gradual rollout
3. Monitor error rates after switch
4. DNS can point back to Nuxt within minutes

## Commands

```bash
# Development
cd next-app && npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# SEO tests only
npm run test:seo

# Build
npm run build

# Production start
npm start
```

## Notes

- MongoDB connection is shared between both apps
- Can run both apps simultaneously on different ports
- User sessions will need to be re-authenticated after switch (or migrate tokens)

## References

- [Next.js 15 Docs](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Auth.js](https://authjs.dev)
- [Zustand](https://zustand-demo.pmnd.rs)
- [Framer Motion](https://www.framer.com/motion/)
