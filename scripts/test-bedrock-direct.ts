#!/usr/bin/env npx tsx
/**
 * Minimal Bedrock Test - Direct LLM call without LangChain
 * Tests if Bedrock itself is responding
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Load env
config({ path: resolve(process.cwd(), ".env.local") });

// Test Kimi K2 - try ap-southeast-1
const MODEL_ID = "moonshot.kimi-k2-thinking";
const REGION = "ap-southeast-1";

console.log("🧪 Minimal Bedrock Test");
console.log("========================");
console.log(`Model: ${MODEL_ID}`);
console.log(`Region: ${REGION}`);
console.log("");

async function testBedrockDirect() {
  const client = new BedrockRuntimeClient({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    // Add timeout - shorter for faster feedback
    requestHandler: {
      requestTimeout: 15000, // 15 second timeout
    },
  });

  const startTime = Date.now();
  console.log("⏳ Sending request to Bedrock (15s timeout)...");
  
  // Log every 5 seconds
  const interval = setInterval(() => {
    console.log(`   ... still waiting (${Math.round((Date.now() - startTime) / 1000)}s)`);
  }, 5000);

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "Say hello in one word." }],
        },
      ],
      inferenceConfig: {
        maxTokens: 50,
        temperature: 0.7,
      },
    });

    const response = await client.send(command);
    clearInterval(interval);
    const elapsed = Date.now() - startTime;

    console.log(`✅ Response received in ${elapsed}ms`);
    console.log("");
    console.log("Response:");
    console.log(JSON.stringify(response.output, null, 2));
    console.log("");
    console.log("Usage:", response.usage);
    console.log("Stop reason:", response.stopReason);
  } catch (error) {
    clearInterval(interval);
    const elapsed = Date.now() - startTime;
    console.log(`❌ Error after ${elapsed}ms`);
    console.error(error);
  }
}

async function testWithLangChain() {
  console.log("\n" + "=".repeat(50));
  console.log("🔗 Testing with LangChain ChatBedrockConverse...");
  console.log("=".repeat(50) + "\n");

  const { ChatBedrockConverse } = await import("@langchain/aws");

  const model = new ChatBedrockConverse({
    model: MODEL_ID,
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    maxTokens: 50,
    temperature: 0.7,
  });

  const startTime = Date.now();
  console.log("⏳ Sending request via LangChain...");

  try {
    const response = await model.invoke("Say hello in one word.");
    const elapsed = Date.now() - startTime;

    console.log(`✅ Response received in ${elapsed}ms`);
    console.log("");
    console.log("Content:", response.content);
    console.log("Usage metadata:", response.usage_metadata);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`❌ Error after ${elapsed}ms`);
    console.error(error);
  }
}

async function testWithTools() {
  console.log("\n" + "=".repeat(50));
  console.log("🔧 Testing with Tools bound...");
  console.log("=".repeat(50) + "\n");

  const { ChatBedrockConverse } = await import("@langchain/aws");
  const { tool } = await import("@langchain/core/tools");
  const { z } = await import("zod");

  // Simple test tool
  const testTool = tool(
    async ({ query }: { query: string }) => {
      return `Search results for: ${query}`;
    },
    {
      name: "search",
      description: "Search for movies",
      schema: z.object({
        query: z.string().describe("The search query"),
      }),
    }
  );

  const model = new ChatBedrockConverse({
    model: MODEL_ID,
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    maxTokens: 200,
    temperature: 0.7,
  });

  const modelWithTools = model.bindTools([testTool]);

  const startTime = Date.now();
  console.log("⏳ Sending request with tools...");

  try {
    const response = await modelWithTools.invoke("Search for action movies");
    const elapsed = Date.now() - startTime;

    console.log(`✅ Response received in ${elapsed}ms`);
    console.log("");
    console.log("Content:", response.content);
    console.log("Tool calls:", response.tool_calls);
    console.log("Usage metadata:", response.usage_metadata);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`❌ Error after ${elapsed}ms`);
    console.error(error);
  }
}

async function main() {
  // Test 1: Direct AWS SDK
  await testBedrockDirect();

  // Test 2: LangChain without tools
  await testWithLangChain();

  // Test 3: LangChain with tools
  await testWithTools();

  console.log("\n✨ All tests complete!");
}

main().catch(console.error);

