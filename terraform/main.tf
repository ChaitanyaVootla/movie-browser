# Terraform Configuration
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Provider Configuration
provider "aws" {
  region = var.aws_region
}

# Data source for Ubuntu 24.04 LTS ARM64 AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

# SSH Key — reuse existing key pair already in AWS
# The .pem file is already on your local machine from the original Terraform run.
data "aws_key_pair" "existing" {
  key_name = var.key_name
}

# Security Group
resource "aws_security_group" "main" {
  name        = "${var.project_name}-sg"
  description = "Security group for ${var.project_name} EC2 instance"

  tags = {
    Name        = "${var.project_name}-sg"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# SSH Access (port 22)
resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.main.id
  description       = "SSH access from anywhere"

  from_port   = 22
  to_port     = 22
  ip_protocol = "tcp"
  cidr_ipv4   = "0.0.0.0/0"

  tags = {
    Name = "ssh-ingress"
  }
}

# HTTP Access (port 80)
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.main.id
  description       = "HTTP access from anywhere"

  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
  cidr_ipv4   = "0.0.0.0/0"

  tags = {
    Name = "http-ingress"
  }
}

# HTTPS Access (port 443)
resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.main.id
  description       = "HTTPS access from anywhere"

  from_port   = 443
  to_port     = 443
  ip_protocol = "tcp"
  cidr_ipv4   = "0.0.0.0/0"

  tags = {
    Name = "https-ingress"
  }
}

# Next.js Application (port 3002)
resource "aws_vpc_security_group_ingress_rule" "nextjs" {
  security_group_id = aws_security_group.main.id
  description       = "Next.js application access"

  from_port   = 3002
  to_port     = 3002
  ip_protocol = "tcp"
  cidr_ipv4   = "0.0.0.0/0"

  tags = {
    Name = "nextjs-ingress"
  }
}

# Egress rule - Allow all outbound traffic
# Required for: TMDB API, Bedrock, remote MongoDB, npm, Docker Hub, etc.
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.main.id
  description       = "Allow all outbound traffic"

  ip_protocol = "-1"
  cidr_ipv4   = "0.0.0.0/0"

  tags = {
    Name = "all-egress"
  }
}

# =============================================================================
# IAM Role for EC2
# =============================================================================

resource "aws_iam_role" "ec2_role" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-ec2-role"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# IAM Policy: Bedrock — AI Agent (Kimi K2.5) + Embeddings (Cohere Embed v4)
# CloudFront invalidation — the deploy purges edge HTML (/*) after each build so
# cached pages don't reference stale server-action IDs / RSC routes (Jun 11). The
# deploy runs on the box, so the instance profile needs this.
resource "aws_iam_role_policy" "cloudfront_invalidate" {
  name = "${var.project_name}-cloudfront-invalidate"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "CreateInvalidations"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = "arn:aws:cloudfront::620733889764:distribution/E12R1ZNQNG3LK5"
      }
    ]
  })
}

resource "aws_iam_role_policy" "bedrock_invoke" {
  name = "${var.project_name}-bedrock-invoke"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockInvokeModels"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          # Kimi K2.5 in ap-south-1
          "arn:aws:bedrock:ap-south-1::foundation-model/moonshotai.kimi-k2.5",
          # Cohere Embed v4 — global cross-region inference profile
          "arn:aws:bedrock:*::foundation-model/cohere.embed-v4*",
          # Cross-region inference profiles (used by global.cohere.embed-v4:0)
          "arn:aws:bedrock:*:*:inference-profile/*"
        ]
      }
    ]
  })
}

# IAM Policy: Lambda invocation (movie-ratings-scraper)
resource "aws_iam_role_policy" "lambda_invoke" {
  name = "${var.project_name}-lambda-invoke"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
              "arn:aws:lambda:${var.aws_region}:*:function:${var.lambda_function_name}",
              "arn:aws:lambda:${var.aws_region}:*:function:puppeteer-node14"
            ]
      }
    ]
  })
}

# IAM Policy: CloudWatch Logs
resource "aws_iam_role_policy_attachment" "cloudwatch_logs" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# IAM Policy: S3 access (for backups)
resource "aws_iam_role_policy" "s3_backup_access" {
  name = "${var.project_name}-s3-backup"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::movie-browser-migration-*",
          "arn:aws:s3:::movie-browser-migration-*/*"
        ]
      }
    ]
  })
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2_role.name

  tags = {
    Name        = "${var.project_name}-ec2-profile"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# =============================================================================
# EC2 Instance
# =============================================================================

resource "aws_instance" "main" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name              = data.aws_key_pair.existing.key_name
  vpc_security_group_ids = [aws_security_group.main.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  root_block_device {
    volume_size           = var.root_volume_size
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true

    tags = {
      Name        = "${var.project_name}-root-volume"
      Environment = var.environment
      ManagedBy   = "Terraform"
      # Targeted by the DLM daily-snapshot policy (added manually post-GA; declared
      # here so `terraform plan` stops trying to remove it — see drift audit Jun 11).
      Backup = "daily"
    }
  }

  user_data = templatefile("${path.module}/user-data.sh", {
    postgres_password    = var.postgres_password
    clickhouse_password  = var.clickhouse_password
    project_name         = var.project_name
  })

  # Basic monitoring (free) — detailed monitoring adds $3.50/mo for 1-min intervals
  # Enable if you need sub-5-min CloudWatch metrics: monitoring = true
  monitoring = false

  tags = {
    Name        = "${var.project_name}-ec2"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Application = "movie-browser"
  }

  lifecycle {
    # ami: the data source uses most_recent=true, so a new Canonical Ubuntu
    # image makes TF want to REPLACE the live prod box (Jun 11 drift audit:
    # `terraform plan` showed "aws_instance.main must be replaced" → would
    # destroy Postgres/ClickHouse/ISR cache). Pin to the running AMI by
    # ignoring ami drift; a deliberate rebuild removes this line + taints.
    # prevent_destroy: hard seatbelt — apply ERRORS rather than ever destroying
    # this instance (termination protection is the AWS-side equivalent).
    ignore_changes  = [user_data, ami]
    prevent_destroy = true
  }
}

# Elastic IP
resource "aws_eip" "main" {
  instance = aws_instance.main.id
  domain   = "vpc"

  tags = {
    Name        = "${var.project_name}-eip"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  depends_on = [aws_instance.main]
}
