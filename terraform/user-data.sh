#!/bin/bash
set -e

# Log all output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "=================================="
echo "Movie Browser EC2 Setup Script"
echo "Started at: $(date)"
echo "=================================="

# Update system packages
echo "[1/8] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# Install core tools
echo "[2/8] Installing core tools..."
apt-get install -y \
    git \
    curl \
    wget \
    build-essential \
    python3-pip \
    python3-venv \
    python3-dev \
    ca-certificates \
    gnupg \
    lsb-release \
    unzip \
    jq \
    htop \
    vim

# Install Docker
echo "[3/8] Installing Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker and enable on boot
systemctl start docker
systemctl enable docker

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# Install Node.js 22
echo "[4/8] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install PM2 globally
echo "[5/8] Installing PM2..."
npm install -g pm2

# Setup PM2 startup script for ubuntu user
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Install AWS CLI v2
echo "[6/8] Installing AWS CLI..."
cd /tmp
curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf awscliv2.zip aws/

# Setup MongoDB 8.x Docker container
echo "[7/8] Setting up MongoDB 8.x in Docker..."

# Create MongoDB data directory
mkdir -p /data/mongodb
chown -R ubuntu:ubuntu /data/mongodb

# Pull MongoDB 8.0 image
docker pull mongo:8.0

# Create MongoDB container
docker run -d \
  --name mongodb \
  --restart always \
  -p ${mongodb_port}:27017 \
  -v /data/mongodb:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD='${mongodb_root_password}' \
  mongo:8.0

# Wait for MongoDB to be ready
echo "Waiting for MongoDB to be ready..."
sleep 10

# Verify MongoDB is running
docker ps | grep mongodb && echo "MongoDB is running successfully" || echo "WARNING: MongoDB may not be running"

# Setup application directory
echo "[8/8] Setting up application directories..."
mkdir -p /home/ubuntu/movie-browser
chown -R ubuntu:ubuntu /home/ubuntu/movie-browser

# Create a setup completion marker
touch /var/log/user-data-complete
chown ubuntu:ubuntu /var/log/user-data-complete

echo "=================================="
echo "EC2 Setup Complete!"
echo "Completed at: $(date)"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. SSH into the instance: ssh -i ${project_name}-ec2-key.pem ubuntu@<elastic-ip>"
echo "2. Clone the repository: git clone <repo-url> /home/ubuntu/movie-browser"
echo "3. Setup environment variables in .env file"
echo "4. Install dependencies: npm install"
echo "5. Build application: npm run build"
echo "6. Setup VectorDB: cd VectorDB && python3 -m venv vector && source vector/bin/activate && pip install -r requirements.txt"
echo "7. Restore MongoDB data from backup"
echo "8. Start PM2: pm2 start ecosystem.config.cjs"
echo ""

