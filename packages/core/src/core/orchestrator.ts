import { Logger } from "./logger";
import { RoomManager } from "./room-manager";
import { TaskScheduler } from "./task-scheduler";
import type { Processor } from "./processor";
import type { VectorDB } from "./types";
import { LogLevel, type LoggerConfig } from "./types";
import type { IOHandler } from "./types";

/**
 * Orchestrator system that manages both "input" and "output" handlers
 * in a unified manner, along with scheduling recurring inputs.
 */
export class Orchestrator {
  /**
   * Unified collection of IOHandlers (both input & output).
   * Keyed by .name
   */
  private readonly ioHandlers = new Map<string, IOHandler>();

  /**
   * A TaskScheduler that only schedules and runs input handlers
   */
  private readonly inputScheduler: TaskScheduler<
    IOHandler & { nextRun: number }
  >;

  private readonly logger: Logger;
  private readonly processor: Processor;

  /**
   * Other references in your system. Adjust as needed.
   */
  public readonly vectorDb: VectorDB;
  constructor(
    private readonly roomManager: RoomManager,
    vectorDb: VectorDB,
    processor: Processor,
    config?: LoggerConfig
  ) {
    this.vectorDb = vectorDb;
    this.processor = processor;

    this.logger = new Logger(
      config ?? {
        level: LogLevel.ERROR,
        enableColors: true,
        enableTimestamp: true,
      }
    );

    // Our TaskScheduler will handle only input-type IOHandlers
    this.inputScheduler = new TaskScheduler(async (handler) => {
      await this.processInputTask(handler);
    });
  }

  /**
   * Primary method to register any IOHandler (input or output).
   * - If it's an input with an interval, schedule it for recurring runs.
   * - Otherwise, just store it in the ioHandlers map.
   */
  public registerIOHandler(handler: IOHandler): void {
    if (this.ioHandlers.has(handler.name)) {
      this.logger.warn(
        "Orchestrator.registerIOHandler",
        "Overwriting handler with same name",
        {
          name: handler.name,
        }
      );
    }
    this.ioHandlers.set(handler.name, handler);

    // If it's an "input" and has an interval, schedule it
    if (handler.role === "input" && handler.interval) {
      // Ensure nextRun is definitely set
      const scheduledHandler = {
        ...handler,
        nextRun: handler.nextRun ?? Date.now(),
      };
      this.inputScheduler.scheduleTask(scheduledHandler);

      this.logger.info(
        "Orchestrator.registerIOHandler",
        "Registered recurring input",
        {
          name: handler.name,
          interval: handler.interval,
          nextRun: scheduledHandler.nextRun,
        }
      );
    } else {
      // Register the handler with the processor
      this.processor.registerIOHandler(handler);

      // For outputs (or non-recurring inputs), just log
      this.logger.info(
        "Orchestrator.registerIOHandler",
        `Registered ${handler.role}`,
        {
          name: handler.name,
        }
      );
    }
  }

  /**
   * Removes a handler (input or output) by name, stopping scheduling if needed.
   */
  public removeIOHandler(name: string): void {
    if (this.ioHandlers.has(name)) {
      // If it was scheduled as an input, it will no longer be re-scheduled
      this.ioHandlers.delete(name);
      this.logger.info(
        "Orchestrator.removeIOHandler",
        `Removed IOHandler: ${name}`
      );
    }
  }

  /**
   * Executes a handler with role="output" by name, passing data to it.
   * This is effectively "dispatchToOutput."
   */
  public async dispatchToOutput<T>(name: string, data: T): Promise<unknown> {
    const handler = this.ioHandlers.get(name);
    if (!handler) {
      throw new Error(`No IOHandler registered with name: ${name}`);
    }

    if (handler.role !== "output") {
      throw new Error(`Handler "${name}" is not an output handler`);
    }

    this.logger.debug("Orchestrator.dispatchToOutput", "Executing output", {
      name,
      data,
    });

    try {
      const result = await handler.handler(data);
      return result;
    } catch (error) {
      this.logger.error(
        "Orchestrator.dispatchToOutput",
        "Handler threw an error",
        {
          name,
          error,
        }
      );
      throw error;
    }
  }

  /**
   * The method the TaskScheduler calls for each scheduled input.
   * We only schedule inputs in the constructor's scheduler.
   */
  private async processInputTask(handler: IOHandler): Promise<void> {
    try {
      const result = await handler.handler();
      if (!result) return;

      // Re-schedule if it’s a recurring input
      if (handler.interval && handler.interval > 0) {
        const scheduledHandler = {
          ...handler,
          nextRun: Date.now() + handler.interval,
        };
        this.inputScheduler.scheduleTask(scheduledHandler);
      } else {
        this.removeIOHandler(handler.name);
      }

      if (Array.isArray(result)) {
        for (const item of result) {
          await this.runAutonomousFlow(item, handler.name);
        }
      } else {
        await this.runAutonomousFlow(result, handler.name);
      }
    } catch (error) {
      this.logger.error(
        "Orchestrator.processInputTask",
        "Error processing input",
        {
          name: handler.name,
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
          handlerType: handler.role,
          interval: handler.interval,
        }
      );
    }
  }
  /**
   * Dispatches data to a registered action handler and returns its result.
   *
   * @param name - The name of the registered action handler to dispatch to
   * @param data - The data to pass to the action handler
   * @returns Promise resolving to the action handler's result
   * @throws Error if no handler is found with the given name or if it's not an action handler
   *
   * @example
   * ```ts
   * // Register an action handler
   * orchestrator.registerIOHandler({
   *   name: "sendEmail",
   *   role: "action",
   *   handler: async (data: {to: string, body: string}) => {
   *     // Send email logic
   *     return {success: true};
   *   }
   * });
   *
   * // Dispatch to the action
   * const result = await orchestrator.dispatchToAction("sendEmail", {
   *   to: "user@example.com",
   *   body: "Hello world"
   * });
   * ```
   */
  public async dispatchToAction<T>(name: string, data: T): Promise<unknown> {
    const handler = this.ioHandlers.get(name);
    if (!handler) {
      throw new Error(`No IOHandler registered with name: ${name}`);
    }
    if (handler.role !== "action") {
      throw new Error(`Handler "${name}" is not an action handler`);
    }
    this.logger.debug("Orchestrator.dispatchToAction", "Executing action", {
      name,
      data,
    });
    try {
      const result = await handler.handler(data);
      return result;
    } catch (error) {
      this.logger.error(
        "Orchestrator.dispatchToAction",
        "Handler threw an error",
        {
          name,
          error,
        }
      );
      throw error;
    }
  }

  /**
   * Takes some incoming piece of data, processes it through the system,
   * and handles any follow-on "action" or "output" suggestions in a chain.
   */
  private async runAutonomousFlow(initialData: unknown, sourceName: string) {
    // We keep a queue of "items" to process
    const queue: Array<{ data: unknown; source: string }> = [
      { data: initialData, source: sourceName },
    ];

    const outputs: Array<{ name: string; data: any }> = [];

    while (queue.length > 0) {
      const { data, source } = queue.shift()!;

      // 1) Ensure there's a room
      const room = await this.roomManager.ensureRoom(source, "core");

      // 2) Process with your existing processor logic
      const processed = await this.processor.process(data, room);

      // If the processor thinks we've already processed it, we skip
      if (processed.alreadyProcessed) {
        continue;
      }

      // 3) Save to memory (like you do in processInputTask)
      await this.roomManager.addMemory(
        room.id,
        JSON.stringify(processed.content),
        {
          source,
          type: "input",
          ...processed.metadata,
          ...processed.enrichedContext,
        }
      );

      // 4) For each suggested output, see if it’s an action or an output
      for (const output of processed.suggestedOutputs) {
        const handler = this.ioHandlers.get(output.name);
        if (!handler) {
          this.logger.warn(
            "No handler found for suggested output",
            output.name
          );
          continue;
        }

        if (handler.role === "output") {
          outputs.push({ name: output.name, data: output.data });

          // Dispatch to an output handler (e.g. send a Slack message)
          await this.dispatchToOutput(output.name, output.data);
        } else if (handler.role === "action") {
          // Execute an action (e.g. fetch data from an API), wait for the result
          const actionResult = await this.dispatchToAction(
            output.name,
            output.data
          );
          // Then feed the result back into the queue, so it will be processed
          if (actionResult) {
            queue.push({
              data: actionResult,
              source: output.name, // or keep the same source, your choice
            });
          }
        } else {
          this.logger.warn(
            "Suggested output has an unrecognized role",
            handler.role
          );
        }
      }
    }
  }

  /**
   * Dispatches data to a registered input handler and processes the result through the autonomous flow.
   *
   * @param name - The name of the input handler to dispatch to
   * @param data - The data to pass to the input handler
   * @returns An array of output suggestions generated from processing the input
   *
   * @example
   * ```ts
   * // Register a chat input handler
   * orchestrator.registerIOHandler({
   *   name: "user_chat",
   *   role: "input",
   *   handler: async (message) => {
   *     return {
   *       type: "chat",
   *       content: message.content,
   *       metadata: { userId: message.userId }
   *     };
   *   }
   * });
   *
   * // Dispatch a message to the chat handler
   * const outputs = await orchestrator.dispatchToInput("user_chat", {
   *   content: "Hello AI!",
   *   userId: "user123"
   * });
   * ```
   *
   * @throws {Error} If no handler is found with the given name
   * @throws {Error} If the handler's role is not "input"
   */
  public async dispatchToInput<T>(name: string, data: T): Promise<unknown> {
    const handler = this.ioHandlers.get(name);
    if (!handler) throw new Error(`No IOHandler: ${name}`);
    if (handler.role !== "input") {
      throw new Error(`Handler "${name}" is not role=input`);
    }
    try {
      const result = await handler.handler(data);
      if (result) {
        // Use our runAutonomousFlow chain approach
        return await this.runAutonomousFlow(result, handler.name);
      }
      return [];
    } catch (error) {
      this.logger.error(
        "dispatchToInput Error",
        `dispatchToInput Error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Stops all scheduled tasks and shuts down the orchestrator.
   */
  public stop(): void {
    this.inputScheduler.stop();
    this.logger.info("Orchestrator.stop", "All scheduled inputs stopped.");
  }
}
