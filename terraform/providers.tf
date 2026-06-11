# =============================================================================
# Provider aliases
# =============================================================================
# CloudFront-attached ACM certificates MUST live in us-east-1 regardless of
# where the rest of the stack runs (the origin EC2 is in ap-south-2). This
# aliased provider is used ONLY for the CloudFront cert + its DNS validation
# records' ACM resource — everything else uses the default ap-south-2 provider.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
