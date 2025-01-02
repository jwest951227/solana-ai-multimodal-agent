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
import { type GoalStatus } from "./core/goalManager";
import chalk from "chalk";

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

function printGoalStatus(status: GoalStatus): string {
  const colors: Record<GoalStatus, string> = {
    pending: chalk.yellow("⏳ PENDING"),
    active: chalk.blue("▶️ ACTIVE"),
    completed: chalk.green("✅ COMPLETED"),
    failed: chalk.red("❌ FAILED"),
    ready: chalk.cyan("🎯 READY"),
    blocked: chalk.red("🚫 BLOCKED"),
  };
  return colors[status] || status;
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

  // Add goal-related event handlers
  dreams.on("goal:created", ({ id, description }) => {
    console.log(chalk.cyan("\n🎯 New goal created:"), {
      id,
      description,
    });
  });

  dreams.on("goal:updated", ({ id, status }) => {
    console.log(chalk.yellow("\n📝 Goal status updated:"), {
      id,
      status: printGoalStatus(status),
    });
  });

  dreams.on("goal:completed", ({ id, result }) => {
    console.log(chalk.green("\n✨ Goal completed:"), {
      id,
      result,
    });
  });

  dreams.on("goal:failed", ({ id, error }) => {
    console.log(chalk.red("\n💥 Goal failed:"), {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  while (true) {
    console.log(chalk.cyan("\n🤖 Enter your goal (or 'exit' to quit):"));
    const userInput = await getCliInput("> ");

    if (userInput.toLowerCase() === "exit") {
      console.log(chalk.yellow("Goodbye! 👋"));
      break;
    }

    try {
      // First, plan the strategy for the goal
      console.log(chalk.cyan("\n🤔 Planning strategy for goal..."));
      await dreams.planStrategy(userInput);

      // Execute goals until completion or failure
      console.log(chalk.cyan("\n🎯 Executing goals..."));

      const stats = {
        completed: 0,
        failed: 0,
        total: 0,
      };

      // Keep executing goals until no more ready goals
      while (true) {
        const readyGoals = dreams.goalManager.getReadyGoals();
        const activeGoals = dreams.goalManager
          .getGoalsByHorizon("short")
          .filter((g) => g.status === "active");
        const pendingGoals = dreams.goalManager
          .getGoalsByHorizon("short")
          .filter((g) => g.status === "pending");

        // Print current status
        console.log(chalk.cyan("\n📊 Current Progress:"));
        console.log(`Ready goals: ${readyGoals.length}`);
        console.log(`Active goals: ${activeGoals.length}`);
        console.log(`Pending goals: ${pendingGoals.length}`);
        console.log(`Completed: ${stats.completed}`);
        console.log(`Failed: ${stats.failed}`);

        if (
          readyGoals.length === 0 &&
          activeGoals.length === 0 &&
          pendingGoals.length === 0
        ) {
          console.log(chalk.green("\n✨ All goals completed!"));
          break;
        }

        if (readyGoals.length === 0 && activeGoals.length === 0) {
          console.log(
            chalk.yellow(
              "\n⚠️ No ready or active goals, but some goals are pending:"
            )
          );
          pendingGoals.forEach((goal) => {
            const blockingGoals = dreams.goalManager.getBlockingGoals(goal.id);
            console.log(chalk.yellow(`\n📌 Pending Goal: ${goal.description}`));
            console.log(
              chalk.yellow(`   Blocked by: ${blockingGoals.length} goals`)
            );
            blockingGoals.forEach((blocking) => {
              console.log(
                chalk.yellow(
                  `   - ${blocking.description} (${blocking.status})`
                )
              );
            });
          });
          break;
        }

        try {
          await dreams.executeNextGoal();
          stats.completed++;
        } catch (error) {
          console.error(chalk.red("\n❌ Goal execution failed:"), error);
          stats.failed++;

          // Check if we should continue
          const shouldContinue = await getCliInput(
            chalk.yellow("\nContinue executing remaining goals? (y/n): ")
          );

          if (shouldContinue.toLowerCase() !== "y") {
            console.log(chalk.yellow("Stopping goal execution."));
            break;
          }
        }

        stats.total++;
      }

      // Final summary
      console.log(chalk.cyan("\n📊 Final Execution Summary:"));
      console.log(chalk.green(`✅ Completed Goals: ${stats.completed}`));
      console.log(chalk.red(`❌ Failed Goals: ${stats.failed}`));
      console.log(
        chalk.blue(
          `📈 Success Rate: ${Math.round(
            (stats.completed / stats.total) * 100
          )}%`
        )
      );
    } catch (error) {
      console.error(chalk.red("Error processing goal:"), error);
    }
  }

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log(chalk.yellow("\nShutting down..."));
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
