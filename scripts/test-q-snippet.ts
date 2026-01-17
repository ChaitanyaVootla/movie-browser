import { config } from "dotenv";
config({ path: ".env.local" });

// Test 1: Raw Bedrock SDK
import {
  BedrockRuntimeClient,
  ConversationRole,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Test 2: LangChain ChatBedrockConverse
import { ChatBedrockConverse } from "@langchain/aws";
import { HumanMessage } from "@langchain/core/messages";

const modelId = "global.anthropic.claude-haiku-4-5-20251001-v1:0";
const region = process.env.BEDROCK_REGION || "ap-south-1";

async function testRawSDK() {
  console.log("\n=== RAW BEDROCK SDK ===\n");

  const client = new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const response = await client.send(
    new ConverseCommand({
      modelId,
      messages: [
        {
          content: [{ text: "say hi" }],
          role: ConversationRole.USER,
        },
      ],
      inferenceConfig: { maxTokens: 500, temperature: 0.5 },
    })
  );

  const content = response.output?.message?.content;
  const textBlock = content?.find((block: any) => "text" in block);
  console.log("Response:", textBlock?.text);
}

async function testLangChain() {
  console.log("\n=== LANGCHAIN ChatBedrockConverse ===\n");

  const model = new ChatBedrockConverse({
    model: modelId,
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    maxTokens: 500,
    temperature: 0.5,
  });

  const response = await model.invoke([new HumanMessage("say hi")]);

  console.log("Response type:", typeof response.content);
  console.log("Response content:", JSON.stringify(response.content, null, 2));

  // Check if it's an array (reasoning model) or string
  if (typeof response.content === "string") {
    console.log("\n✅ LangChain returns STRING - no changes needed");
  } else if (Array.isArray(response.content)) {
    console.log("\n⚠️  LangChain returns ARRAY - need to extract text");
    const textBlock = response.content.find(
      (block: any) => typeof block === "string" || block.type === "text" || "text" in block
    );
    console.log("Extracted text:", textBlock);
  }
}

async function main() {
  try {
    await testRawSDK();
    await testLangChain();
  } catch (error: any) {
    console.error(`ERROR: ${error.message}`);
    throw error;
  }
}

main();
