/**
 * Example demonstrating a Twitter bot using the Daydreams package.
 * This bot can:
 * - Monitor Twitter mentions and auto-reply
 * - Generate autonomous thoughts and tweet them
 * - Maintain conversation memory using ChromaDB
 * - Process inputs through a character-based personality
 */

import { Orchestrator } from "../packages/core/src/core/orchestrator";
import { TwitterClient } from "../packages/core/src/io/twitter";
import { RoomManager } from "../packages/core/src/core/room-manager";
import { ChromaVectorDB } from "../packages/core/src/core/vector-db";
import { Processor } from "../packages/core/src/core/processor";
import { LLMClient } from "../packages/core/src/core/llm-client";
import { env } from "../packages/core/src/core/env";
import { LogLevel } from "../packages/core/src/types";
import chalk from "chalk";
import { defaultCharacter } from "../packages/core/src/core/character";
import { Consciousness } from "../packages/core/src/core/consciousness";
import { z } from "zod";

async function main() {
  const loglevel = LogLevel.INFO;
  // Initialize core dependencies
  const vectorDb = new ChromaVectorDB("twitter_agent", {
    chromaUrl: "http://localhost:8000",
    logLevel: loglevel,
  });

  await vectorDb.purge(); // Clear previous session data

  const roomManager = new RoomManager(vectorDb);

  const llmClient = new LLMClient({
    model: "anthropic/claude-3-5-sonnet-latest", // Using a known supported model
    temperature: 0.3,
  });

  // Initialize processor with default character personality
  const processor = new Processor(
    vectorDb,
    llmClient,
    defaultCharacter,
    loglevel
  );

  // Initialize core system
  const core = new Orchestrator(roomManager, vectorDb, processor, {
    level: loglevel,
    enableColors: true,
    enableTimestamp: true,
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
  core.registerIOHandler({
    name: "twitter_mentions",
    role: "input",
    handler: async () => {
      console.log(chalk.blue("🔍 Checking Twitter mentions..."));
      // Create a static mentions input handler
      const mentionsInput = twitter.createMentionsInput(60000);
      const mentions = await mentionsInput.handler();

      // If no new mentions, return null to skip processing
      if (!mentions || mentions.length === 0) {
        return null;
      }

      return mentions;
    },
    schema: z.object({
      type: z.string(),
      content: z.string(),
      metadata: z.record(z.any()),
    }),
    interval: 60000, // Check mentions every minute
  });

  // Register input handler for autonomous thoughts
  core.registerIOHandler({
    name: "consciousness_thoughts",
    role: "input",
    handler: async () => {
      console.log(chalk.blue("🧠 Generating thoughts..."));
      const thought = await consciousness.start();

      // If no thought was generated or it was already processed, skip
      if (!thought || !thought.content) {
        return null;
      }

      return thought;
    },
    schema: z.object({
      type: z.string(),
      content: z.string(),
      metadata: z.record(z.any()),
    }),
    interval: 300000, // Generate thoughts every 5 minutes
  });

  // Register output handler for posting thoughts to Twitter
  core.registerIOHandler({
    name: "twitter_thought",
    role: "output",
    handler: async (data: unknown) => {
      const thoughtData = data as { content: string };

      return twitter.createTweetOutput().handler({
        content: thoughtData.content,
      });
    },
    schema: z
      .object({
        content: z
          .string()
          .regex(/^[\x20-\x7E]*$/, "No emojis or non-ASCII characters allowed"),
      })
      .describe(
        "This is the content of the tweet you are posting. It should be a string of text that is 280 characters or less. Use this to post a tweet on the timeline."
      ),
  });

  // Register output handler for Twitter replies
  core.registerIOHandler({
    name: "twitter_reply",
    role: "output",
    handler: async (data: unknown) => {
      const tweetData = data as { content: string; inReplyTo: string };

      return twitter.createTweetOutput().handler(tweetData);
    },
    schema: z
      .object({
        content: z.string(),
        inReplyTo: z
          .string()
          .optional()
          .describe("The tweet ID to reply to, if any"),
      })
      .describe(
        "If you have been tagged or mentioned in the tweet, use this. This is for replying to tweets."
      ),
  });

  // Start monitoring
  console.log(chalk.cyan("🤖 Bot is now running and monitoring Twitter..."));
  console.log(chalk.cyan("Press Ctrl+C to stop"));

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log(chalk.yellow("\n\nShutting down..."));

    // Clean up resources
    await consciousness.stop();
    core.removeIOHandler("twitter_mentions");
    core.removeIOHandler("consciousness_thoughts");
    core.removeIOHandler("twitter_reply");
    core.removeIOHandler("twitter_thought");

    console.log(chalk.green("✅ Shutdown complete"));
    process.exit(0);
  });
}

// Run the example
main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
