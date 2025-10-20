# AWS Region
variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-2"
}

# EC2 Instance Configuration
variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.medium"
}

variable "root_volume_size" {
  description = "Size of the root EBS volume in GB"
  type        = number
  default     = 60
}

# MongoDB Configuration
variable "mongodb_root_password" {
  description = "MongoDB root password"
  type        = string
  sensitive   = true
}

variable "mongodb_port" {
  description = "MongoDB port"
  type        = number
  default     = 27018
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

# Lambda Configuration (moved from lambda/terraform.tf)
variable "lambda_function_name" {
  description = "Name of the Lambda function"
  type        = string
  default     = "movie-ratings-scraper"
}

