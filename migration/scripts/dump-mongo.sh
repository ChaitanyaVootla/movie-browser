#!/bin/sh

set -e

echo "🚀 Starting MongoDB dump from Digital Ocean to S3..."

# Install required packages
apk add --no-cache openssh-client sshpass aws-cli

# Set up SSH connection
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

# Configure AWS CLI
echo "🔧 Configuring AWS CLI..."
aws configure set aws_access_key_id ${AWS_ACCESS_KEY_ID}
aws configure set aws_secret_access_key ${AWS_SECRET_ACCESS_KEY}
aws configure set default.region ${AWS_DEFAULT_REGION}

# Create S3 bucket if it doesn't exist
echo "🪣 Creating S3 bucket if it doesn't exist..."
aws s3 mb s3://${S3_BUCKET_NAME} --region ${AWS_DEFAULT_REGION} 2>/dev/null || echo "Bucket already exists or creation failed"

echo "📡 Connecting to DO droplet at ${DO_HOST}..."

# Clean up remote dump directory and create fresh one
sshpass -p "${DO_PASSWORD}" ssh ${SSH_OPTS} ${DO_USER}@${DO_HOST} "rm -rf /tmp/mongodb-dump && mkdir -p /tmp/mongodb-dump"

echo "🗄️  Executing mongodump on remote container (excluding movies and series)..."

# Execute mongodump inside the container with optimizations for large databases
# Excluding movies and series collections for testing
sshpass -p "${DO_PASSWORD}" ssh ${SSH_OPTS} ${DO_USER}@${DO_HOST} \
  "docker exec ${DO_CONTAINER} mongodump \
    --host localhost \
    --port 27017 \
    --username ${DO_MONGO_USER} \
    --password ${DO_MONGO_PASS} \
    --authenticationDatabase admin \
    --db ${DO_MONGO_DB} \
    --out /tmp/dump \
    --excludeCollection movies \
    --excludeCollection series \
    --numParallelCollections 1 \
    --gzip \
    --verbose"

echo "📦 Copying dump from container to host..."

# Copy dump from container to host
sshpass -p "${DO_PASSWORD}" ssh ${SSH_OPTS} ${DO_USER}@${DO_HOST} \
  "docker cp ${DO_CONTAINER}:/tmp/dump/${DO_MONGO_DB} /tmp/mongodb-dump/"

echo "📦 Compressing dump on remote host..."

# Create compressed archive on remote host (fixed name, will overwrite in S3)
sshpass -p "${DO_PASSWORD}" ssh ${SSH_OPTS} ${DO_USER}@${DO_HOST} \
  "cd /tmp/mongodb-dump && tar -czf mongodb-dump.tar.gz ${DO_MONGO_DB}/"

echo "☁️  Uploading dump directly from DO droplet to S3 (will overwrite existing)..."

# Upload directly from remote host to S3 (using AWS CLI on remote host)
sshpass -p "${DO_PASSWORD}" ssh ${SSH_OPTS} ${DO_USER}@${DO_HOST} \
  "aws configure set aws_access_key_id ${AWS_ACCESS_KEY_ID} && \
   aws configure set aws_secret_access_key ${AWS_SECRET_ACCESS_KEY} && \
   aws configure set default.region ${AWS_DEFAULT_REGION} && \
   aws s3 cp /tmp/mongodb-dump/mongodb-dump.tar.gz s3://${S3_BUCKET_NAME}/mongodb-dumps/ --no-progress"

echo "🧹 Cleaning up remote files..."

# Clean up remote files
sshpass -p "${DO_PASSWORD}" ssh ${SSH_OPTS} ${DO_USER}@${DO_HOST} \
  "rm -rf /tmp/mongodb-dump && docker exec ${DO_CONTAINER} rm -rf /tmp/dump"

echo "✅ MongoDB dump completed successfully!"
echo "📁 Dump file uploaded to S3: s3://${S3_BUCKET_NAME}/mongodb-dumps/mongodb-dump.tar.gz"

# List S3 contents for verification
echo "📋 S3 bucket contents:"
aws s3 ls s3://${S3_BUCKET_NAME}/mongodb-dumps/ --recursive

