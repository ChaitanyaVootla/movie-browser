# Lambda Configuration
# Moved from lambda/terraform.tf and integrated with main infrastructure

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

  tags = {
    Name        = "${var.lambda_function_name}-execution-role"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Attach basic execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_execution_role.name
}

# S3 bucket for Lambda deployment packages
resource "aws_s3_bucket" "lambda_deployments" {
  bucket = "${var.lambda_function_name}-deployments"

  tags = {
    Name        = "${var.lambda_function_name}-deployments"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Upload deployment package to S3
resource "aws_s3_object" "lambda_deployment" {
  bucket = aws_s3_bucket.lambda_deployments.id
  key    = "lambda-deployment.zip" # Fixed name - overwrites on each deploy
  source = "${path.module}/../lambda/lambda-deployment.zip"
  etag   = filemd5("${path.module}/../lambda/lambda-deployment.zip")
}

# Lambda function using S3 source
resource "aws_lambda_function" "movie_ratings_scraper" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.id
  s3_key        = aws_s3_object.lambda_deployment.key
  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda_execution_role.arn
  handler       = "dist/index.handler"
  runtime       = "nodejs22.x"
  timeout       = 300  # 5 minutes (increased for scraping operations)
  memory_size   = 1024 # 1GB

  # Use the specified Chromium layer
  layers = [
    "arn:aws:lambda:${var.aws_region}:620733889764:layer:chromium133:1"
  ]

  environment {
    variables = {
      LOG_LEVEL   = "info"
      ENVIRONMENT = var.environment
    }
  }

  # Ensure deployment package is updated
  source_code_hash = filebase64sha256("${path.module}/../lambda/lambda-deployment.zip")

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_s3_object.lambda_deployment
  ]

  tags = {
    Name        = var.lambda_function_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# CloudWatch log group
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.movie_ratings_scraper.function_name}"
  retention_in_days = 7

  tags = {
    Name        = "${var.lambda_function_name}-logs"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

