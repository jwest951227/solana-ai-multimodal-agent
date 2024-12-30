import type { LLMClient } from "./llm-client";
import type {
  ChainOfThoughtContext,
  CoTAction,
  CoTTransaction,
  LLMStructuredResponse,
} from "./validation";
import type { CoTStep } from "./validation";
import { queryValidator, transactionValidator } from "./validation";
import { Logger, LogLevel } from "./logger";
import { executeStarknetTransaction, fetchData } from "./providers";
import { EventEmitter } from "events";

/**
 * A robust Chain of Thought manager specifically designed
 * for game-oriented operations.
 */
export class ChainOfThought extends EventEmitter {
  private steps: CoTStep[];
  private context: ChainOfThoughtContext;
  private snapshots: ChainOfThoughtContext[]; // Optional for storing context snapshots
  private logger: Logger;

  /**
   * Constructor initializes the ChainOfThought with an optional initial context.
   * @param initialContext Optional context to bootstrap the chain of thought.
   */
  constructor(
    private llmClient: LLMClient,
    initialContext?: ChainOfThoughtContext
  ) {
    super(); // Initialize EventEmitter
    this.steps = [];
    this.context = initialContext ?? {
      worldState: "",
      queriesAvailable: "",
      availableActions: "",
    };
    this.snapshots = [];
    this.logger = new Logger({
      level: LogLevel.ERROR,
      enableColors: true,
      enableTimestamp: true,
    });
  }

  /**
   * Add a new step to the end of the chain.
   * @param content Reasoning or textual content of the step.
   * @param tags Optional tags or categories to label the step.
   * @param meta Additional metadata to store in the step.
   */
  public addStep(
    content: string,
    tags?: string[],
    meta?: Record<string, any>
  ): CoTStep {
    this.logger.debug("addStep", "Adding new step", { content, tags, meta });

    const newStep: CoTStep = {
      id: this.generateUniqueId(),
      content,
      timestamp: Date.now(),
      tags,
      meta,
    };
    this.steps.push(newStep);
    this.emit("step", newStep); // Emit step event
    return newStep;
  }

  /**
   * Insert a new step at a specified index in the chain.
   * Useful if you need to adjust or backtrack the chain of thought.
   * @param index The position where the new step should be inserted.
   * @param content The content of the new step.
   * @param tags Optional tags for the step.
   * @param meta Optional metadata.
   */
  public insertStep(
    index: number,
    content: string,
    tags?: string[],
    meta?: Record<string, any>
  ): CoTStep {
    this.logger.debug("insertStep", "Inserting step at index", {
      index,
      content,
      tags,
      meta,
    });

    if (index < 0 || index > this.steps.length) {
      const error = `Invalid index: ${index}. Index must be between 0 and ${this.steps.length}`;
      this.logger.error("insertStep", error);
      throw new Error(error);
    }

    const newStep: CoTStep = {
      id: this.generateUniqueId(),
      content,
      timestamp: Date.now(),
      tags,
      meta,
    };

    this.steps.splice(index, 0, newStep);
    return newStep;
  }

  /**
   * Update the content of an existing step.
   * @param stepId Unique identifier for the step to be updated.
   * @param newContent The new textual content.
   */
  public updateStepContent(stepId: string, newContent: string): void {
    this.logger.debug("updateStepContent", "Updating step content", {
      stepId,
      newContent,
    });

    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.content = newContent;
      step.timestamp = Date.now();
    } else {
      this.logger.warn("updateStepContent", "Step not found", { stepId });
    }
  }

  /**
   * Retrieve the entire chain of steps.
   */
  public getSteps(): CoTStep[] {
    return this.steps;
  }

  /**
   * Retrieve the current context.
   */
  public getContext(): ChainOfThoughtContext {
    return this.context;
  }

  /**
   * Merge new data into the current context.
   * @param newContext Partial context to merge into the existing context.
   */
  public mergeContext(newContext: Partial<ChainOfThoughtContext>): void {
    this.logger.debug("mergeContext", "Merging new context", { newContext });

    this.context = {
      ...this.context,
      ...newContext,
    };
  }

  /**
   * Add (push) a context snapshot to keep track of changes over time.
   */
  public snapshotContext(): void {
    this.logger.debug("snapshotContext", "Creating context snapshot");

    // Deep clone if necessary
    const snapshot = JSON.parse(JSON.stringify(this.context));
    this.snapshots.push(snapshot);
  }

  /**
   * Retrieve all snapshots.
   */
  public getSnapshots(): ChainOfThoughtContext[] {
    return this.snapshots;
  }

  /**
   * A central method to handle CoT actions that might be triggered by the LLM.
   * @param action The action to be executed.
   */
  public async executeAction(action: CoTAction): Promise<string> {
    this.logger.debug("executeAction", "Executing action", { action });
    this.emit("action:start", action); // Emit action start

    // Add validation for transaction if it's that type
    if (action.type === "EXECUTE_TRANSACTION") {
      const transaction = action.payload;
      if (transaction && !transactionValidator(transaction)) {
        const error = "Invalid transaction format in action payload";
        this.logger.error("executeAction", error, { transaction });
        throw new Error(error);
      }
    }

    try {
      const result = await (async () => {
        switch (action.type) {
          case "GRAPHQL_FETCH":
            return await this.graphqlFetchAction(action.payload);

          case "EXECUTE_TRANSACTION":
            return this.runTransaction(action.payload as CoTTransaction);

          default:
            this.logger.warn("executeAction", "Unknown action type", {
              actionType: action.type,
            });
            return "Unknown action type: " + action.type;
        }
      })();

      this.emit("action:complete", { action, result }); // Emit successful completion
      return result;
    } catch (error) {
      this.emit("action:error", { action, error }); // Emit error
      this.logger.error("executeAction", "Action execution failed", {
        error: error instanceof Error ? error.message : String(error),
        action,
      });
      throw error;
    }
  }

  private async graphqlFetchAction(
    payload?: Record<string, any>
  ): Promise<string> {
    this.logger.debug("graphqlFetchAction", "Executing GraphQL fetch", {
      payload,
    });

    // Example of expected fields in the payload
    const { query, variables } = payload || {};

    const result = await fetchData(query, variables);
    this.addStep(
      `Performing GraphQL fetch with query: ${query}`,
      ["graphql-fetch"],
      {
        variables,
      }
    );

    const resultStr =
      `query: ` + query + `\n\nresult: ` + JSON.stringify(result, null, 2);

    this.addStep(resultStr, ["graphql-result"]);

    return resultStr;
  }

  /**
   * Execute a "transaction" that can modify the chain of thought, the context,
   * or even the game state. The specifics are up to your design.
   */
  private async runTransaction(transaction: CoTTransaction): Promise<string> {
    this.logger.debug("runTransaction", "Running transaction", { transaction });

    // Add step describing the transaction
    this.addStep(
      `Running transaction: ${transaction.contractAddress}`,
      ["transaction"],
      {
        transactionData: transaction.calldata,
      }
    );

    const result = await executeStarknetTransaction(transaction);

    const resultStr = `Transaction executed successfully: ${JSON.stringify(
      result,
      null,
      2
    )}`;

    this.addStep(resultStr, ["transaction-result"]);

    return resultStr;
  }

  /**
   * Generate a unique ID for steps. In a real environment,
   * you might use a library like uuid to ensure uniqueness.
   */
  private generateUniqueId(): string {
    // Quick example ID generator
    return "step-" + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Removes a step from the chain by its ID.
   * @param stepId The unique identifier of the step to remove
   * @throws Error if the step with the given ID doesn't exist
   */
  public removeStep(stepId: string): void {
    this.logger.debug("removeStep", "Removing step", { stepId });

    const index = this.steps.findIndex((step) => step.id === stepId);
    if (index === -1) {
      const error = `Step with ID ${stepId} not found`;
      this.logger.error("removeStep", error);
      throw new Error(error);
    }
    this.steps.splice(index, 1);
  }

  // --- LLM Integration Methods --------------------------------
  /**
   * High-level method that:
   * 1. Builds a prompt from the chain & context
   * 2. Calls the LLM
   * 3. Validates and parses the response
   * 4. Executes or applies the returned plan & actions
   */
  public async callLLMAndProcessResponse(
    maxRetries: number = 3
  ): Promise<LLMStructuredResponse> {
    this.logger.debug("callLLMAndProcessResponse", "Starting LLM call", {
      maxRetries,
    });

    let attempts = 0;

    while (attempts < maxRetries) {
      // 1. Build the prompt
      const prompt = this.buildLLMPrompt();

      // 2. Send the prompt to the LLM and get a structured response
      try {
        const llmRawResponse = await this.sendToLLM(prompt);

        // Parse the response
        let llmResponse: LLMStructuredResponse;
        try {
          llmResponse = JSON.parse(llmRawResponse) as LLMStructuredResponse;
        } catch (err) {
          this.logger.error(
            "callLLMAndProcessResponse",
            "Failed to parse LLM response as JSON",
            {
              error: err instanceof Error ? err.message : String(err),
              response: llmRawResponse,
            }
          );
          attempts++;
          continue;
        }

        // Validate the response structure
        if (!queryValidator(llmResponse)) {
          this.logger.error(
            "callLLMAndProcessResponse",
            "LLM response failed validation",
            {
              response: llmResponse,
            }
          );
          attempts++;
          continue;
        }

        // 3. Extract the plan and add it as a step
        if (llmResponse.plan) {
          this.addStep(`${llmResponse.plan}`, ["llm-plan"]);
        }

        // If we get here, everything worked
        return llmResponse;
      } catch (err) {
        this.logger.error(
          "callLLMAndProcessResponse",
          "Error in LLM processing",
          {
            error: err instanceof Error ? err.message : String(err),
            attempt: attempts + 1,
          }
        );
        attempts++;
      }
    }

    // If we get here, we've exhausted all retries
    const error = `Failed to get valid LLM response after ${maxRetries} attempts`;
    this.logger.error("callLLMAndProcessResponse", error);
    throw new Error(error);
  }

  /**
   * Build a prompt that instructs the LLM to produce structured data.
   * You can adapt the instructions, tone, or style as needed.
   */
  private buildLLMPrompt(): string {
    this.logger.debug("buildLLMPrompt", "Building LLM prompt");

    // You can control how many steps or which steps to send
    // For example, let's just send the last few steps:
    const lastSteps = this.steps
      .slice(-5)
      .map((s) => s.content)
      .join("\n");
    const contextSummary = JSON.stringify(this.context, null, 2);

    return `


    <OBJECTIVE>
You are a Chain of Thought reasoning system. Think through this problem step by step:

1. First, carefully analyze the goal and break it down into logical components
2. For each component, determine the precise actions and information needed
3. Consider dependencies and prerequisites between steps
4. Validate that each step directly contributes to the goal
5. Ensure the sequence is complete and sufficient to achieve the goal


Return a precise sequence of steps that achieves the given goal. Each step must be:
- Actionable and concrete
- Directly contributing to the goal
- Properly ordered in the sequence
- Validated against requirements

Focus solely on the goal you have been given. Do not add extra steps or deviate from the objective.
</OBJECTIVE>

<LAST_STEPS>
${lastSteps}
</LAST_STEPS>

<CONTEXT_SUMMARY>
${contextSummary}
</CONTEXT_SUMMARY>

${this.context.worldState}

${this.context.queriesAvailable}

${this.context.availableActions}



<STEP_VALIDATION_RULES>
1. Each step must have a clear, measurable outcome
2. Maximum 10 steps per sequence
3. Steps must be non-redundant unless explicitly required
4. All dynamic values (marked with <>) must be replaced with actual values
5. Use queries for information gathering, transactions for actions only
</STEP_VALIDATION_RULES>

<REQUIRED_VALIDATIONS>
1. Resource costs must be verified before action execution
2. Building requirements must be confirmed before construction
3. Entity existence must be validated before interaction
4. If the required amounts are not available, end the sequence.
</REQUIRED_VALIDATIONS>

<OUTPUT_FORMAT>
Return a JSON array where each step contains:
- plan: A short explanation of what you will do
- meta: A metadata object with requirements for the step. Find this in the context.
- actions: A list of actions to be executed. You can either use GRAPHQL_FETCH or EXECUTE_TRANSACTION. You must only use these.


Provide a JSON response with the following structure:


{
  "plan": "A short explanation of what you will do",
      "meta": {
      "requirements": {
        "resources": {
          "fish": 450000
        },
        "population": 1
      }
    },
  "actions": [
        {
          type: "GRAPHQL_FETCH",
          payload: {
            query: "query GetRealmInfo { eternumRealmModels(where: { realm_id: 42 }) { edges { node { ... on eternum_Realm { entity_id level } } } } }",
          },
        },
        {
          type: "EXECUTE_TRANSACTION",
          payload: {
              contractAddress: "0x1234567890abcdef",
              entrypoint: "execute",
              calldata: [1, 2, 3],
          },
        },
  ]
}

</OUTPUT_FORMAT>

Do NOT include any additional keys outside of "plan" and "actions".
Make sure the JSON is valid. No extra text outside of the JSON.
`;
  }

  /**
   * Placeholder function to send the prompt to the LLM.
   * Replace with actual call to e.g. OpenAI or another provider.
   */
  private async sendToLLM(prompt: string): Promise<string> {
    this.logger.debug("sendToLLM", "Sending prompt to LLM");

    const response = await this.llmClient.analyze(prompt, {
      system: `"You are a reasoning system that outputs structured JSON only."`,
    });

    // Make sure we're dealing with a string
    let responseStr: string;

    if (typeof response === "string") {
      responseStr = response;
    } else if (typeof response === "object") {
      responseStr = JSON.stringify(response);
    } else {
      const error = `Unexpected response type from LLM: ${typeof response}`;
      this.logger.error("sendToLLM", error);
      throw new Error(error);
    }

    this.logger.debug("sendToLLM", "Received LLM response", {
      response: JSON.parse(responseStr),
    });

    return responseStr;
  }

  public async think(
    userQuery: string,
    maxIterations: number = 10
  ): Promise<void> {
    this.emit("think:start", { query: userQuery });

    try {
      this.logger.debug("solveQuery", "Starting query solution", {
        userQuery,
        maxIterations,
      });

      // Initialize with user query
      this.addStep(`Initial Query: ${userQuery}`, ["user-query"]);

      let currentIteration = 0;
      let isComplete = false;

      let steps: CoTAction[] = [];
      let currentStepIndex = 0;

      while (!isComplete && currentIteration < maxIterations) {
        this.logger.debug("solveQuery", "Starting iteration", {
          currentIteration,
        });

        const llmResponse = await this.callLLMAndProcessResponse();

        // Insert new actions after current position
        steps.splice(currentStepIndex, 0, ...llmResponse.actions);

        if (Array.isArray(steps)) {
          // Only process one action at a time, allowing for plan changes
          const action = steps[currentStepIndex];
          if (action) {
            const result = await this.executeAction(action);
            currentStepIndex++;

            // After each action, check with LLM if we should continue
            const completionCheck = await this.llmClient.analyze(
              JSON.stringify({
                query: userQuery,
                currentSteps: this.steps,
                context: this.context,
                lastAction: action.toString() + " RESULT:" + result,
              }),
              {
                system: `You are a goal completion analyzer using Chain of Verification. Your task is to carefully evaluate whether a goal has been achieved or is impossible based on the provided context.

Analyze using Chain of Verification:
1. The original query/goal - Verify the exact requirements
2. All steps taken so far - Verify each step was completed successfully
3. The current context - Verify the current state matches expectations
4. The result of the last action - Verify the outcome was correct

IMPORTANT RESOURCE RULES:
- If a required resource has 0 balance, mark the goal as complete with failure reason
- Do not suggest alternative approaches if core resources are missing
- Do not continue planning if prerequisites cannot be met

For each verification:
- Check preconditions were met
- Validate the execution was proper
- Confirm expected postconditions
- Look for any edge cases or errors

Determine through verification:
- Has the goal been achieved OR determined to be impossible? (complete)
- What specific verifications led to your determination? (reason)
- Should the system continue only if resources are available? (shouldContinue)

Only return a JSON object with this exact structure:

{
  "complete": boolean,
  "reason": "detailed explanation of verification results",
  "shouldContinue": boolean,
  "newActions": [] // Only include if continuing and resources are available
}

Do not include any text outside the JSON object. Do not include backticks, markdown formatting, or explanations.`,
              }
            );

            try {
              const completion = JSON.parse(completionCheck.toString());
              isComplete = completion.complete;

              if (completion.newActions) {
                // Insert new actions before any remaining unprocessed steps
                steps.splice(currentStepIndex, 0, ...completion.newActions);
              }

              if (isComplete || !completion.shouldContinue) {
                this.addStep(
                  `Goal ${isComplete ? "achieved" : "failed"}: ${
                    completion.reason
                  }`,
                  ["completion"]
                );
                this.emit("think:complete", { query: userQuery });
                return; // Exit immediately when complete or should not continue
              } else {
                this.addStep(
                  `Action completed, continuing execution: ${completion.reason}`,
                  ["continuation"]
                );
              }
            } catch (error) {
              this.logger.error(
                "solveQuery",
                "Error parsing completion check",
                {
                  error: error instanceof Error ? error.message : String(error),
                  completionCheck,
                }
              );
              break;
            }
          }
        }

        currentIteration++;
      }

      if (currentIteration >= maxIterations) {
        const error = `Failed to solve query "${userQuery}" within ${maxIterations} iterations`;
        this.logger.error("solveQuery", error);
        this.emit("think:timeout", { query: userQuery }); // Emit timeout
      }
    } catch (error) {
      this.emit("think:error", { query: userQuery, error }); // Emit error
      throw error;
    }
  }
}

// Add type definitions for the events
export interface ChainOfThoughtEvents {
  step: (step: CoTStep) => void;
  "action:start": (action: CoTAction) => void;
  "action:complete": (data: { action: CoTAction; result: string }) => void;
  "action:error": (data: { action: CoTAction; error: Error | unknown }) => void;
  "think:start": (data: { query: string }) => void;
  "think:complete": (data: { query: string }) => void;
  "think:timeout": (data: { query: string }) => void;
  "think:error": (data: { query: string; error: Error | unknown }) => void;
}

// Add type safety to event emitter
export declare interface ChainOfThought {
  on<K extends keyof ChainOfThoughtEvents>(
    event: K,
    listener: ChainOfThoughtEvents[K]
  ): this;
  emit<K extends keyof ChainOfThoughtEvents>(
    event: K,
    ...args: Parameters<ChainOfThoughtEvents[K]>
  ): boolean;
}
