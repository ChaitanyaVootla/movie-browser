# Vector Database Integration Notes

## Status: Phase 13 (Future)

Vector DB integration is planned for natural language movie search.

## Planned Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Vector Database (Pinecone / pgvector / Weaviate)       │
├─────────────────────────────────────────────────────────┤
│ Movie embeddings:                                       │
│   - Title + overview + genres + keywords               │
│   - Mood/tone descriptors                              │
│   - Visual style tags                                  │
├─────────────────────────────────────────────────────────┤
│ User preference embeddings:                            │
│   - Based on liked movies                              │
│   - Genre preferences                                  │
│   - Viewing patterns                                   │
└─────────────────────────────────────────────────────────┘
```

## Planned Tool

```typescript
semantic_search(query: string, mediaType?: "movie" | "tv", limit?: number)

// Natural language query → vector search → ranked results
// "Visually stunning sci-fi with philosophical themes"
// "Cozy feel-good movies for a rainy day"
// "Dark psychological thrillers with unreliable narrators"
```

## Embedding Improvements

### Features to add to embeddings

- Revenue and budget data (blockbuster vs indie)
- Certification data (G, PG, R, etc.)
- Release year (decade context)
- TMDB rating (quality signal)
- Runtime (short vs long films)
- Production country (Hollywood, Bollywood, etc.)

### Benchmark methods

- PCA dimensionality reduction to visualize clusters
- Test query relevance with manual evaluation sets
- A/B test against keyword-based search

## Prerequisites Before Implementation

1. AI Agent Phase 11: Conversation Intelligence (for session context)
2. AI Agent Phase 12: Production Readiness (for cost monitoring)
3. Sufficient movie catalog with enriched metadata

## Related Files

- Implementation plan: `docs/AI_AGENT_IMPLEMENTATION_PLAN.md` (Phase 13)
- Agent rules: `.cursor/rules/ai-agent.mdc`
- Existing analysis: `VectorDB/analysis.ipynb`
