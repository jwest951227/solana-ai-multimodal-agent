// This is a basic example of how to use the Daydreams package
// It runs a simple agent that can execute tasks directly using the think method

import { ChromaVectorDB } from "../packages/core/src/core/vector-db";
import { env } from "../packages/core/src/core/env";
import { LLMClient } from "../packages/core/src/core/llm-client";
import { ChainOfThought } from "../packages/core/src/core/chain-of-thought";
import { ETERNUM_CONTEXT } from "./eternum-context";
import * as readline from "readline";
import chalk from "chalk";
import { LogLevel } from "../packages/core/src/types";
import { starknetTransactionAction } from "../packages/core/src/core/actions/starknet-transaction";
import { graphqlAction } from "../packages/core/src/core/actions/graphql";
import {
  graphqlFetchSchema,
  starknetTransactionSchema,
} from "../packages/core/src/core/validation";
import type { JSONSchemaType } from "ajv";

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
  // Initialize LLM client
  const llmClient = new LLMClient({
    provider: "anthropic",
    apiKey: env.ANTHROPIC_API_KEY,
  });

  // Initialize ChainOfThought
  const dreams = new ChainOfThought(llmClient, {
    worldState: ETERNUM_CONTEXT,
    queriesAvailable: "",
    availableActions: "",
  });

  // Register available actions
  dreams.registerAction(
    "EXECUTE_TRANSACTION",
    starknetTransactionAction,
    {
      description: "Execute a transaction on the Starknet blockchain",
      example: JSON.stringify({
        contractAddress: "0x1234567890abcdef",
        entrypoint: "execute",
        calldata: [1, 2, 3],
      }),
    },
    starknetTransactionSchema as JSONSchemaType<any>
  );

  dreams.registerAction(
    "GRAPHQL_FETCH",
    graphqlAction,
    {
      description: "Fetch data from the Eternum GraphQL API",
      example: JSON.stringify({
        query:
          "query GetRealmInfo { eternumRealmModels(where: { realm_id: 42 }) { edges { node { ... on eternum_Realm { entity_id level } } } }",
      }),
    },
    graphqlFetchSchema as JSONSchemaType<any>
  );

  // Add basic event handlers
  dreams.on("think:start", ({ query }) => {
    console.log(chalk.blue("\n🧠 Thinking about:"), query);
  });

  dreams.on("action:start", (action) => {
    console.log(chalk.yellow("\n🎬 Executing action:"), {
      type: action.type,
      payload: action.payload,
    });
  });

  dreams.on("action:complete", ({ action, result }) => {
    console.log(chalk.green("\n✅ Action completed:"), {
      type: action.type,
      result,
    });
  });

  dreams.on("action:error", ({ action, error }) => {
    console.log(chalk.red("\n❌ Action failed:"), {
      type: action.type,
      error,
    });
  });

  // Main interaction loop
  while (true) {
    console.log(
      chalk.cyan("\n🤖 What would you like me to do? (type 'exit' to quit):")
    );
    const userInput = await getCliInput("> ");

    if (userInput.toLowerCase() === "exit") {
      console.log(chalk.yellow("Goodbye! 👋"));
      break;
    }

    try {
      console.log(chalk.cyan("\n🎯 Processing your request..."));
      const result = await dreams.think(userInput);
      console.log(chalk.green("\n✨ Task completed successfully!"));
      console.log("Result:", result);
    } catch (error) {
      console.error(chalk.red("Error processing request:"), error);
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
