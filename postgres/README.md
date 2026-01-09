# PostgreSQL Setup for Movie Browser

## Quick Start

```bash
# Start PostgreSQL with pgvector
docker-compose -f docker-compose.postgres.yml up -d

# Verify it's running
docker ps | grep movie-browser-postgres

# Check extensions are installed
docker exec -it movie-browser-postgres psql -U moviebrowser -d moviebrowser -c "SELECT * FROM pg_extension;"
```

## Connection Details

| Parameter | Value |
|-----------|-------|
| Host | localhost |
| Port | 5433 |
| Database | moviebrowser |
| User | moviebrowser |
| Password | localdev123 (default) |

> **Note:** Using port 5433 to avoid conflict with existing PostgreSQL on 5432

## Connection String

```
postgresql://moviebrowser:localdev123@localhost:5433/moviebrowser
```

Add to your `.env.local`:

```bash
DATABASE_URL="postgresql://moviebrowser:localdev123@localhost:5433/moviebrowser?schema=public"
SHADOW_DATABASE_URL="postgresql://moviebrowser:localdev123@localhost:5433/moviebrowser_shadow?schema=public"
```

## Extensions Installed

| Extension | Purpose |
|-----------|---------|
| `vector` (pgvector) | Vector similarity search for embeddings |
| `pg_trgm` | Trigram fuzzy text search for typo tolerance |
| `uuid-ossp` | UUID generation |

## Commands

### Connect to database
```bash
docker exec -it movie-browser-postgres psql -U moviebrowser -d moviebrowser
```

### View tables
```sql
\dt
```

### Test fuzzy search
```sql
-- Find movies similar to "Shawshnk Redemtion" (intentional typos)
SELECT id, title, similarity(title, 'Shawshnk Redemtion') as sim
FROM movies
WHERE similarity(title, 'Shawshnk Redemtion') > 0.2
ORDER BY sim DESC
LIMIT 5;
```

### Test vector search (after embeddings populated)
```sql
-- Find movies similar to a query embedding
SELECT id, title, 1 - (embedding <=> '[0.1, 0.2, ...]'::vector) as similarity
FROM movies
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

## Maintenance

### Backup
```bash
docker exec movie-browser-postgres pg_dump -U moviebrowser moviebrowser > backup.sql
```

### Restore
```bash
docker exec -i movie-browser-postgres psql -U moviebrowser moviebrowser < backup.sql
```

### Reset database
```bash
docker-compose -f docker-compose.postgres.yml down -v
docker-compose -f docker-compose.postgres.yml up -d
```

### View logs
```bash
docker logs -f movie-browser-postgres
```

## Production Deployment

For EC2 deployment:

1. Update `.env` with secure password
2. Configure PostgreSQL for remote access (pg_hba.conf)
3. Set up SSL certificates
4. Configure firewall rules
5. Set up automated backups

See `docs/POSTGRESQL_MIGRATION_PLAN.md` for full deployment guide.

