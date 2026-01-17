/**
 * Ad-hoc script to test Amazon Nova 2 Lite access from ap-south-1
 * Using ConverseCommand API (recommended by Amazon Q)
 *
 * Run with: npx tsx scripts/test-nova-lite.ts
 */

import { config } from "dotenv";
import {
  BedrockRuntimeClient,
  ConversationRole,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Load env from .env.local
config({ path: ".env.local" });

// Models to test - raw IDs don't work from ap-south-1, need inference profiles
const MODELS_TO_TEST = [
  // Raw model IDs (won't work from ap-south-1)
  { id: "amazon.nova-lite-v1:0", name: "Nova Lite v1 (raw)" },
  { id: "amazon.nova-micro-v1:0", name: "Nova Micro v1 (raw)" },
  // APAC inference profiles (should work)
  { id: "apac.amazon.nova-lite-v1:0", name: "Nova Lite v1 (APAC)" },
  { id: "apac.amazon.nova-micro-v1:0", name: "Nova Micro v1 (APAC)" },
  { id: "apac.amazon.nova-pro-v1:0", name: "Nova Pro v1 (APAC)" },
];

const REGION = process.env.BEDROCK_REGION || "ap-south-1";

async function testModel(client: BedrockRuntimeClient, modelId: string, modelName: string) {
  const inputText = "What is 2+2? Answer in one word.";

  console.log(`\n📤 Testing: ${modelName}`);
  console.log(`   Model ID: ${modelId}`);

  try {
    const message = {
      content: [{ text: inputText }],
      role: ConversationRole.USER,
    };

    const request = {
      modelId,
      messages: [message],
      inferenceConfig: {
        maxTokens: 100,
        temperature: 0.5,
      },
    };

    const startTime = Date.now();
    const response = await client.send(new ConverseCommand(request));
    const latency = Date.now() - startTime;

    const outputText = response.output?.message?.content?.[0]?.text;

    console.log(`   ✅ SUCCESS! Latency: ${latency}ms`);
    if (outputText) {
      console.log(`   💬 Answer: ${outputText.trim()}`);
    }
    return true;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.log(`   ❌ FAILED: ${error.name}`);
      console.log(`      ${error.message.slice(0, 120)}...`);
    }
    return false;
  }
}

async function testNovaLite() {
  console.log("🔧 Testing Amazon Nova Lite models from ap-south-1");
  console.log(`   Region: ${REGION}`);
  console.log("");

  // Validate credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("❌ Missing AWS credentials in .env.local");
    console.error("   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
    process.exit(1);
  }

  console.log("✅ AWS credentials found");

  const client = new BedrockRuntimeClient({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const results: { model: string; success: boolean }[] = [];

  for (const model of MODELS_TO_TEST) {
    const success = await testModel(client, model.id, model.name);
    results.push({ model: model.id, success });
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));

  const working = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (working.length > 0) {
    console.log("\n✅ Working models:");
    working.forEach((r) => console.log(`   - ${r.model}`));
  }

  if (failed.length > 0) {
    console.log("\n❌ Failed models:");
    failed.forEach((r) => console.log(`   - ${r.model}`));
  }

  if (working.length === 0) {
    console.log("\n💡 Hint: Enable model access in AWS Bedrock console:");
    console.log("   1. Go to AWS Console > Amazon Bedrock > Model access");
    console.log("   2. Click 'Manage model access'");
    console.log("   3. Enable the Nova Lite models");
    console.log("   4. Wait for approval");
    process.exit(1);
  }
}

testNovaLite();
