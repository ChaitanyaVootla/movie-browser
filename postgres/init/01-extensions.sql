-- =============================================================================
-- PostgreSQL Extensions for Movie Browser
-- =============================================================================

-- pgvector: Vector similarity search for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: Trigram-based fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- uuid-ossp: UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify extensions installed
DO $$
BEGIN
  RAISE NOTICE 'Installed extensions:';
END
$$;

SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp');

-- =============================================================================
-- Trigram similarity settings
-- =============================================================================

-- Lower the similarity threshold for fuzzy matching (default is 0.3)
-- This makes searches more lenient with typos
SET pg_trgm.similarity_threshold = 0.2;

-- =============================================================================
-- Create shadow database for Prisma migrations
-- =============================================================================

-- Note: This runs as superuser during init
SELECT 'CREATE DATABASE moviebrowser_shadow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'moviebrowser_shadow')\gexec

