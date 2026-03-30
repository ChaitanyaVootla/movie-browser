#!/bin/bash
set -e

# Log all output to /var/log/user-data.log
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "=================================="
echo "Movie Browser EC2 Setup Script"
echo "Started at: $(date)"
echo "=================================="

# Update system packages
echo "[1/7] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# Install core tools
echo "[2/7] Installing core tools..."
apt-get install -y \
    git \
    curl \
    wget \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release \
    unzip \
    jq \
    htop \
    vim

# Install Docker
echo "[3/7] Installing Docker..."
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
echo "[4/7] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install Yarn and PM2 globally
echo "[5/7] Installing Yarn and PM2..."
npm install -g yarn pm2

# Setup PM2 startup script for ubuntu user
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Install AWS CLI v2
echo "[6/7] Installing AWS CLI..."
cd /tmp
curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf awscliv2.zip aws/

# Setup application directories
echo "[7/7] Setting up directories..."
mkdir -p /home/ubuntu/movie-browser-next
mkdir -p /data/postgres
mkdir -p /data/clickhouse
chown -R ubuntu:ubuntu /home/ubuntu/movie-browser-next
chown -R ubuntu:ubuntu /data

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
echo "2. Clone the repository"
echo "3. Start services: docker compose up -d"
echo "4. Apply schema: yarn db:push"
echo "5. Deploy the app: yarn deploy (from local machine)"
echo ""
