import Ajv from "ajv";

/**
 * Represents a single "step" in the Chain of Thought.
 */
export interface CoTStep {
  id: string; // Unique ID for referencing the step
  content: string; // Textual explanation, reasoning, or context
  timestamp: number; // When this step was added
  tags?: string[]; // Categorization of the step
  meta?: Record<string, any>; // Arbitrary metadata for additional info
}

/**
 * ChainOfThoughtContext can hold any relevant data
 * the LLM or game might need to keep track of during reasoning.
 */
export interface ChainOfThoughtContext {
  // For example, a game state might have player info, world state, etc.
  worldState: string;
  queriesAvailable: string;
  availableActions: string;
}

/**
 * Different action types the CoT might execute.
 * You can expand or modify as needed.
 */
export type CoTActionType = "GRAPHQL_FETCH" | "EXECUTE_TRANSACTION";

/**
 * Data necessary for a particular action type.
 * Extend this to fit your actual logic.
 */
export interface CoTAction {
  type: CoTActionType;
  payload?: Record<string, any>;
}

export interface LLMStructuredResponse {
  plan: string; // A textual plan or reasoning
  metadata?: Record<string, any>;
  actions: CoTAction[]; // A list of actions to be executed
  isComplete: boolean; // Whether the task is complete
}

export interface CoTTransaction {
  contractAddress: string; // Contract address to call
  entrypoint: string; // Contract entrypoint/function name
  calldata: (string | number | Array<number>)[]; // Arguments to pass to the contract
}

const queryValidatorSchema = {
  type: "object",
  properties: {
    plan: { type: "string" },
    meta: {
      type: "object",
      properties: {
        requirements: {
          type: "object",
          properties: {
            resources: {
              type: "object",
              additionalProperties: { type: "number" },
            },
            population: { type: "number" },
          },
        },
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["GRAPHQL_FETCH", "EXECUTE_TRANSACTION"],
          },
          payload: {
            type: "object",
          },
        },
        required: ["type", "payload"],
      },
    },
  },
  required: ["plan", "actions"],
  additionalProperties: false,
};

export const queryValidator = (data: any) => {
  const validator = new Ajv().compile(queryValidatorSchema);
  const isValid = validator(data);
  if (!isValid) {
    console.error("Query validation failed:", validator.errors);
  }
  return isValid;
};

const transactionValidatorSchema = {
  type: "object",
  properties: {
    contractAddress: { type: "string" },
    entrypoint: { type: "string" },
    calldata: { type: "array" },
  },
  required: ["contractAddress", "entrypoint", "calldata"],
  additionalProperties: false,
};

export const transactionValidator = (data: any) => {
  const validator = new Ajv().compile(transactionValidatorSchema);
  return validator(data);
};
