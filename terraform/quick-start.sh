#!/bin/bash

# Quick Start Script for AWS EC2 Migration
# This script helps you get started with the Terraform deployment

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Movie Browser - AWS EC2 Quick Start${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}ERROR: AWS CLI is not installed${NC}"
    echo "Install it from: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}ERROR: Terraform is not installed${NC}"
    echo "Install it from: https://www.terraform.io/downloads"
    exit 1
fi

# Check AWS credentials
echo -e "${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}ERROR: AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi
echo -e "${GREEN}✓ AWS credentials configured${NC}"
echo ""

# Check if backend exists
echo -e "${YELLOW}Checking S3 backend...${NC}"
if aws s3 ls s3://movie-browser-terraform-state 2>/dev/null; then
    echo -e "${GREEN}✓ S3 backend exists${NC}"
else
    echo -e "${YELLOW}S3 backend not found. Creating...${NC}"
    
    # Create S3 bucket
    aws s3api create-bucket \
      --bucket movie-browser-terraform-state \
      --region ap-south-2 \
      --create-bucket-configuration LocationConstraint=ap-south-2
    
    # Enable versioning
    aws s3api put-bucket-versioning \
      --bucket movie-browser-terraform-state \
      --versioning-configuration Status=Enabled
    
    # Enable encryption
    aws s3api put-bucket-encryption \
      --bucket movie-browser-terraform-state \
      --server-side-encryption-configuration '{
        "Rules": [{
          "ApplyServerSideEncryptionByDefault": {
            "SSEAlgorithm": "AES256"
          }
        }]
      }'
    
    echo -e "${GREEN}✓ S3 bucket created${NC}"
fi
echo ""

# Check if DynamoDB table exists
echo -e "${YELLOW}Checking DynamoDB table...${NC}"
if aws dynamodb describe-table --table-name movie-browser-terraform-locks --region ap-south-2 &> /dev/null; then
    echo -e "${GREEN}✓ DynamoDB table exists${NC}"
else
    echo -e "${YELLOW}DynamoDB table not found. Creating...${NC}"
    
    aws dynamodb create-table \
      --table-name movie-browser-terraform-locks \
      --attribute-definitions AttributeName=LockID,AttributeType=S \
      --key-schema AttributeName=LockID,KeyType=HASH \
      --billing-mode PAY_PER_REQUEST \
      --region ap-south-2
    
    echo -e "${GREEN}✓ DynamoDB table created${NC}"
fi
echo ""

# Check if terraform.tfvars exists
if [ ! -f "terraform.tfvars" ]; then
    echo -e "${YELLOW}Creating terraform.tfvars from example...${NC}"
    cp terraform.tfvars.example terraform.tfvars
    
    # Generate a random MongoDB password
    MONGO_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    
    # Update the file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/your-strong-password-here/$MONGO_PASS/" terraform.tfvars
    else
        # Linux
        sed -i "s/your-strong-password-here/$MONGO_PASS/" terraform.tfvars
    fi
    
    echo -e "${GREEN}✓ Created terraform.tfvars with random MongoDB password${NC}"
    echo -e "${YELLOW}⚠ Please review terraform.tfvars and update other values if needed${NC}"
    echo ""
    read -p "Press Enter to continue after reviewing terraform.tfvars..."
else
    echo -e "${GREEN}✓ terraform.tfvars already exists${NC}"
fi
echo ""

# Initialize Terraform
echo -e "${YELLOW}Initializing Terraform...${NC}"
terraform init
echo -e "${GREEN}✓ Terraform initialized${NC}"
echo ""

# Run terraform plan
echo -e "${YELLOW}Running Terraform plan...${NC}"
echo ""
terraform plan
echo ""

# Ask if user wants to apply
read -p "Do you want to apply this configuration? (yes/no): " APPLY
if [ "$APPLY" = "yes" ]; then
    echo -e "${YELLOW}Applying Terraform configuration...${NC}"
    terraform apply -auto-approve
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Important outputs:${NC}"
    echo ""
    
    # Save outputs to files
    terraform output elastic_ip > ../ELASTIC_IP.txt
    echo -e "Elastic IP: ${GREEN}$(cat ../ELASTIC_IP.txt)${NC}"
    
    terraform output ssh_connection_string > ../SSH_COMMAND.txt
    echo -e "SSH Command: ${GREEN}$(cat ../SSH_COMMAND.txt)${NC}"
    
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Wait 5-10 minutes for EC2 setup to complete"
    echo "2. SSH into instance: $(cat ../SSH_COMMAND.txt)"
    echo "3. Check setup: cat /var/log/user-data-complete"
    echo "4. Follow DEPLOYMENT_GUIDE.md for application setup"
    echo ""
    echo -e "${YELLOW}Files created:${NC}"
    echo "  - movie-browser-ec2-key.pem (SSH key - keep secure!)"
    echo "  - ../ELASTIC_IP.txt (for DNS configuration)"
    echo "  - ../SSH_COMMAND.txt (for easy SSH access)"
    echo ""
else
    echo -e "${YELLOW}Skipping apply. Run 'terraform apply' when ready.${NC}"
fi

