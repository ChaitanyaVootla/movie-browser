# 🛡️ Residential Proxy Configuration Guide

## Why Residential Proxies Are Critical

Google's 2024/2025 anti-bot detection includes:
- **IP Reputation Scoring**: Data center IPs are heavily flagged
- **Behavioral Analysis**: Residential IPs have more realistic usage patterns
- **Geolocation Consistency**: Residential proxies provide consistent geo-location data

## Recommended Proxy Providers

### **Tier 1 (Premium - Best Success Rates)**
1. **Bright Data** (formerly Luminati)
   - Largest residential network (72M+ IPs)
   - Success rate: ~85-95%
   - Cost: $500-1000/month for adequate volume

2. **Oxylabs**
   - High-quality residential IPs
   - Success rate: ~80-90%
   - Cost: $300-800/month

### **Tier 2 (Good Value)**
3. **Smartproxy**
   - Good balance of price/performance
   - Success rate: ~70-85%
   - Cost: $75-300/month

4. **ProxyMesh**
   - Rotating residential IPs
   - Success rate: ~65-80%
   - Cost: $50-200/month

## Integration Example

```typescript
// Configure proxies in your Lambda environment variables
const proxyList = [
    {
        host: 'residential-proxy1.provider.com',
        port: 8000,
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD
    },
    {
        host: 'residential-proxy2.provider.com', 
        port: 8001,
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD
    }
    // Add more proxy endpoints
];

// Use with GoogleScraperService
const scraper = new GoogleScraperService(proxyList);
await scraper.initialize();
const result = await scraper.scrape(searchString);
```

## AWS Lambda Environment Variables

Set these in your Lambda function:

```bash
PROXY_USERNAME=your_proxy_username
PROXY_PASSWORD=your_proxy_password
PROXY_ENDPOINT_1=residential-proxy1.provider.com:8000
PROXY_ENDPOINT_2=residential-proxy2.provider.com:8001
# Add more as needed
```

## Expected Improvement Rates

| Current Setup | With Residential Proxies | Expected Success Rate |
|---------------|--------------------------|----------------------|
| AWS Lambda IP | Premium Residential | 15% → 85%+ |
| AWS Lambda IP | Good Residential | 15% → 70%+ |
| AWS Lambda IP | Budget Residential | 15% → 50%+ |

## Cost-Benefit Analysis

**Current Status**: ~15% success rate, frequent bot detection
**With $200/month proxies**: ~70% success rate, minimal detection
**ROI**: If processing 1000+ requests/month, proxies pay for themselves

## Alternative Solutions

### **Free/Budget Options** (Lower success rates)
1. **Free proxy lists**: 10-30% success rate, unstable
2. **VPN services**: 20-40% success rate, limited IPs
3. **SOCKS5 proxies**: 30-50% success rate, medium cost

### **Advanced Techniques** (Combined with proxies)
1. **Session persistence**: Maintain browser sessions across requests
2. **Request timing**: Space out requests over time
3. **Browser pool**: Use multiple browser instances
4. **CAPTCHA solving**: Services like 2captcha, Anti-Captcha

## Implementation Priority

1. **Immediate**: Implement stealth plugin ✅ (Done)
2. **High Priority**: Add residential proxy rotation
3. **Medium**: Implement session management
4. **Advanced**: Add CAPTCHA solving integration

## Monitoring Success Rates

Track these metrics:
- Bot detection rate
- Successful data extractions
- Response times
- Proxy rotation effectiveness

Set up CloudWatch alerts for detection rate spikes.
