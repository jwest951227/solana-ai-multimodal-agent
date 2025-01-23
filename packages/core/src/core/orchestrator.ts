import { Logger } from "./logger";
import { RoomManager } from "./room-manager";
import type { VectorDB } from "../types";
import { LogLevel, type Input, type LoggerConfig, type Output } from "../types";
import type { Processor } from "./processor";
import { TaskScheduler } from "./task-scheduler";

/**
 * Core system that manages inputs, outputs, and processing.
 * Coordinates between input sources, the processor, and output handlers.
 */
export class Orchestrator {
  private readonly inputs = new Map<string, Input & { nextRun: number }>();
  private readonly outputs = new Map<string, Output>();
  private readonly logger: Logger;
  private readonly processor: Processor;
  public readonly vectorDb: VectorDB;

  private readonly inputScheduler: TaskScheduler<Input & { nextRun: number }>;

  /**
   * Creates a new Core instance.
   * @param roomManager - Manager for handling rooms/spaces
   * @param vectorDb - Vector database for storing embeddings
   * @param processor - Processor for handling content
   * @param config - Optional configuration options
   */
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

    this.inputScheduler = new TaskScheduler(async (task) => {
      await this.processInputTask(task);
    });
  }

  /**
   * Registers a new input handler with the system.
   * If the input is recurring (has an interval), it will be scheduled to run repeatedly.
   * @param input The input configuration to register
   */
  public subscribeToInputSource(input: Input): void {
    const now = Date.now();
    const nextRun = input.nextRun ?? now;

    const scheduledInput = { ...input, nextRun };
    this.inputs.set(input.name, scheduledInput);
    this.inputScheduler.scheduleTask(scheduledInput);

    this.logger.info("Core.subscribeToInputSource", "Registered input", {
      name: input.name,
      nextRun,
      interval: input.interval,
    });
  }

  /**
   * Removes a registered input handler.
   * @param name Name of the input to remove
   */
  public unsubscribeFromInputSource(name: string): void {
    const input = this.inputs.get(name);
    if (input) {
      this.inputs.delete(name);
      this.logger.info(
        "Core.unsubscribeFromInputSource",
        `Removed input: ${name}`
      );
    }
  }

  /**
   * Registers a new output handler with the system.
   * @param output The output configuration to register
   */
  public registerOutput(output: Output): void {
    this.logger.info("Core.registerOutput", "Registering output", {
      name: output.name,
    });
    this.outputs.set(output.name, output);
    this.processor.registerAvailableOutput(output);
  }

  /**
   * Removes a registered output handler.
   * @param name Name of the output to remove
   */
  public removeOutputHandler(name: string): void {
    if (this.outputs.has(name)) {
      this.outputs.delete(name);
      this.logger.info("Core.removeOutputHandler", `Removing output: ${name}`);
    }
  }

  /**
   * Handles execution of an input when it's scheduled to run.
   * @param input The input to handle
   * @private
   */
  private async processInputTask(
    input: Input & { nextRun: number }
  ): Promise<void> {
    const { name, interval } = input;

    try {
      const result = await input.handler();
      if (!result) return;

      if (interval && interval > 0) {
        input.nextRun = Date.now() + interval;
        this.inputScheduler.scheduleTask(input);
      } else {
        this.inputs.delete(name);
      }

      const room = await this.roomManager.ensureRoom(name, "core");
      const items = Array.isArray(result) ? result : [result];

      for (const item of items) {
        const processed = await this.processor.process(item, room);
        if (!processed.alreadyProcessed) {
          await this.roomManager.addMemory(
            room.id,
            JSON.stringify(processed.content),
            {
              source: name,
              type: "input",
              ...processed.metadata,
              ...processed.enrichedContext,
            }
          );
        }
      }
    } catch (error) {
      this.logger.error("Core.processInputTask", "Error processing input", {
        name,
        error,
      });
    }
  }

  /**
   * Executes a registered output handler with the provided data.
   * @param name Name of the output to execute
   * @param data Data to pass to the output handler
   * @returns The result of the output handler
   * @template T The type of data the output handler accepts
   */
  public async dispatchToOutput<T>(name: string, data: T): Promise<T> {
    const output = this.outputs.get(name);
    if (!output) {
      throw new Error(`No output registered with name: ${name}`);
    }
    this.logger.debug("Core.dispatchToOutput", "Executing output", {
      name,
      data,
    });

    try {
      return data;
    } catch (error) {
      return error as T;
    }
  }

  /**
   * Stops all scheduled tasks and shuts down the Core system.
   */
  public stop(): void {
    this.inputScheduler.stop();
    this.logger.info("Core.stop", "All scheduled inputs stopped.");
  }
}
