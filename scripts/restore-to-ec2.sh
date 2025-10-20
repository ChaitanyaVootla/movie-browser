#!/bin/bash

# MongoDB Restore Script for EC2
# This script SSHs into the EC2 instance and restores MongoDB data from S3

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
EC2_USER="ubuntu"
EC2_HOST=""
SSH_KEY_PATH=""
S3_BUCKET=""
MONGODB_PASSWORD=""
MONGODB_PORT="27018"
DB_NAME="test"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --ec2-host)
            EC2_HOST="$2"
            shift 2
            ;;
        --ssh-key)
            SSH_KEY_PATH="$2"
            shift 2
            ;;
        --s3-bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        --mongodb-password)
            MONGODB_PASSWORD="$2"
            shift 2
            ;;
        --mongodb-port)
            MONGODB_PORT="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --ec2-host <ip>           EC2 Elastic IP address"
            echo "  --ssh-key <path>          Path to SSH private key (.pem file)"
            echo "  --s3-bucket <name>        S3 bucket name containing MongoDB dump"
            echo "  --mongodb-password <pwd>  MongoDB root password"
            echo "  --mongodb-port <port>     MongoDB port (default: 27018)"
            echo "  --help                    Show this help message"
            echo ""
            echo "Example:"
            echo "  $0 --ec2-host 1.2.3.4 --ssh-key terraform/movie-browser-ec2-key.pem --s3-bucket movie-browser-migration-2025-10-19 --mongodb-password 'your-password'"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$EC2_HOST" ]; then
    print_error "EC2 host is required. Use --ec2-host option or run with --help for usage."
    exit 1
fi

if [ -z "$SSH_KEY_PATH" ]; then
    print_error "SSH key path is required. Use --ssh-key option or run with --help for usage."
    exit 1
fi

if [ ! -f "$SSH_KEY_PATH" ]; then
    print_error "SSH key file not found: $SSH_KEY_PATH"
    exit 1
fi

if [ -z "$S3_BUCKET" ]; then
    print_error "S3 bucket name is required. Use --s3-bucket option or run with --help for usage."
    exit 1
fi

if [ -z "$MONGODB_PASSWORD" ]; then
    print_error "MongoDB password is required. Use --mongodb-password option or run with --help for usage."
    exit 1
fi

print_info "Starting MongoDB restore to EC2..."
print_info "EC2 Host: $EC2_HOST"
print_info "S3 Bucket: $S3_BUCKET"
print_info "MongoDB Port: $MONGODB_PORT"
echo ""

# SSH command wrapper
SSH_CMD="ssh -i $SSH_KEY_PATH -o StrictHostKeyChecking=no $EC2_USER@$EC2_HOST"

# Test SSH connection
print_info "Testing SSH connection..."
if ! $SSH_CMD "echo 'SSH connection successful'"; then
    print_error "Failed to connect to EC2 instance"
    exit 1
fi
print_info "SSH connection successful"
echo ""

# Check if MongoDB is running
print_info "Checking MongoDB status..."
if ! $SSH_CMD "docker ps | grep mongodb"; then
    print_error "MongoDB container is not running on EC2"
    print_info "Starting MongoDB container..."
    $SSH_CMD "docker start mongodb" || print_error "Failed to start MongoDB"
fi
print_info "MongoDB is running"
echo ""

# Execute restore on EC2
print_info "Executing restore on EC2..."
$SSH_CMD bash <<EOF
set -e

echo "================================================"
echo "MongoDB Restore Script - Running on EC2"
echo "================================================"

# Create working directory
WORK_DIR="/tmp/mongodb-restore-\$(date +%s)"
mkdir -p \$WORK_DIR
cd \$WORK_DIR

echo "[1/5] Downloading dump from S3..."
aws s3 cp s3://${S3_BUCKET}/mongodb-dumps/mongodb-dump.tar.gz . || {
    echo "ERROR: Failed to download dump from S3"
    exit 1
}

echo "[2/5] Extracting dump..."
tar -xzf mongodb-dump.tar.gz || {
    echo "ERROR: Failed to extract dump"
    exit 1
}

echo "[3/5] Stopping application processes..."
pm2 stop all || echo "No PM2 processes to stop"

echo "[4/5] Restoring MongoDB..."
docker exec mongodb mongorestore \
    --uri="mongodb://root:${MONGODB_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
    --nsInclude="${DB_NAME}.*" \
    --drop \
    --gzip \
    /tmp/mongodb-restore-\$(basename \$WORK_DIR)/dump || {
    echo "ERROR: Failed to restore MongoDB"
    exit 1
}

echo "[5/5] Verifying restore..."
docker exec mongodb mongosh \
    --quiet \
    --eval "db.getSiblingDB('${DB_NAME}').getCollectionNames()" \
    "mongodb://root:${MONGODB_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin"

echo ""
echo "Collection counts:"
docker exec mongodb mongosh \
    --quiet \
    --eval "db.getSiblingDB('${DB_NAME}').getCollectionNames().forEach(function(name) { print(name + ': ' + db.getSiblingDB('${DB_NAME}').getCollection(name).countDocuments()); })" \
    "mongodb://root:${MONGODB_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin"

# Cleanup
echo ""
echo "Cleaning up temporary files..."
cd /tmp
rm -rf \$WORK_DIR

echo ""
echo "================================================"
echo "✅ MongoDB Restore Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Restart PM2 processes: pm2 start ecosystem.config.cjs"
echo "2. Check application logs: pm2 logs"
echo ""
EOF

if [ $? -eq 0 ]; then
    print_info "✅ MongoDB restore completed successfully!"
    echo ""
    print_info "You can now:"
    print_info "1. SSH to EC2: ssh -i $SSH_KEY_PATH ubuntu@$EC2_HOST"
    print_info "2. Start PM2: pm2 start ecosystem.config.cjs && pm2 save"
    print_info "3. Check logs: pm2 logs"
else
    print_error "MongoDB restore failed. Check the output above for details."
    exit 1
fi

