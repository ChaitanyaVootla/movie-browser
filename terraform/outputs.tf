# EC2 Outputs
output "ec2_instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.main.id
}

output "ec2_instance_public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_instance.main.public_ip
}

output "elastic_ip" {
  description = "Elastic IP address (use this for DNS configuration)"
  value       = aws_eip.main.public_ip
}

output "ec2_instance_private_ip" {
  description = "Private IP address of the EC2 instance"
  value       = aws_instance.main.private_ip
}

output "ssh_connection_string" {
  description = "SSH connection string"
  value       = "ssh -i ${var.key_name}.pem ubuntu@${aws_eip.main.public_ip}"
}

# PostgreSQL Connection Outputs
output "postgres_connection_string" {
  description = "PostgreSQL connection string (from EC2 instance)"
  value       = "postgresql://moviebrowser:${var.postgres_password}@localhost:5433/moviebrowser?schema=public"
  sensitive   = true
}

# Lambda Outputs
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

output "s3_lambda_deployment_bucket" {
  description = "S3 bucket name where Lambda deployment packages are stored"
  value       = aws_s3_bucket.lambda_deployments.id
}

# Security Group Output
output "security_group_id" {
  description = "ID of the security group"
  value       = aws_security_group.main.id
}

# IAM Role Outputs
output "ec2_iam_role_arn" {
  description = "ARN of the EC2 IAM role (has Bedrock, Lambda, S3, CloudWatch permissions)"
  value       = aws_iam_role.ec2_role.arn
}

# Setup Instructions
output "next_steps" {
  description = "Next steps after Terraform apply"
  value = <<-EOT

    ========================================
    Movie Browser — Beta EC2 Setup
    ========================================

    1. SSH into the instance:
       ${join(" ", ["ssh", "-i", "${var.key_name}.pem", "ubuntu@${aws_eip.main.public_ip}"])}

    2. Verify setup completion:
       cat /var/log/user-data-complete

    3. DNS: beta.themoviebrowser.com A -> ${aws_eip.main.public_ip}

    4. GitHub: Create 'beta' environment with secrets:
       NEXT_EC2_SSH_PRIVATE_KEY, NEXT_EC2_HOST=${aws_eip.main.public_ip},
       NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_SITE_URL=https://beta.themoviebrowser.com

    5. SSH in and create .env.local (from template.env):
       - Set MONGO_IP to old EC2 IP for remote MongoDB
       - Set POSTGRES_PASSWORD to match terraform.tfvars
       - Omit AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (instance profile)

    6. Push to 'next' branch -> GitHub Actions deploys automatically
       (starts PG + ClickHouse + Caddy, applies Prisma schema, starts PM2)

    7. Apply search indexes (one-time, after first deploy):
       docker exec -i movie-browser-postgres psql -U moviebrowser -d moviebrowser \
         < postgres/init/02-search-indexes.sql

    8. Google OAuth: Add redirect URI:
       https://beta.themoviebrowser.com/api/auth/callback/google

    Local PostgreSQL access (SSH tunnel):
       ssh -i ${var.key_name}.pem -L 5433:localhost:5433 ubuntu@${aws_eip.main.public_ip} -N
       Then locally: DATABASE_URL=postgresql://moviebrowser:PASS@localhost:5433/moviebrowser
       Works with: yarn db:studio, yarn db:push, prisma CLI

    IAM Permissions:
    - Bedrock: InvokeModel (Kimi K2.5, Cohere Embed v4)
    - Lambda: InvokeFunction (movie-ratings-scraper)
    - S3: Get/Put/List (migration buckets)
    - CloudWatch: Agent server policy

    MongoDB: NOT local. Set MONGO_IP in .env.local to
    the old EC2 IP for temporary remote access.

    ========================================
  EOT
}
