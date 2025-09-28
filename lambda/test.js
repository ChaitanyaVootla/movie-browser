// AWS Lambda Invocation Test Script
// Tests the deployed lambda function directly via AWS SDK (platform-independent)

const AWS = require('aws-sdk');

// Test payloads for comprehensive testing
const testCases = [
    // {
    //     name: "Fast Scraper Test - Peacemaker (5-8 sec)",
    //     payload: {
    //         queryStringParameters: {
    //             searchString: "Peacemaker tv series",
    //             imdbId: "tt13146488",
    //             wikidataId: "Q101089777",
    //             mediaType: "tv",
    //             scraperMode: "fast"
    //         }
    //     }
    // },
    {
        name: "superman",
        payload: {
            queryStringParameters: {
                searchString: "superman",
                imdbId: "tt5950044",
                wikidataId: "Q116547790",
                mediaType: "movie",
            }
        }
    },
    // {
    //     name: "Complex Scraper Test - Shawshank (Full Stealth)",
    //     payload: {
    //         queryStringParameters: {
    //             searchString: "The Shawshank Redemption",
    //             imdbId: "tt0111161",
    //             wikidataId: "Q172241",
    //             mediaType: "movie",
    //             scraperMode: "complex"
    //         }
    //     }
    // }
];

const FUNCTION_NAME = "movie-ratings-scraper";
const REGION = "ap-south-2";

// Configure AWS SDK
AWS.config.update({ region: REGION });
const lambda = new AWS.Lambda();

async function invokeFunction(testCase) {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log('📤 Input:', JSON.stringify(testCase.payload.queryStringParameters, null, 2));
    
    try {
        console.log('⏳ Invoking lambda function...');
        const startTime = Date.now();
        
        // Invoke lambda function using AWS SDK
        const params = {
            FunctionName: FUNCTION_NAME,
            Payload: JSON.stringify(testCase.payload)
        };
        
        const result = await lambda.invoke(params).promise();
        const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log(`📡 Lambda Status: ${result.StatusCode}`);
        console.log(`⏱️ Execution Time: ${executionTime}s`);
        
        // Parse response
        const response = JSON.parse(result.Payload);
        
        if (response.statusCode === 200) {
            const body = JSON.parse(response.body);
            console.log('✅ Success Response:');
            console.log('📊 Summary:');
            console.log('  - Ratings found:', body.ratings?.length || 0);
            console.log('  - Watch options found:', body.allWatchOptions?.length || 0);
            console.log('  - IMDb ID:', body.imdbId || 'Not found');
            console.log('  - Director:', body.directorName || 'Not found');
            console.log('  - External IDs:', Object.keys(body.externalIds || {}).length, 'found');
            console.log('  - Detailed IMDb rating:', body.detailedRatings?.imdb?.rating || 'Not found');
            console.log('  - Detailed RT critic score:', body.detailedRatings?.rottenTomatoes?.critic?.score || 'Not found');
            console.log('  - Google error:', body.googleError || 'None');
            console.log('  - Scraper mode:', testCase.payload.queryStringParameters.scraperMode || 'fast (default)');
            
            if (body.ratings?.length > 0) {
                console.log('🏆 Ratings Details:');
                body.ratings.forEach(rating => {
                    console.log(`  - ${rating.name}: ${rating.rating}`);
                });
            }
            
            if (Object.keys(body.externalIds || {}).length > 0) {
                console.log('🔗 External IDs:');
                Object.entries(body.externalIds).forEach(([key, value]) => {
                    console.log(`  - ${key}: ${value}`);
                });
            }
            
            console.log('\n📝 Full Response:');
            console.log(JSON.stringify(body, null, 2));
            
        } else {
            console.log('❌ Error Response:');
            console.log('Status Code:', response.statusCode);
            console.log('Body:', response.body);
        }
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}


async function main() {
    console.log('🚀 AWS Lambda Movie Ratings Scraper Test Suite');
    console.log('==============================================');
    console.log(`Function: ${FUNCTION_NAME}`);
    console.log(`Region: ${REGION}`);
    
    // Check if function exists using AWS SDK
    try {
        const params = { FunctionName: FUNCTION_NAME };
        await lambda.getFunction(params).promise();
        console.log('✅ Lambda function found and accessible');
    } catch (error) {
        console.error(`❌ Lambda function '${FUNCTION_NAME}' not found or not accessible`);
        console.error('Make sure the function is deployed and you have the correct AWS credentials.');
        console.error('Error details:', error.message);
        process.exit(1);
    }
    
    // Run all test cases
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Running Test ${i + 1}/${testCases.length}: ${testCase.name}`);
        
        await invokeFunction(testCase);
        
        if (i < testCases.length - 1) {
            console.log('\n⏱️ Waiting 2 seconds before next test...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ All tests completed!');
    console.log('\n💡 Tips:');
    console.log('- Check CloudWatch logs at: /aws/lambda/movie-ratings-scraper');
    console.log('- Monitor function metrics in AWS Lambda console');
    console.log('- Update test case payload for different scenarios');
    console.log('- Test runs using pure Node.js AWS SDK (platform-independent)');
}

// Run the tests
main().catch(error => {
    console.error('💥 Test suite failed:', error.message);
    process.exit(1);
});

