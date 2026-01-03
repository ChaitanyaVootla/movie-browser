# Movie Browser Migration: Nuxt.js → Next.js

## Overview

This document tracks the migration from Nuxt.js 4/Vue 3 to Next.js 15/React 19.

**Status**: ✅ Migration Complete  
**Started**: December 2024  
**Completed**: January 2025

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

### Phase 1: Foundation ✅ COMPLETE

- [x] Create Next.js 15 project with TypeScript strict mode
- [x] Configure shadcn/ui + Tailwind v4
- [x] Set up Cursor rules for AI maintenance
- [x] Configure next-themes (dark/light mode)
- [x] Set up Auth.js with Google provider + Google One Tap
- [x] Set up Mongoose connection
- [x] Create base layout with NavBar

### Phase 2: Core Pages ✅ COMPLETE

- [x] Homepage with trending carousel
- [x] Movie details page with full SEO
- [x] Series details page
- [x] Person page
- [x] Browse/Discover page
- [x] Topics pages (index, all, detail)
- [x] Search page

### Phase 3: User Features ✅ COMPLETE

- [x] User authentication flow (Google OAuth + One Tap)
- [x] Watch list functionality (movies + series)
- [x] Watched movies tracking
- [x] Ratings system (like/dislike)
- [x] Continue watching tracking
- [x] Recent visits tracking
- [x] User library pages (watchlist, watched, ratings)

### Phase 4: Polish & Optimization ✅ COMPLETE

- [x] Page transitions with Framer Motion
- [x] Micro-interactions (hover cards, badges)
- [x] Image optimization with CDN
- [x] Progressive loading (hero shell components)
- [x] HoverCard system (Netflix-style previews)
- [x] Media badges system (New, Trending, etc.)
- [ ] PWA setup (next-pwa) - **PENDING**
- [ ] Full performance audit - **PENDING**

### Phase 5: Testing & Launch 🚧 IN PROGRESS

- [x] Basic homepage SEO test
- [ ] Complete Playwright SEO tests for all pages
- [ ] Add E2E user flow tests
- [ ] Performance benchmarks
- [ ] Staging deployment
- [ ] Production cutover

## Additional Features Implemented

### AI Agent (Phases 1-8 Complete)
- [x] LangGraph.js agent with AWS Bedrock
- [x] 9 consolidated tools (search, discover, details, etc.)
- [x] Floating assistant UI
- [x] Media tag system with auto-resolution
- [x] Enhanced discover with exclusions and AND/OR logic

### Advanced UI Components
- [x] Card display preference (poster vs wide cards)
- [x] Country selector for watch providers
- [x] Episode modal with image carousel
- [x] Video gallery with YouTube integration
- [x] Image gallery with lightbox

## Directory Structure

```
src/
├── app/                 # Pages (App Router)
│   ├── layout.tsx
│   ├── page.tsx
│   ├── movie/[...params]/
│   ├── series/[...params]/
│   ├── person/[...params]/
│   ├── browse/
│   ├── topics/
│   ├── search/
│   ├── watchlist/
│   ├── watched/
│   ├── ratings/
│   ├── admin/
│   └── api/
├── components/
│   ├── ui/              # shadcn (don't modify)
│   └── features/        # Domain components
├── lib/                 # Utilities
├── hooks/               # Custom hooks
├── stores/              # Zustand stores
├── server/
│   ├── actions/         # Server Actions
│   ├── ai/              # AI Agent
│   ├── db/              # Mongoose models
│   └── services/        # External APIs (TMDB)
├── types/               # TypeScript types
└── styles/              # Global CSS
```

## Remaining Work

### High Priority
1. Complete E2E SEO tests for movie/series/person pages
2. Add user flow E2E tests (watchlist, search)
3. AI Agent Phase 9: Mutation tools (add to watchlist via chat)

### Medium Priority
1. PWA setup for mobile app-like experience
2. AI Agent Phase 10-11: Enriched user data + conversation intelligence
3. Performance optimization audit

### Future
1. AI Agent Phase 12-13: Production readiness + Vector DB
2. Social features (lists, reviews, follows)
3. Episode-level tracking for series

## Commands

```bash
# Development
yarn dev

# Type checking
yarn typecheck

# Linting
yarn lint

# Unit tests
yarn test:unit

# E2E tests
yarn test:e2e

# SEO tests only
yarn test:seo

# Build
yarn build

# Production start
yarn start
```

## Notes

- MongoDB connection is shared between Nuxt (legacy) and Next.js apps
- User sessions are compatible (same Google OAuth)
- Nuxt app preserved in `/nuxt` folder for reference

## References

- [Next.js 15 Docs](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Auth.js](https://authjs.dev)
- [Zustand](https://zustand-demo.pmnd.rs)
- [Framer Motion](https://www.framer.com/motion/)
