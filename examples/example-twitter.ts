/**
 * Example demonstrating a Twitter bot using the Daydreams package.
 * This bot can:
 * - Monitor Twitter mentions and auto-reply
 * - Generate autonomous thoughts and tweet them
 * - Maintain conversation memory using ChromaDB
 * - Process inputs through a character-based personality
 */

import { Core } from "../packages/core/src/core/core";
import { tweetSchema, TwitterClient } from "../packages/core/src/io/twitter";
import { RoomManager } from "../packages/core/src/core/room-manager";
import { ChromaVectorDB } from "../packages/core/src/core/vector-db";
import { Processor } from "../packages/core/src/core/processor";
import { LLMClient } from "../packages/core/src/core/llm-client";
import { env } from "../packages/core/src/core/env";
import { LogLevel } from "../packages/core/src/types";
import chalk from "chalk";
import { defaultCharacter } from "../packages/core/src/core/character";
import { JSONSchemaType } from "ajv";
import { Consciousness } from "../packages/core/src/core/consciousness";

async function main() {
  const loglevel = LogLevel.ERROR;
  // Initialize core dependencies
  const vectorDb = new ChromaVectorDB("twitter_agent", {
    chromaUrl: "http://localhost:8000",
    logLevel: loglevel,
  });

  await vectorDb.purge(); // Clear previous session data

  const roomManager = new RoomManager(vectorDb);

  const llmClient = new LLMClient({
    model: "deepseek/deepseek-r1", // High performance model
  });

  // Initialize processor with default character personality
  const processor = new Processor(
    vectorDb,
    llmClient,
    defaultCharacter,
    LogLevel.INFO
  );

  // Initialize core system
  const core = new Core(roomManager, vectorDb, processor, {
    logging: {
      level: loglevel,
      enableColors: true,
      enableTimestamp: true,
    },
  });

  // Set up Twitter client with credentials
  const twitter = new TwitterClient(
    {
      username: env.TWITTER_USERNAME,
      password: env.TWITTER_PASSWORD,
      email: env.TWITTER_EMAIL,
    },
    loglevel
  );

  // Initialize autonomous thought generation
  const consciousness = new Consciousness(llmClient, roomManager, {
    intervalMs: 300000, // Think every 5 minutes
    minConfidence: 0.7,
    logLevel: loglevel,
  });

  // Register input handler for Twitter mentions
  core.registerInput({
    name: "twitter_mentions",
    handler: async () => {
      console.log(chalk.blue("🔍 Checking Twitter mentions..."));
      const mentions = await twitter.createMentionsInput(60000).handler();
      return mentions; // Processor will analyze these and may generate replies
    },
    response: {
      type: "string",
      content: "string",
      metadata: "object",
    },
    interval: 60000, // Check mentions every minute
  });

  // Register input handler for autonomous thoughts
  core.registerInput({
    name: "consciousness_thoughts",
    handler: async () => {
      console.log(chalk.blue("🧠 Generating thoughts..."));
      const thought = await consciousness.start();
      return thought;
    },
    response: {
      type: "string",
      content: "string",
      metadata: "object",
    },
    interval: 300000, // Generate thoughts every 5 minutes
  });

  // Register output handler for posting thoughts to Twitter
  core.registerOutput({
    name: "twitter_thought",
    handler: async (data: unknown) => {
      const thoughtData = data as { content: string };
      return twitter.createTweetOutput().handler({
        content: thoughtData.content,
      });
    },
    response: {
      success: "boolean",
      tweetId: "string",
    },
    schema: {
      type: "object" as const,
      properties: {
        content: { type: "string" as const, nullable: false },
      },
      required: ["content"],
      additionalProperties: false,
    } as any,
  });

  // Register output handler for Twitter replies
  core.registerOutput({
    name: "twitter_reply",
    handler: async (data: unknown) => {
      const tweetData = data as { content: string; inReplyTo: string };
      return twitter.createTweetOutput().handler(tweetData);
    },
    response: {
      success: "boolean",
      tweetId: "string",
    },
    schema: {
      type: "object" as const,
      properties: {
        content: { type: "string" as const, nullable: false },
        inReplyTo: { type: "string" as const, nullable: false },
      },
      required: ["content", "inReplyTo"],
      additionalProperties: false,
    } as any,
  });

  // Start monitoring
  console.log(chalk.cyan("🤖 Bot is now running and monitoring Twitter..."));
  console.log(chalk.cyan("Press Ctrl+C to stop"));

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log(chalk.yellow("\n\nShutting down..."));

    // Clean up resources
    await consciousness.stop();
    core.removeInput("twitter_mentions");
    core.removeInput("consciousness_thoughts");
    core.removeOutput("twitter_reply");
    core.removeOutput("twitter_thought");

    console.log(chalk.green("✅ Shutdown complete"));
    process.exit(0);
  });
}

// Run the example
main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
