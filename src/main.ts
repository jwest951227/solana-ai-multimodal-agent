import { Core } from "./core/core";
import { ChromaVectorDB } from "./core/vectorDb";
import { EventProcessor } from "./core/processor";
import { RoomManager } from "./core/roomManager";
import { CoreActionRegistry } from "./core/actions";
import { LLMIntentExtractor } from "./core/intent";
import { TwitterClient } from "./clients/twitterClient";
import { env } from "./core/env";
import { LogLevel } from "./core/logger";
import { LLMClient } from "./core/llm-client";
import { defaultCharacter } from "./core/character";
import { Consciousness } from "./core/consciousness";
import { ChainOfThought } from "./core/chain-of-thought";
import {
  AVAILABLE_QUERIES,
  PROVIDER_EXAMPLES,
  WORLD_GUIDE,
} from "./core/contexts";

async function main() {
  // Initialize VectorDB first
  const vectorDb = new ChromaVectorDB("memories", {
    chromaUrl: "http://localhost:8000",
    logLevel: LogLevel.INFO,
  });

  // Initialize RoomManager with VectorDB
  const roomManager = new RoomManager(vectorDb, {
    logLevel: LogLevel.INFO,
  });

  const actionRegistry = new CoreActionRegistry();

  // Initialize LLM client
  const llmClient = new LLMClient({
    provider: "anthropic",
    apiKey: env.ANTHROPIC_API_KEY,
  });

  const dreams = new ChainOfThought(llmClient, {
    worldState: WORLD_GUIDE,
    queriesAvailable: AVAILABLE_QUERIES,
    availableActions: PROVIDER_EXAMPLES,
  });

  // Subscribe to events
  dreams.on("step", (step) => {
    console.log("\n🤔 New thought step:", {
      content: step.content,
      tags: step.tags,
    });
  });

  dreams.on("action:start", (action) => {
    console.log("\n🎬 Starting action:", {
      type: action.type,
      payload: action.payload,
    });
  });

  dreams.on("action:complete", ({ action, result }) => {
    console.log("\n✅ Action complete:", {
      type: action.type,
      result,
    });
  });

  dreams.on("action:error", ({ action, error }) => {
    console.log("\n❌ Action failed:", {
      type: action.type,
      error,
    });
  });

  dreams.on("think:start", ({ query }) => {
    console.log("\n🧠 Starting to think about:", query);
  });

  dreams.on("think:complete", ({ query }) => {
    console.log("\n🎉 Finished thinking about:", query);
  });

  dreams.on("think:timeout", ({ query }) => {
    console.log("\n⏰ Thinking timed out for:", query);
  });

  dreams.on("think:error", ({ query, error }) => {
    console.log("\n💥 Error while thinking about:", query, error);
  });

  await dreams.think("Build me a Fishing Village?");

  // console.log(result);

  // const intentExtractor = new LLMIntentExtractor(llmClient);

  // // Initialize processor with dependencies
  // const processor = new EventProcessor(
  //   vectorDb,
  //   intentExtractor,
  //   llmClient,
  //   actionRegistry,
  //   defaultCharacter,
  //   LogLevel.INFO
  // );

  // // Initialize Core with all dependencies including VectorDB
  // const core = new Core(
  //   processor,
  //   roomManager,
  //   actionRegistry,
  //   intentExtractor,
  //   vectorDb,
  //   {
  //     logging: {
  //       level: LogLevel.DEBUG,
  //       enableColors: true,
  //       enableTimestamp: true,
  //     },
  //   }
  // );

  // // Initialize consciousness after core is set up
  // const consciousness = new Consciousness(core, llmClient, roomManager, {
  //   intervalMs: 60000, // Think every minute
  //   minConfidence: 0.7,
  //   logLevel: LogLevel.DEBUG,
  // });

  // // Initialize clients with core
  // const twitterClient = new TwitterClient(
  //   "twitter",
  //   {
  //     username: env.TWITTER_USERNAME,
  //     password: env.TWITTER_PASSWORD,
  //     email: env.TWITTER_EMAIL,
  //   },
  //   core
  // );

  // // Register clients with core
  // core.registerClient(twitterClient);

  // // Start consciousness
  // await consciousness.start();

  // // Start listening
  // await twitterClient.listen();

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    // await consciousness.stop();
    // await twitterClient.stop();
    process.exit(0);
  });
}

main().catch(console.error);
