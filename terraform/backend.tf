# S3 Backend Configuration
# 
# Prerequisites (run once before terraform init):
# 
# 1. Create S3 bucket:
#    aws s3api create-bucket \
#      --bucket movie-browser-terraform-state \
#      --region ap-south-2 \
#      --create-bucket-configuration LocationConstraint=ap-south-2
# 
#    aws s3api put-bucket-versioning \
#      --bucket movie-browser-terraform-state \
#      --versioning-configuration Status=Enabled
# 
#    aws s3api put-bucket-encryption \
#      --bucket movie-browser-terraform-state \
#      --server-side-encryption-configuration '{
#        "Rules": [{
#          "ApplyServerSideEncryptionByDefault": {
#            "SSEAlgorithm": "AES256"
#          }
#        }]
#      }'
# 
# 2. Create DynamoDB table for state locking:
#    aws dynamodb create-table \
#      --table-name movie-browser-terraform-locks \
#      --attribute-definitions AttributeName=LockID,AttributeType=S \
#      --key-schema AttributeName=LockID,KeyType=HASH \
#      --billing-mode PAY_PER_REQUEST \
#      --region ap-south-2

terraform {
  backend "s3" {
    bucket         = "movie-browser-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "ap-south-2"
    encrypt        = true
    dynamodb_table = "movie-browser-terraform-locks"
  }
}

