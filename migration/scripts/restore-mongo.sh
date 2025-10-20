#!/bin/sh

set -e

echo "🔄 Starting MongoDB restore from S3 to local MongoDB 8.0..."

# Install AWS CLI
apk add --no-cache aws-cli

# Configure AWS CLI
echo "🔧 Configuring AWS CLI..."
aws configure set aws_access_key_id ${AWS_ACCESS_KEY_ID}
aws configure set aws_secret_access_key ${AWS_SECRET_ACCESS_KEY}
aws configure set default.region ${AWS_DEFAULT_REGION}

# Wait for MongoDB to be ready (without auth for initial check)
echo "⏳ Waiting for MongoDB to be ready..."
until mongosh --host mongodb-latest --port 27017 --quiet --eval "db.adminCommand('ping').ok" 2>&1 | grep -q "1"; do
  echo "⏳ MongoDB not ready yet, waiting..."
  sleep 2
done

echo "✅ MongoDB is ready!"

# Clean up any previous dumps
echo "🧹 Cleaning up previous dumps..."
rm -rf /dumps/*

# Download dump from S3 (fixed filename)
echo "☁️  Downloading dump from S3..."

# List available dumps in S3
echo "📋 S3 bucket contents:"
aws s3 ls s3://${S3_BUCKET_NAME}/mongodb-dumps/ --recursive

# Download the fixed-name dump file
DUMP_FILE="mongodb-dumps/mongodb-dump.tar.gz"
echo "📥 Downloading: ${DUMP_FILE}"
aws s3 cp s3://${S3_BUCKET_NAME}/${DUMP_FILE} /dumps/mongodb-dump.tar.gz

if [ ! -f "/dumps/mongodb-dump.tar.gz" ]; then
  echo "❌ Error: Failed to download dump file!"
  exit 1
fi

# Extract the dump
echo "📦 Extracting dump..."
cd /dumps
tar -xzf mongodb-dump.tar.gz

# Check if dump exists
if [ ! -d "/dumps/${LOCAL_MONGO_DB}" ]; then
  echo "❌ Error: Dump directory /dumps/${LOCAL_MONGO_DB} not found after extraction!"
  echo "Available files and directories:"
  ls -la /dumps/
  exit 1
fi

echo "✅ Dump extracted successfully"

echo "📦 Restoring database from dump..."

# Execute mongorestore with gzip support
mongorestore \
  --host mongodb-latest \
  --port 27017 \
  --username ${LOCAL_MONGO_USER} \
  --password ${LOCAL_MONGO_PASS} \
  --authenticationDatabase admin \
  --db ${LOCAL_MONGO_DB} \
  --drop \
  --gzip \
  /dumps/${LOCAL_MONGO_DB}

echo "🔍 Verifying restore..."

# Run verification queries
COLLECTION_COUNT=$(mongosh --host mongodb-latest --port 27017 --username ${LOCAL_MONGO_USER} --password ${LOCAL_MONGO_PASS} --authenticationDatabase admin --quiet --eval "db.getCollectionNames().length" ${LOCAL_MONGO_DB})

echo "📊 Collections found: ${COLLECTION_COUNT}"

# List all collections
echo "📋 Collections in database:"
mongosh --host mongodb-latest --port 27017 --username ${LOCAL_MONGO_USER} --password ${LOCAL_MONGO_PASS} --authenticationDatabase admin --quiet --eval "db.getCollectionNames().forEach(print)" ${LOCAL_MONGO_DB}

# Get document counts for each collection
echo "📈 Document counts per collection:"
mongosh --host mongodb-latest --port 27017 --username ${LOCAL_MONGO_USER} --password ${LOCAL_MONGO_PASS} --authenticationDatabase admin --quiet --eval "db.getCollectionNames().forEach(function(name) { print(name + ': ' + db.getCollection(name).countDocuments()); })" ${LOCAL_MONGO_DB}

echo ""
echo "🧹 Cleaning up dump files..."
rm -f /dumps/mongodb-dump.tar.gz
rm -rf /dumps/${LOCAL_MONGO_DB}

echo "✅ MongoDB restore completed successfully!"
echo "🔗 Connect to verify: docker exec -it migration-mongodb-latest mongosh -u ${LOCAL_MONGO_USER} -p ${LOCAL_MONGO_PASS} --authenticationDatabase admin ${LOCAL_MONGO_DB}"
