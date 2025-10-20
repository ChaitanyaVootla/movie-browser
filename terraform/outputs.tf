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

output "ssh_key_path" {
  description = "Path to the SSH private key"
  value       = "${path.module}/${var.key_name}.pem"
}

# MongoDB Connection Outputs
output "mongodb_connection_string" {
  description = "MongoDB connection string (from local machine)"
  value       = "mongodb://root:${var.mongodb_root_password}@${aws_eip.main.public_ip}:${var.mongodb_port}"
  sensitive   = true
}

output "mongodb_connection_string_internal" {
  description = "MongoDB connection string (from EC2 instance)"
  value       = "mongodb://root:${var.mongodb_root_password}@localhost:${var.mongodb_port}"
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
  description = "ARN of the EC2 IAM role"
  value       = aws_iam_role.ec2_role.arn
}

# Quick Setup Instructions
output "next_steps" {
  description = "Next steps after Terraform apply"
  value = <<-EOT
    
    ========================================
    AWS EC2 Migration - Next Steps
    ========================================
    
    1. SSH into the instance:
       ${join(" ", ["ssh", "-i", "${var.key_name}.pem", "ubuntu@${aws_eip.main.public_ip}"])}
    
    2. Verify setup completion:
       cat /var/log/user-data.log
       cat /var/log/user-data-complete
    
    3. Clone repository:
       cd /home/ubuntu
       git clone <your-repo-url> movie-browser
       cd movie-browser
    
    4. Create .env file with configuration
    
    5. Install dependencies:
       npm install
    
    6. Build application:
       npm run build
    
    7. Setup VectorDB:
       cd VectorDB
       python3 -m venv vector
       source vector/bin/activate
       pip install -r requirements.txt
       deactivate
    
    8. Restore MongoDB data (run from local machine):
       ./scripts/restore-to-ec2.sh
    
    9. Start PM2 processes:
       pm2 start ecosystem.config.cjs
       pm2 save
    
    10. Update DNS records:
        themoviebrowser.com -> ${aws_eip.main.public_ip}
        api.themoviebrowser.com -> ${aws_eip.main.public_ip}
    
    ========================================
  EOT
}

