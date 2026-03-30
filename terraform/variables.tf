# AWS Region
variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-2"
}

# EC2 Instance Configuration
variable "instance_type" {
  description = "EC2 instance type. t4g.large (8GB) minimum for PG+ClickHouse+Next.js. Use t4g.xlarge (16GB) during bulk population."
  type        = string
  default     = "t4g.large"
}

variable "root_volume_size" {
  description = "Size of the root EBS volume in GB. 80GB supports ~1M movies in PostgreSQL with embeddings."
  type        = number
  default     = 80
}

# PostgreSQL Configuration
variable "postgres_password" {
  description = "PostgreSQL password for the moviebrowser user"
  type        = string
  sensitive   = true
}

# ClickHouse Configuration
variable "clickhouse_password" {
  description = "ClickHouse analytics database password"
  type        = string
  sensitive   = true
  default     = "analytics_secret_123"
}

# Project Configuration
variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "movie-browser"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "production"
}

# SSH Key Configuration
variable "key_name" {
  description = "Name of the SSH key pair"
  type        = string
  default     = "movie-browser-ec2-key"
}

# Lambda Configuration
variable "lambda_function_name" {
  description = "Name of the Lambda function"
  type        = string
  default     = "movie-ratings-scraper"
}
