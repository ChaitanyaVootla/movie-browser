# Terraform configuration for deploying the movie ratings lambda

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Variables
variable "lambda_function_name" {
  description = "Name of the Lambda function"
  type        = string
  default     = "movie-ratings-scraper"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-2"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

# Lambda execution role
resource "aws_iam_role" "lambda_execution_role" {
  name = "${var.lambda_function_name}-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# Attach basic execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_execution_role.name
}

# S3 bucket for Lambda deployment packages
resource "aws_s3_bucket" "lambda_deployments" {
  bucket = "${var.lambda_function_name}-deployments"
}

# Upload deployment package to S3
resource "aws_s3_object" "lambda_deployment" {
  bucket = aws_s3_bucket.lambda_deployments.id
  key    = "lambda-deployment.zip"  # Fixed name - overwrites on each deploy
  source = "lambda-deployment.zip"
  etag   = filemd5("lambda-deployment.zip")
}

# Lambda function using S3 source
resource "aws_lambda_function" "movie_ratings_scraper" {
  s3_bucket        = aws_s3_bucket.lambda_deployments.id
  s3_key          = aws_s3_object.lambda_deployment.key
  function_name    = var.lambda_function_name
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "dist/index.handler"
  runtime         = "nodejs22.x"
  timeout         = 300  # 5 minutes (increased for scraping operations)
  memory_size     = 1024 # 1GB

  # Use the specified Chromium layer
  layers = [
    "arn:aws:lambda:ap-south-2:620733889764:layer:chromium133:1"
  ]

  environment {
    variables = {
      LOG_LEVEL   = "info"
      ENVIRONMENT = var.environment
    }
  }

  # Ensure deployment package is updated
  source_code_hash = filebase64sha256("lambda-deployment.zip")

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_s3_object.lambda_deployment
  ]
}

# No API Gateway needed - Lambda will be called directly from application backend

# CloudWatch log group
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.movie_ratings_scraper.function_name}"
  retention_in_days = 7
}

# Outputs
output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.movie_ratings_scraper.function_name
}

output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.movie_ratings_scraper.arn
}

output "lambda_invoke_arn" {
  description = "Invoke ARN of the Lambda function (for direct invocation)"
  value       = aws_lambda_function.movie_ratings_scraper.invoke_arn
}

output "s3_deployment_bucket" {
  description = "S3 bucket name where Lambda deployment packages are stored"
  value       = aws_s3_bucket.lambda_deployments.id
}
