#!/bin/bash
# Full regeneration script: populate + embed

set -e

echo "=========================================="
echo "Step 1: Populate Database (5k movies, 2k series)"
echo "=========================================="
yarn populate --xlarge --force --skip-lambda

echo ""
echo "=========================================="
echo "Step 2: Generate Movie Embeddings"
echo "=========================================="
npx tsx scripts/generate-embeddings.ts --type=movie --limit=5000 --force

echo ""
echo "=========================================="
echo "Step 3: Generate Series Embeddings"
echo "=========================================="
npx tsx scripts/generate-embeddings.ts --type=series --limit=2000 --force

echo ""
echo "=========================================="
echo "✅ All steps complete!"
echo "=========================================="

# Validation
echo ""
echo "Running validation..."
npx tsx -e "
import { config } from 'dotenv';
config({ path: '.env.local' });
import { getEmbeddingStats } from './src/server/db/postgres/semantic-search.js';

const stats = await getEmbeddingStats();
console.log('Embedding coverage:', stats);
process.exit();
"
