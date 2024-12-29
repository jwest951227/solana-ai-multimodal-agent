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

/**
 * A robust Chain of Thought manager specifically designed
 * for game-oriented operations.
 */
export class ChainOfThought {
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
    this.steps = [];
    this.context = initialContext ?? {
      worldState: "",
      queriesAvailable: "",
      availableActions: "",
    };
    this.snapshots = [];
    this.logger = new Logger({
      level: LogLevel.DEBUG,
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
    } catch (error) {
      this.logger.error("executeAction", "Action execution failed", {
        error: error instanceof Error ? error.message : String(error),
        action,
      });
      throw error;
    }
  }

  /**
   * A placeholder example of how you might fetch data from SQL.
   * In reality, you'd provide your DB or ORM client to do the query.
   */
  private async graphqlFetchAction(
    payload?: Record<string, any>
  ): Promise<string> {
    this.logger.debug("graphqlFetchAction", "Executing GraphQL fetch", {
      payload,
    });

    // Example of expected fields in the payload
    const { query, variables } = payload || {};
    this.addStep(
      `Performing GraphQL fetch with query: ${query}`,
      ["graphql-fetch"],
      {
        variables,
      }
    );

    // Suppose you have a DB client:
    // const result = await db.execute(query, variables);

    // For now, just add an example step to represent the retrieved data
    // this.addStep(`SQL result: ${JSON.stringify(result)}`, ['sql-result']);
    this.addStep(`GraphQL result: [Fake DB result for demonstration]`, [
      "graphql-result",
    ]);

    return "GraphQL result: [Fake DB result for demonstration]";
  }

  /**
   * Execute a "transaction" that can modify the chain of thought, the context,
   * or even the game state. The specifics are up to your design.
   */
  private runTransaction(transaction: CoTTransaction): string {
    this.logger.debug("runTransaction", "Running transaction", { transaction });

    // Add step describing the transaction
    this.addStep(
      `Running transaction: ${transaction.contractAddress}`,
      ["transaction"],
      {
        transactionData: transaction.calldata,
      }
    );

    return "Transaction executed successfully";
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
          this.addStep(`LLM Plan: ${llmResponse.plan}`, ["llm-plan"]);
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

Last steps:
${lastSteps}

Current context (JSON):
${contextSummary}

World state:
${this.context.worldState}

Queries available:
${this.context.queriesAvailable}

Available actions:
${this.context.availableActions}

OBJECTIVE:
Return a precise sequence of steps to achieve the given goal. Each step must be actionable and directly contribute to the goal. Only work towards the goal you have been given.

STEP VALIDATION RULES:
1. Each step must have a clear, measurable outcome
2. Maximum 10 steps per sequence
3. Steps must be non-redundant unless explicitly required
4. All dynamic values (marked with <>) must be replaced with actual values
5. Use queries for information gathering, transactions for actions only

REQUIRED VALIDATIONS:
1. Resource costs must be verified before action execution
2. Building requirements must be confirmed before construction
3. Entity existence must be validated before interaction

OUTPUT FORMAT:
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
      response: responseStr,
    });

    return responseStr;
  }

  public async solveQuery(
    userQuery: string,
    maxIterations: number = 10
  ): Promise<void> {
    this.logger.debug("solveQuery", "Starting query solution", {
      userQuery,
      maxIterations,
    });

    // Initialize with user query
    this.addStep(`Initial Query: ${userQuery}`, ["user-query"]);

    let currentIteration = 0;
    let isComplete = false;

    while (!isComplete && currentIteration < maxIterations) {
      this.logger.debug("solveQuery", "Starting iteration", {
        currentIteration,
      });

      // Get next steps from LLM
      const llmResponse = await this.callLLMAndProcessResponse();

      // Process each action one at a time
      if (Array.isArray(llmResponse.actions)) {
        for (const action of llmResponse.actions) {
          // Execute the action
          const result = await this.executeAction(action);

          // After each action, check with LLM if we should continue
          const completionCheck = await this.llmClient.analyze(
            JSON.stringify({
              query: userQuery,
              currentSteps: this.steps,
              context: this.context,
              lastAction: action.toString() + " RESULT:" + result,
            }),
            {
              system: `You are a goal completion analyzer. Your task is to carefully evaluate whether a goal has been achieved based on the provided context.

Analyze:
1. The original query/goal
2. All steps taken so far
3. The current context
4. The result of the last action

Determine:
- Has the goal been fully achieved? (complete)
- What is the specific reason for your determination? (reason) 
- Should the system continue with the current plan or get a new one? (shouldContinue)

Only return a JSON object with this exact structure:

{
  "complete": boolean,
  "reason": "detailed explanation of your determination",
  "shouldContinue": boolean
}

Do not include any text outside the JSON object. Do not include backticks, markdown formatting, or explanations.`,
            }
          );

          this.logger.debug("solveQuery", "Completion check", {
            completionCheck,
          });

          try {
            const completion = JSON.parse(completionCheck.toString());
            isComplete = completion.complete;

            if (isComplete) {
              this.addStep(`Goal achieved: ${completion.reason}`, [
                "completion",
              ]);
              return;
            }

            if (!completion.shouldContinue) {
              // Need new plan from LLM
              break;
            }

            this.addStep(
              `Action completed, continuing execution: ${completion.reason}`,
              ["continuation"]
            );
          } catch (error) {
            this.logger.error("solveQuery", "Error parsing completion check", {
              error: error instanceof Error ? error.message : String(error),
              completionCheck,
            });
            break;
          }
        }
      }

      currentIteration++;
    }

    if (currentIteration >= maxIterations) {
      const error = `Failed to solve query "${userQuery}" within ${maxIterations} iterations`;
      this.logger.error("solveQuery", error);
      throw new Error(error);
    }
  }
}
