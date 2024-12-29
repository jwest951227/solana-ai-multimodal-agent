import { describe, test, expect, beforeEach, vi } from "vitest";
import { ChainOfThought } from "./chain-of-thought";
import type { CoTStep, CoTAction } from "./validation";
import type { LLMClient } from "./llm-client";

// Create a mock LLMClient
const mockLLMClient: LLMClient = {
  sendMessage: vi.fn().mockResolvedValue("test response"),
  provider: "anthropic",
} as any;

describe("ChainOfThought", () => {
  let cot: ChainOfThought;

  beforeEach(() => {
    cot = new ChainOfThought(mockLLMClient);
  });

  describe("Step Management", () => {
    test("should add a step correctly", () => {
      const step = cot.addStep("Test step", ["test"], { priority: 1 });

      expect(step.content).toBe("Test step");
      expect(step.tags).toEqual(["test"]);
      expect(step.meta).toEqual({ priority: 1 });
      expect(step.id).toBeDefined();
      expect(typeof step.timestamp).toBe("number");
    });

    test("should maintain correct step order", () => {
      const step1 = cot.addStep("First step");
      const step2 = cot.addStep("Second step");
      const step3 = cot.addStep("Third step");

      const steps = cot.getSteps();
      expect(steps).toHaveLength(3);
      expect(steps.map((s) => s.content)).toEqual([
        "First step",
        "Second step",
        "Third step",
      ]);
    });

    test("should insert a step at specific index", () => {
      cot.addStep("First step");
      cot.addStep("Third step");
      const insertedStep = cot.insertStep(1, "Second step");

      const steps = cot.getSteps();
      expect(steps).toHaveLength(3);
      expect(steps[1].content).toBe("Second step");
      expect(steps[1].id).toBe(insertedStep.id);
    });

    test("should insert multiple steps at different positions", () => {
      const step1 = cot.addStep("Step 1");
      const step3 = cot.addStep("Step 3");
      const step5 = cot.addStep("Step 5");

      cot.insertStep(1, "Step 2");
      cot.insertStep(3, "Step 4");

      const steps = cot.getSteps();
      expect(steps).toHaveLength(5);
      expect(steps.map((s) => s.content)).toEqual([
        "Step 1",
        "Step 2",
        "Step 3",
        "Step 4",
        "Step 5",
      ]);
    });

    test("should update step content", () => {
      const step = cot.addStep("Original content");
      cot.updateStepContent(step.id, "Updated content");

      const steps = cot.getSteps();
      expect(steps[0].content).toBe("Updated content");
    });

    test("should throw error when inserting at invalid index", () => {
      expect(() => {
        cot.insertStep(-1, "Invalid step");
      }).toThrow();

      expect(() => {
        cot.insertStep(5, "Invalid step");
      }).toThrow();
    });

    test("should handle step tags correctly", () => {
      const step1 = cot.addStep("Step with tags", ["tag1", "tag2"]);
      const step2 = cot.addStep("Another step", ["tag2", "tag3"]);

      const steps = cot.getSteps();
      expect(steps[0].tags).toEqual(["tag1", "tag2"]);
      expect(steps[1].tags).toEqual(["tag2", "tag3"]);
    });

    test("should handle step metadata", () => {
      const metadata = { priority: 1, category: "test", important: true };
      const step = cot.addStep("Step with metadata", [], metadata);

      const steps = cot.getSteps();
      expect(steps[0].meta).toEqual(metadata);
    });

    test("should remove a step correctly", () => {
      const step1 = cot.addStep("Step 1");
      const step2 = cot.addStep("Step 2");
      const step3 = cot.addStep("Step 3");

      cot.removeStep(step2.id);

      const steps = cot.getSteps();
      expect(steps).toHaveLength(2);
      expect(steps.map((s) => s.content)).toEqual(["Step 1", "Step 3"]);
    });

    test("should throw error when removing non-existent step", () => {
      expect(() => {
        cot.removeStep("non-existent-id");
      }).toThrow();
    });
  });

  describe("Context Management", () => {
    test("should initialize with empty context", () => {
      expect(cot.getContext()).toEqual({
        worldState: "",
        queriesAvailable: "",
        availableActions: "",
      });
    });
  });

  describe("Action Execution", () => {
    test("should handle GRAPHQL_FETCH action", async () => {
      const action: CoTAction = {
        type: "GRAPHQL_FETCH",
        payload: { query: "SELECT * FROM users", variables: { id: 1 } },
      };

      await cot.executeAction(action);
      const steps = cot.getSteps();

      expect(steps).toHaveLength(2); // SQL fetch step + result step
      expect(steps[0].tags).toContain("sql-fetch");
      expect(steps[1].tags).toContain("sql-result");
    });

    test("should handle unknown action type", async () => {
      const action: CoTAction = {
        type: "UNKNOWN_ACTION" as any,
        payload: {},
      };
    });

    test("should handle EXECUTE_TRANSACTION action", async () => {
      const cot = new ChainOfThought(mockLLMClient);
      const validTransaction: CoTAction = {
        type: "EXECUTE_TRANSACTION",
        payload: {
          transaction: {
            contractAddress: "0x1234567890abcdef",
            entrypoint: "execute",
            calldata: [1, 2, 3],
          },
        },
      };

      await expect(cot.executeAction(validTransaction)).resolves.not.toThrow();
    });
  });
});
