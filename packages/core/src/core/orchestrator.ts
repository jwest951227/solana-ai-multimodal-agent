import { Logger } from "./logger";
import { RoomManager } from "./room-manager";
import { TaskScheduler } from "./task-scheduler";
import type { Processor } from "./processor";
import type { VectorDB } from "../types"; // If you rely on VectorDB from here
import { LogLevel, type LoggerConfig } from "../types";
import type { z } from "zod";

/**
 * A single interface for all Inputs, Outputs.
 */
export interface IOHandler {
  /** Unique name for this handler */
  name: string;

  /** "input" | "output" | (optionally "action") if you want more roles */
  role: "input" | "output";

  /** For input handlers with recurring scheduling */
  interval?: number;

  /** The schema for the input handler */
  schema: z.ZodType<any>;

  /** Next run time (timestamp in ms); for input scheduling. */
  nextRun?: number;

  /** The main function. For inputs, no payload is typically passed. For outputs, pass the data. */
  handler: (payload?: unknown) => Promise<unknown>;
}

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

    // Optionally validate data with a schema if you had one
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

      if (handler.interval && handler.interval > 0) {
        // Create a new handler object with definite nextRun
        const scheduledHandler = {
          ...handler,
          nextRun: Date.now() + handler.interval,
        };
        this.inputScheduler.scheduleTask(scheduledHandler);
      } else {
        this.removeIOHandler(handler.name);
      }

      const room = await this.roomManager.ensureRoom(handler.name, "core");
      const items = Array.isArray(result) ? result : [result];

      for (const item of items) {
        const processed = await this.processor.process(item, room);

        if (!processed.alreadyProcessed) {
          for (const output of processed.suggestedOutputs) {
            await this.dispatchToOutput(output.name, output.data);
          }

          await this.roomManager.addMemory(
            room.id,
            JSON.stringify(processed.content),
            {
              source: handler.name,
              type: "input",
              ...processed.metadata,
              ...processed.enrichedContext,
            }
          );
        }
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
   * Stops all scheduled tasks and shuts down the orchestrator.
   */
  public stop(): void {
    this.inputScheduler.stop();
    this.logger.info("Orchestrator.stop", "All scheduled inputs stopped.");
  }
}
