#!/bin/bash

# =============================================================================
# Next.js Deployment Script for EC2
# =============================================================================
# Builds locally, zips, uploads, and deploys to EC2 alongside existing Nuxt app
#
# Usage:
#   ./scripts/deploy-next.sh                    # Full deploy (build + upload + start)
#   ./scripts/deploy-next.sh --skip-build       # Skip local build, use existing .next
#   ./scripts/deploy-next.sh --upload-only      # Only upload, don't restart PM2
#   ./scripts/deploy-next.sh --restart-only     # Just restart PM2 (no upload)
#
# Prerequisites:
#   - yarn installed locally
#   - SSH key at ./movie-browser-ec2-key.pem
#   - .env.local file in project root (for production env vars)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EC2_USER="ubuntu"
EC2_HOST="98.130.30.197"
SSH_KEY_PATH="./movie-browser-ec2-key.pem"
REMOTE_DIR="/home/ubuntu/movie-browser-next"
NEXT_PORT="3002"
PM2_APP_NAME="next"
LOCAL_BUILD_DIR=".next"
ZIP_FILE="next-deploy.tar.gz"

# Parse command line arguments
SKIP_BUILD=false
UPLOAD_ONLY=false
RESTART_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --upload-only)
            UPLOAD_ONLY=true
            shift
            ;;
        --restart-only)
            RESTART_ONLY=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-build     Skip local build, use existing .next folder"
            echo "  --upload-only    Only upload files, don't restart PM2"
            echo "  --restart-only   Just restart PM2 (no build or upload)"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown option: $1"
            exit 1
            ;;
    esac
done

# Helper functions
print_step() {
    echo -e "\n${BLUE}[STEP]${NC} $1"
}

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate prerequisites
validate_prereqs() {
    print_step "Validating prerequisites..."
    
    # Check SSH key
    if [ ! -f "$SSH_KEY_PATH" ]; then
        print_error "SSH key not found at $SSH_KEY_PATH"
        exit 1
    fi
    
    # Check if we're in the project root
    if [ ! -f "package.json" ] || [ ! -d "src" ]; then
        print_error "Must run from project root (where package.json and src/ exist)"
        exit 1
    fi
    
    # Check for .env.local (required for production)
    if [ ! -f ".env.local" ]; then
        print_warning ".env.local not found - deployment may fail without env vars"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    print_info "Prerequisites validated"
}

# Build Next.js locally
build_next() {
    if [ "$SKIP_BUILD" = true ]; then
        print_step "Skipping build (--skip-build)"
        if [ ! -d "$LOCAL_BUILD_DIR" ]; then
            print_error ".next folder not found. Run without --skip-build first."
            exit 1
        fi
        return
    fi
    
    print_step "Building Next.js app locally..."
    
    # Clean previous build
    rm -rf .next
    
    # Build
    yarn build
    
    if [ ! -d "$LOCAL_BUILD_DIR" ]; then
        print_error "Build failed - .next folder not created"
        exit 1
    fi
    
    print_info "Build complete"
}

# Create deployment package
create_package() {
    print_step "Creating deployment package..."
    
    # Remove old zip if exists
    rm -f "$ZIP_FILE"
    
    # Create tarball with essential files
    # - .next/ (built output)
    # - public/ (static assets)
    # - package.json (dependencies)
    # - next.config.ts (config)
    # - .env.local (environment variables)
    # - scripts/ (admin tools like enrich)
    
    FILES_TO_INCLUDE=".next public package.json next.config.mjs scripts"
    
    # Add .env.local if it exists
    if [ -f ".env.local" ]; then
        FILES_TO_INCLUDE="$FILES_TO_INCLUDE .env.local"
    fi
    
    tar -czf "$ZIP_FILE" $FILES_TO_INCLUDE
    
    SIZE=$(du -h "$ZIP_FILE" | cut -f1)
    print_info "Package created: $ZIP_FILE ($SIZE)"
}

# Upload to EC2
upload_to_ec2() {
    print_step "Uploading to EC2..."
    
    # Create remote directory if it doesn't exist
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" \
        "mkdir -p $REMOTE_DIR"
    
    # Upload the package
    scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
        "$ZIP_FILE" "$EC2_USER@$EC2_HOST:$REMOTE_DIR/"
    
    print_info "Upload complete"
}

# Deploy on EC2
deploy_on_ec2() {
    print_step "Deploying on EC2..."
    
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" bash <<EOF
set -e

cd $REMOTE_DIR

echo "[1/5] Extracting package..."
tar -xzf $ZIP_FILE
rm -f $ZIP_FILE

echo "[2/5] Creating data directories..."
mkdir -p data/enriched
mkdir -p .cache/youtube-channels
mkdir -p .cache/youtube
mkdir -p .cache/person
mkdir -p .cache/search
mkdir -p .cache/discover
mkdir -p .cache/movie
mkdir -p .cache/series
mkdir -p .cache/images

echo "[3/5] Installing dependencies..."
npm install --omit=dev --legacy-peer-deps --ignore-scripts

echo "[4/5] Stopping existing process (if running)..."
pm2 stop $PM2_APP_NAME 2>/dev/null || true
pm2 delete $PM2_APP_NAME 2>/dev/null || true

echo "[5/5] Starting Next.js on port $NEXT_PORT..."
PORT=$NEXT_PORT pm2 start npm --name $PM2_APP_NAME -- start
pm2 save

echo ""
echo "✅ Deployment complete!"
echo "   App running on: http://$EC2_HOST:$NEXT_PORT"
pm2 list
EOF
    
    print_info "Deployment complete"
}

# Restart only
restart_pm2() {
    print_step "Restarting PM2..."
    
    ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" bash <<EOF
cd $REMOTE_DIR
pm2 restart $PM2_APP_NAME || PORT=$NEXT_PORT pm2 start npm --name $PM2_APP_NAME -- start
pm2 save
pm2 list
EOF
    
    print_info "Restart complete"
}

# Cleanup local files
cleanup() {
    print_step "Cleaning up local files..."
    rm -f "$ZIP_FILE"
    print_info "Cleanup complete"
}

# Main execution
main() {
    echo "=============================================="
    echo "  Next.js Deployment to EC2"
    echo "=============================================="
    echo "  Target: $EC2_USER@$EC2_HOST"
    echo "  Remote Dir: $REMOTE_DIR"
    echo "  Port: $NEXT_PORT"
    echo "=============================================="
    
    if [ "$RESTART_ONLY" = true ]; then
        restart_pm2
        echo ""
        echo -e "${GREEN}✅ Done!${NC}"
        echo "   Access at: http://$EC2_HOST:$NEXT_PORT"
        exit 0
    fi
    
    validate_prereqs
    build_next
    create_package
    upload_to_ec2
    
    if [ "$UPLOAD_ONLY" = true ]; then
        print_info "Upload complete (--upload-only, skipping PM2 restart)"
        cleanup
        exit 0
    fi
    
    deploy_on_ec2
    cleanup
    
    echo ""
    echo "=============================================="
    echo -e "  ${GREEN}✅ Deployment Successful!${NC}"
    echo "=============================================="
    echo ""
    echo "  Next.js app is running at:"
    echo "    http://$EC2_HOST:$NEXT_PORT"
    echo ""
    echo "  Useful commands (SSH into EC2):"
    echo "    pm2 logs next           # View logs"
    echo "    pm2 restart next        # Restart app"
    echo "    pm2 stop next           # Stop app"
    echo ""
    echo "  Note: Port $NEXT_PORT must be open in EC2 Security Group"
    echo "        to access from outside."
    echo ""
}

main

