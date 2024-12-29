import { describe, test, expect } from "vitest";
import { queryValidator, transactionValidator } from "./validation";

describe("validation", () => {
  test("validates valid LLM response", () => {
    const validResponse = {
      plan: "Test plan",
      actions: [
        {
          type: "GRAPHQL_FETCH",
          payload: { query: "SELECT * FROM test" },
        },
      ],
    };

    expect(queryValidator(validResponse)).toBe(true);
  });

  test("validates response with multiple actions", () => {
    const validResponse = {
      plan: "Multi-step plan",
      actions: [
        {
          type: "GRAPHQL_FETCH",
          payload: { query: "SELECT * FROM test" },
        },
        {
          type: "GAME_MOVE",
          payload: { move: "forward" },
        },
        {
          type: "EXECUTE_TRANSACTION",
          payload: { transactionId: "123" },
        },
      ],
    };

    expect(queryValidator(validResponse)).toBe(true);
  });

  test("rejects response with invalid action type", () => {
    const invalidResponse = {
      plan: "Test plan",
      actions: [
        {
          type: "INVALID_TYPE",
          payload: {},
        },
      ],
    };

    expect(queryValidator(invalidResponse)).toBe(false);
  });

  test("rejects response missing required fields", () => {
    const missingPlan = {
      actions: [],
    };

    const missingActions = {
      plan: "Test plan",
    };

    expect(queryValidator(missingPlan)).toBe(false);
    expect(queryValidator(missingActions)).toBe(false);
  });

  test("rejects response with additional properties", () => {
    const extraProps = {
      plan: "Test plan",
      actions: [],
      extra: "should not be here",
    };

    expect(queryValidator(extraProps)).toBe(false);
  });

  test("validates transaction", () => {
    const validTransaction = {
      contractAddress: "0x123",
      entrypoint: "create",
      calldata: [1, 2, 3],
    };

    expect(transactionValidator(validTransaction)).toBe(true);
  });
});
