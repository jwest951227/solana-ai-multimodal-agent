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
import * as readline from "readline";

async function getCliInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

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
    if (step.type === "system") {
      console.log("\n💭 System prompt:", step.content);
    } else {
      console.log("\n🤔 New thought step:", {
        content: step.content,
        tags: step.tags,
      });
    }
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

  while (true) {
    console.log("\n🤖 Enter your goal (or 'exit' to quit):");
    const userInput = await getCliInput("> ");

    if (userInput.toLowerCase() === "exit") {
      console.log("Goodbye! 👋");
      break;
    }

    try {
      // First, plan the strategy for the goal
      console.log("\n🤔 Planning strategy for goal...");
      await dreams.planStrategy(userInput);

      // Execute goals until completion
      console.log("\n🎯 Executing goals...");
      let completedGoals = 0;
      let failedGoals = 0;

      while (true) {
        const readyGoals = dreams.goalManager.getReadyGoals();

        if (readyGoals.length === 0) {
          console.log("\n✨ All goals completed!");
          break;
        }

        try {
          await dreams.executeNextGoal();
          completedGoals++;
        } catch (error) {
          console.error("\n❌ Goal execution failed:", error);
          failedGoals++;
        }
      }

      console.log("\n📊 Goal Execution Summary:");
      console.log(`✅ Completed Goals: ${completedGoals}`);
      console.log(`❌ Failed Goals: ${failedGoals}`);
    } catch (error) {
      console.error("Error processing goal:", error);
    }
  }

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
