# Movie Ratings Lambda

A robust AWS Lambda function that scrapes movie ratings and watch links from multiple sources including Google search panels, IMDb, Rotten Tomatoes, and Wikidata.

## Features

- **Multi-source scraping**: Google search panel, IMDb, Rotten Tomatoes, Wikidata
- **Media type support**: Automatically handles movies (`/m/`) and TV series (`/tv/`) URLs for Rotten Tomatoes
- **Parallel processing**: All sources are scraped concurrently for optimal performance
- **Robust error handling**: Partial failures don't break the entire request
- **Backward compatibility**: Maintains the same response format as the existing lambda
- **Enhanced data**: Provides detailed ratings with certified fresh status, sentiment, consensus, etc.
- **External IDs**: Returns comprehensive external platform identifiers from Wikidata

## Architecture

```
Input: { wikidataId?, tmdbId?, imdbId?, searchString, mediaType? }
    ↓
┌─────────────────────────────────────────────────────────┐
│                  Main Handler                            │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   Google    │  │  Wikidata   │  │    IMDb     │      │
│  │  Scraper    │  │   Service   │  │   Scraper   │      │
│  │             │  │             │  │             │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                          │
│  ┌─────────────┐                                        │
│  │   Rotten    │                                        │
│  │ Tomatoes    │                                        │
│  │  Scraper    │                                        │
│  └─────────────┘                                        │
└─────────────────────────────────────────────────────────┘
    ↓
Output: { ratings, allWatchOptions, externalIds, detailedRatings, ... }
```

## Response Structure

```json
{
  "ratings": [
    {"rating": "8.5", "name": "IMDb", "link": "..."},
    {"rating": "91%", "name": "Rotten Tomatoes", "link": "..."}
  ],
  "allWatchOptions": [
    {"link": "...", "name": "Netflix", "price": "Subscription"}
  ],
  "imdbId": "tt0111161",
  "directorName": "Frank Darabont",
  "externalIds": {
    "imdb_id": "tt0111161",
    "tmdb_id": "278",
    "rottentomatoes_id": "shawshank_redemption",
    "netflix_id": "70076096",
    "prime_id": "..."
  },
  "detailedRatings": {
    "imdb": {
      "rating": 9.3,
      "ratingCount": 2500000,
      "sourceUrl": "..."
    },
    "rottenTomatoes": {
      "critic": {
        "score": 91,
        "ratingCount": 80,
        "certified": true,
        "sentiment": "POSITIVE",
        "consensus": "An uplifting, beautifully crafted film..."
      },
      "audience": {
        "score": 98,
        "ratingCount": 2500000,
        "certified": true,
        "sentiment": "POSITIVE"
      },
      "sourceUrl": "..."
    }
  }
}
```

## Deployment

### Prerequisites

- Node.js 18+ 
- AWS CLI configured
- Terraform

### Deploy with Terraform

```bash
# 1. Install dependencies and build deployment package
npm install
npm run deploy

# 2. Deploy with Terraform
terraform init
terraform plan
terraform apply
```

### Build Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run package` - Create deployment zip (platform-independent)
- `npm run deploy` - Build + package in one command
- `npm run clean` - Remove dist folder
- `npm run test` - Run test script

### Configuration

The Lambda function will be deployed with:
- **Runtime**: Node.js 22.x
- **Handler**: `dist/index.handler`
- **Timeout**: 5 minutes
- **Memory**: 1024 MB
- **Layer**: Chromium layer for Puppeteer (`arn:aws:lambda:ap-south-2:620733889764:layer:chromium133:1`)

### Terraform Outputs

After deployment, Terraform will output:
- `lambda_function_name`: Name of the deployed function
- `lambda_function_arn`: ARN for direct invocation
- `lambda_invoke_arn`: Invoke ARN for application backend

### Why This Approach?

**Platform Independent**: The entire build and package process uses Node.js tools:
- ✅ No platform-specific commands (works on Windows, Linux, Mac)
- ✅ No external zip tools required
- ✅ All packaging logic in JavaScript code
- ✅ Consistent deployment packages across environments

**Terraform for Infrastructure**: Direct lambda invocation (no API Gateway) makes Terraform ideal for:
- Infrastructure as Code
- Consistent deployments  
- Integration with existing AWS infrastructure
- No additional deployment complexity

## Usage

### Input Parameters

- `searchString` (required): Search query for Google (e.g., "The Shawshank Redemption")
- `mediaType` (optional): Media type - either "movie" or "tv" (defaults to "movie")
- `wikidataId` (optional): Wikidata ID (e.g., "Q172241")
- `tmdbId` (optional): TMDB ID (e.g., "278")
- `imdbId` (optional): IMDb ID (e.g., "tt0111161")

### Example Requests

For a movie:
```bash
curl -X GET "https://YOUR_API_GATEWAY_URL/dev?searchString=The%20Shawshank%20Redemption&mediaType=movie&wikidataId=Q172241&imdbId=tt0111161"
```

For a TV series:
```bash
curl -X GET "https://YOUR_API_GATEWAY_URL/dev?searchString=Peacemaker%20tv%20series&mediaType=tv&wikidataId=Q101089777&imdbId=tt13146488"
```

### Testing Locally

```bash
# Build and test
npm run build
npm run test
```

## Dependencies

### Runtime Dependencies

- `chrome-aws-lambda`: Chromium for Google search scraping
- `cheerio`: HTML parsing for IMDb and Rotten Tomatoes
- `node-fetch`: HTTP requests
- `puppeteer-core`: Browser automation

### Required AWS Lambda Layer

- **Chromium Layer**: `arn:aws:lambda:ap-south-2:620733889764:layer:chromium133:1`
- **Runtime**: Node.js 22.x

## Configuration

### Environment Variables

- `LOG_LEVEL`: Logging verbosity (trace, debug, info, warn, error)
- `ENVIRONMENT`: Deployment environment (dev, staging, prod)

### Lambda Configuration

- **Timeout**: 300 seconds (5 minutes)
- **Memory**: 1024 MB
- **Runtime**: Node.js 22.x

## Error Handling

The lambda is designed to be resilient:

- **Partial failures**: If one source fails, others continue processing
- **Graceful degradation**: Returns available data even if some scrapers fail
- **Comprehensive logging**: Detailed logs for debugging issues
- **Timeout protection**: Each scraper has its own timeout limits

## Performance

- **Parallel execution**: All scrapers run concurrently
- **Optimized selectors**: Fast CSS and JSON-LD parsing
- **Minimal overhead**: Lightweight cheerio for HTML parsing
- **Smart caching**: Reuses extracted data across scrapers

## Monitoring

The lambda logs extensively to CloudWatch:

- Request/response details
- Scraper performance metrics
- Error details with stack traces
- Debug information for troubleshooting

## Maintenance

### Updating Selectors

If websites change their structure:

1. Update selectors in the respective scraper services
2. Test with various movie pages
3. Deploy updated code

### Adding New Sources

1. Create new scraper service in `services/`
2. Add to main handler parallel execution
3. Update response interfaces
4. Test and deploy

## Security

- No sensitive data stored
- Read-only operations on external sites
- Proper user agent rotation
- Rate limiting considerations built-in
