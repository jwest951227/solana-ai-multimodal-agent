import type { LLMClient } from "./llm-client";
import type {
  ChainOfThoughtContext,
  CoTAction,
  CoTTransaction,
  LLMStructuredResponse,
} from "./validation";
import { queryValidator, transactionValidator } from "./validation";
import { Logger, LogLevel } from "./logger";
import { executeStarknetTransaction, fetchData } from "./providers";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// Add new step types at the top
type StepType = "action" | "planning" | "system" | "task";

interface BaseStep {
  id: string;
  type: StepType;
  content: string;
  timestamp: number;
  tags?: string[];
  meta?: Record<string, any>;
}

interface ActionStep extends BaseStep {
  type: "action";
  content: string;
  toolCall?: {
    name: string;
    arguments: any;
    id: string;
  };
  error?: Error;
  observations?: string;
  actionOutput?: any;
  duration?: number;
}

interface PlanningStep extends BaseStep {
  type: "planning";
  plan: string;
  facts: string;
}

interface SystemStep extends BaseStep {
  type: "system";
  systemPrompt: string;
}

interface TaskStep extends BaseStep {
  type: "task";
  task: string;
}

export type Step = ActionStep | PlanningStep | SystemStep | TaskStep;

// Add StepManager class
class StepManager {
  private steps: Step[] = [];
  private stepIds: Set<string> = new Set();

  constructor() {
    this.steps = [];
    this.stepIds = new Set();
  }

  public addStep(step: Step): Step {
    if (this.stepIds.has(step.id)) {
      throw new Error(`Step with ID ${step.id} already exists`);
    }

    this.steps.push(step);
    this.stepIds.add(step.id);
    return step;
  }

  public getSteps(): Step[] {
    return this.steps;
  }

  public getStepById(id: string): Step | undefined {
    return this.steps.find((s) => s.id === id);
  }

  public updateStep(id: string, updates: Partial<Step>): void {
    const index = this.steps.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`Step with ID ${id} not found`);
    }

    const currentStep = this.steps[index];
    const updatedStep = {
      ...currentStep,
      ...updates,
      type: currentStep.type, // Preserve the original step type
      timestamp: Date.now(), // Update timestamp on changes
    } as Step;

    this.steps[index] = updatedStep;
  }

  public removeStep(id: string): void {
    const index = this.steps.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`Step with ID ${id} not found`);
    }

    this.steps.splice(index, 1);
    this.stepIds.delete(id);
  }

  public clear(): void {
    this.steps = [];
    this.stepIds.clear();
  }
}

async function askUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question}\nYour response: `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * A robust Chain of Thought manager specifically designed
 * for game-oriented operations.
 */
export class ChainOfThought extends EventEmitter {
  private stepManager: StepManager;
  private context: ChainOfThoughtContext;
  private snapshots: ChainOfThoughtContext[]; // Optional for storing context snapshots
  private logger: Logger;
  private contextLogPath: string;

  /**
   * Constructor initializes the ChainOfThought with an optional initial context.
   * @param initialContext Optional context to bootstrap the chain of thought.
   */
  constructor(
    private llmClient: LLMClient,
    initialContext?: ChainOfThoughtContext
  ) {
    super(); // Initialize EventEmitter
    this.stepManager = new StepManager();
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

    this.contextLogPath = path.join(process.cwd(), "logs", "context.log");
    // Ensure logs directory exists
    const logsDir = path.dirname(this.contextLogPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    // Log initial context
    this.logContext("INITIAL_CONTEXT");
  }

  private logContext(trigger: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `\n[${timestamp}] Context changed by: ${trigger}\n${JSON.stringify(
      this.context,
      null,
      2
    )}\n${"=".repeat(80)}\n`;

    try {
      fs.appendFileSync(this.contextLogPath, logEntry);
    } catch (error) {
      this.logger.error("logContext", "Failed to write context log", { error });
    }
  }

  /**
   * Add a new step to the end of the chain.
   * @param content Reasoning or textual content of the step.
   * @param type The type of the step.
   * @param tags Optional tags or categories to label the step.
   * @param meta Additional metadata to store in the step.
   */
  public addStep(
    content: string,
    type: StepType = "action",
    tags?: string[],
    meta?: Record<string, any>
  ): Step {
    const newStep: Step = {
      id: this.generateUniqueId(),
      type,
      content,
      timestamp: Date.now(),
      tags,
      meta,
    } as Step;

    const step = this.stepManager.addStep(newStep);
    this.emit("step", step);
    return step;
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
  ): Step {
    this.logger.debug("insertStep", "Inserting step at index", {
      index,
      content,
      tags,
      meta,
    });

    if (index < 0 || index > this.stepManager.getSteps().length) {
      const error = `Invalid index: ${index}. Index must be between 0 and ${
        this.stepManager.getSteps().length
      }`;
      this.logger.error("insertStep", error);
      throw new Error(error);
    }

    const newStep: Step = {
      id: this.generateUniqueId(),
      type: "action",
      content,
      timestamp: Date.now(),
      tags,
      meta,
    } as Step;

    this.stepManager.getSteps().splice(index, 0, newStep);
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

    const step = this.stepManager.getStepById(stepId);
    if (step && "content" in step) {
      (step as { content: string; timestamp: number }).content = newContent;
      (step as { content: string; timestamp: number }).timestamp = Date.now();
    } else {
      this.logger.warn("updateStepContent", "Step not found or invalid type", {
        stepId,
      });
    }
  }

  /**
   * Retrieve the entire chain of steps.
   */
  public getSteps(): Step[] {
    return this.stepManager.getSteps();
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

    this.logContext("MERGE_CONTEXT");
  }

  /**
   * Add (push) a context snapshot to keep track of changes over time.
   */
  public snapshotContext(): void {
    this.logger.debug("snapshotContext", "Creating context snapshot");

    const snapshot = JSON.parse(JSON.stringify(this.context));
    this.snapshots.push(snapshot);

    this.logContext("SNAPSHOT_CREATED");
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
    this.emit("action:start", action);

    // Add action step at the start
    const actionStep = this.addStep(
      `Executing action: ${action.type}`,
      "action",
      ["action-execution"],
      { action }
    );

    console.log("log", action);

    try {
      const result = await (async () => {
        switch (action.type) {
          case "SYSTEM_PROMPT":
            // Handle system prompt by asking user
            const userResponse = await askUser(action.payload.prompt);
            return userResponse;

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

      // Update the action step with the result
      this.stepManager.updateStep(actionStep.id, {
        content: `Action completed: ${result}`,
        meta: { ...actionStep.meta, result },
      });

      // Store the result in context
      this.mergeContext({
        actionHistory: {
          ...(this.context.actionHistory || {}),
          [Date.now()]: {
            action,
            result,
          },
        },
      });

      this.emit("action:complete", { action, result });
      return result;
    } catch (error) {
      // Update the action step with the error
      this.stepManager.updateStep(actionStep.id, {
        content: `Action failed: ${error}`,
        meta: { ...actionStep.meta, error },
      });

      this.emit("action:error", { action, error });
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

    const resultStr =
      `query: ` + query + `\n\nresult: ` + JSON.stringify(result, null, 2);

    return resultStr;
  }

  /**
   * Execute a "transaction" that can modify the chain of thought, the context,
   * or even the game state. The specifics are up to your design.
   */
  private async runTransaction(transaction: CoTTransaction): Promise<string> {
    this.logger.debug("runTransaction", "Running transaction", { transaction });

    // Add step describing the transaction

    const result = await executeStarknetTransaction(transaction);

    const resultStr = `Transaction executed successfully: ${JSON.stringify(
      result,
      null,
      2
    )}`;

    this.addStep(
      `Running transaction: ${transaction.contractAddress}`,
      "action",
      ["transaction"],
      {
        transactionData: transaction.calldata,
        result: resultStr,
      }
    );

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

    const index = this.stepManager
      .getSteps()
      .findIndex((step) => step.id === stepId);
    if (index === -1) {
      const error = `Step with ID ${stepId} not found`;
      this.logger.error("removeStep", error);
      throw new Error(error);
    }
    this.stepManager.removeStep(stepId);
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
    query: string,
    maxRetries: number = 3
  ): Promise<LLMStructuredResponse> {
    this.logger.debug("callLLMAndProcessResponse", "Starting LLM call", {
      maxRetries,
    });

    let attempts = 0;

    while (attempts < maxRetries) {
      // 1. Build the prompt
      const prompt = this.buildLLMPrompt({ query });

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
          this.addStep(`${llmResponse.plan}`, "planning", ["llm-plan"]);
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
  private buildLLMPrompt(tags: Record<string, string> = {}): string {
    this.logger.debug("buildLLMPrompt", "Building LLM prompt");

    // You can control how many steps or which steps to send
    // For example, let's just send the last few steps:
    const lastSteps = JSON.stringify(this.stepManager.getSteps());

    // Replace any {{tag}} with the provided value or leave unchanged
    const injectTags = (text: string): string => {
      let result = text;
      const tagMatches = text.match(/\{\{(\w+)\}\}/g) || [];
      const uniqueTags = [...new Set(tagMatches)];

      uniqueTags.forEach((tag) => {
        const tagName = tag.slice(2, -2);
        const values: string[] = [];
        if (tags[tagName]) {
          // Find all occurrences and collect values
          tagMatches.forEach((match) => {
            if (match === tag) {
              values.push(tags[tagName]);
            }
          });
          // Replace with concatenated values if multiple occurrences
          result = result.replace(new RegExp(tag, "g"), values.join("\n"));
        }
      });

      return result;
    };

    const prompt = `
    <global_context>
    <OBJECTIVE>
    <GOAL>
    {{query}}
    </GOAL>

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
${this.context.worldState}

${this.context.queriesAvailable}

${this.context.availableActions}

{{additional_context}}
</CONTEXT_SUMMARY>

<STEP_VALIDATION_RULES>
1. Each step must have a clear, measurable outcome
2. Maximum 10 steps per sequence
3. Steps must be non-redundant unless explicitly required
4. All dynamic values (marked with <>) must be replaced with actual values
5. Use queries for information gathering, transactions for actions only
{{custom_validation_rules}}
</STEP_VALIDATION_RULES>

<REQUIRED_VALIDATIONS>
1. Resource costs must be verified before action execution
2. Building requirements must be confirmed before construction
3. Entity existence must be validated before interaction
4. If the required amounts are not available, end the sequence.
{{additional_validations}}
</REQUIRED_VALIDATIONS>

<OUTPUT_FORMAT>
Return a JSON array where each step contains:
- plan: A short explanation of what you will do
- meta: A metadata object with requirements for the step. Find this in the context.
- actions: A list of actions to be executed. You can either use GRAPHQL_FETCH or EXECUTE_TRANSACTION. You must only use these.

{{output_format_details}}

Provide a JSON response with the following structure (this is an example only):

{
  "plan": "A short explanation of what you will do",
      "meta": {
      "requirements": {},
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

</global_context>
`;

    return injectTags(prompt);
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
      this.logger.debug("think", "Beginning to think", {
        userQuery,
        maxIterations,
      });

      // Initialize with user query
      this.addStep(`User  Query: ${userQuery}`, "task", ["user-query"]);

      let currentIteration = 0;
      let isComplete = false;
      const llmResponse = await this.callLLMAndProcessResponse(userQuery);
      let pendingActions: CoTAction[] = [...llmResponse.actions];

      while (
        !isComplete &&
        currentIteration < maxIterations &&
        pendingActions.length > 0
      ) {
        this.logger.debug("think", "Processing iteration", {
          currentIteration,
        });

        // Add new actions to pending queue
        pendingActions.push(...llmResponse.actions);

        // Process one action at a time
        if (pendingActions.length > 0) {
          const currentAction = pendingActions.shift()!;
          this.logger.debug("think", "Processing action", {
            action: currentAction,
            remainingActions: pendingActions.length,
          });

          // Validate action before execution
          if (!currentAction.type || !currentAction.payload) {
            this.logger.error("think", "Invalid action structure", {
              action: currentAction,
            });
            throw new Error(
              `Invalid action structure: ${JSON.stringify(currentAction)}`
            );
          }

          try {
            const result = await this.executeAction(currentAction);

            const updateContext = this.buildLLMPrompt({
              result,
            });

            // Check completion status
            const completionCheck = await this.llmClient.analyze(
              `
              ${updateContext}

             ${JSON.stringify({
               query: userQuery,
               currentSteps: this.stepManager.getSteps(),
               lastAction: currentAction.toString() + " RESULT:" + result,
             })},
             <verification_rules>
              Analyze using Chain of Verification:
1. The original query/goal - Verify the exact requirements
2. All steps taken so far - Verify each step was completed successfully
3. The current context - Verify the current state matches expectations
4. The result of the last action - Verify the outcome was correct
5. Values will always be in hexadecimal so convert them to decimal for verification

IMPORTANT RESOURCE RULES:
- If a required resource has 0 balance, mark the goal as complete with failure reason
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
  "newActions": [] // Only include if continuing and resources are available and search <global_context> for more details
}

Do not include any text outside the JSON object. Do not include backticks, markdown formatting, or explanations.

</verification_rules>
                `,
              {
                system: `You are a goal completion analyzer using Chain of Verification. Your task is to carefully evaluate whether a goal has been achieved or is impossible based on the provided context. Use <verification_rules> to guide your analysis.
`,
              }
            );

            console.log(completionCheck);

            try {
              const completion = JSON.parse(completionCheck.toString());
              isComplete = completion.complete;

              if (completion.newActions) {
                // Extract actions from each plan in newActions
                const extractedActions = completion.newActions.flatMap(
                  (plan: any) => plan.actions || []
                );
                pendingActions.unshift(...extractedActions);
              }

              if (isComplete || !completion.shouldContinue) {
                this.addStep(
                  `Goal ${isComplete ? "achieved" : "failed"}: ${
                    completion.reason
                  }`,
                  "system",
                  ["completion"]
                );
                this.emit("think:complete", { query: userQuery });
                return;
              } else {
                this.addStep(
                  `Action completed, continuing execution: ${completion.reason}`,
                  "system",
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
          } catch (error) {
            this.emit("think:error", { query: userQuery, error });
            throw error;
          }
        }

        currentIteration++;
      }

      if (currentIteration >= maxIterations) {
        const error = `Failed to solve query "${userQuery}" within ${maxIterations} iterations`;
        this.logger.error("solveQuery", error);
        this.emit("think:timeout", { query: userQuery });
      }
    } catch (error) {
      this.emit("think:error", { query: userQuery, error });
      throw error;
    }
  }
}

// Add type definitions for the events
export interface ChainOfThoughtEvents {
  step: (step: Step) => void;
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
