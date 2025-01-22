import { Logger } from "./logger";
import { RoomManager } from "./room-manager";
import type { VectorDB } from "./vector-db";
import { LogLevel } from "../types";
import type { Processor } from "./processor";
import type { z } from "zod";

// Basic Input interface with scheduling details
export interface Input<T = unknown> {
  name: string;
  handler: (...args: unknown[]) => Promise<T>;
  response: z.ZodType<T>;

  /**
   * If set, `interval` means this input is recurring.
   * e.g. 60000 = runs every 60 seconds.
   */
  interval?: number;

  /**
   * For scheduling. If omitted, we schedule it immediately (Date.now()).
   */
  nextRun?: number;
}

export interface Output<T = unknown> {
  name: string;
  handler: (data: T) => Promise<unknown>;
  schema: z.ZodType<T>;
}

export interface CoreConfig {
  logging?: {
    level: LogLevel;
    enableColors?: boolean;
    enableTimestamp?: boolean;
  };
}

/**
 * A small priority-queue-like helper for tasks:
 *   - tasks must have a `nextRun` (epoch ms)
 */
class TaskScheduler<T extends { nextRun: number }> {
  private tasks: T[] = [];
  private timerId?: NodeJS.Timeout;

  constructor(private readonly onTaskDue: (task: T) => Promise<void>) {}

  /**
   * Adds or updates a task in the queue.
   * Then, (re)starts the scheduler with the earliest task.
   */
  public scheduleTask(task: T): void {
    // remove any existing version of the same task
    this.tasks = this.tasks.filter((t) => t !== task);
    // insert
    this.tasks.push(task);
    // sort by nextRun ascending
    this.tasks.sort((a, b) => a.nextRun - b.nextRun);

    this.start();
  }

  /**
   * Clears the current timer and starts a new one
   * for the *soonest* nextRun in the queue.
   */
  private start() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
    if (this.tasks.length === 0) return;

    const now = Date.now();
    // The earliest scheduled task
    const earliestTask = this.tasks[0];
    const delay = Math.max(0, earliestTask.nextRun - now);

    this.timerId = setTimeout(async () => {
      this.timerId = undefined;
      // Pop it from the queue
      const task = this.tasks.shift();
      if (!task) return;

      // Execute
      await this.onTaskDue(task);

      // If there are still tasks, schedule the next
      if (this.tasks.length) {
        this.start();
      }
    }, delay) as unknown as NodeJS.Timeout;
  }

  /**
   * Cancels all scheduled tasks.
   */
  public stop() {
    if (this.timerId) clearTimeout(this.timerId);
    this.tasks = [];
  }
}

export class Core {
  private readonly inputs = new Map<string, Input & { nextRun: number }>();
  private readonly outputs = new Map<string, Output>();
  private readonly logger: Logger;
  private readonly processor: Processor;
  public readonly vectorDb: VectorDB;

  // Our single scheduler for all inputs
  private readonly inputScheduler: TaskScheduler<Input & { nextRun: number }>;

  constructor(
    private readonly roomManager: RoomManager,
    vectorDb: VectorDB,
    processor: Processor,
    config?: CoreConfig
  ) {
    this.vectorDb = vectorDb;
    this.processor = processor;
    this.logger = new Logger(
      config?.logging ?? {
        level: LogLevel.ERROR,
        enableColors: true,
        enableTimestamp: true,
      }
    );

    // Initialize the scheduler, telling it how to run tasks when they're due
    this.inputScheduler = new TaskScheduler(async (task) => {
      await this.handleInput(task);
    });
  }

  /**
   * Registers an input. If it's recurring, we schedule repeated runs.
   * If not, it will run once (by default, immediately).
   */
  public registerInput(input: Input): void {
    const now = Date.now();

    // If nextRun is not set, run it ASAP.
    const nextRun = input.nextRun ?? now;

    // Store it in our map (so we can reference it, remove it, etc.)
    const scheduledInput = { ...input, nextRun };
    this.inputs.set(input.name, scheduledInput);

    // Add to the scheduler
    this.inputScheduler.scheduleTask(scheduledInput);

    this.logger.info("Core.registerInput", "Registered input", {
      name: input.name,
      nextRun,
      interval: input.interval,
    });
  }

  public removeInput(name: string): void {
    const input = this.inputs.get(name);
    if (input) {
      this.inputs.delete(name);
      this.logger.info("Core.removeInput", `Removed input: ${name}`);
    }
  }

  /**
   * Registers an output. This is unchanged from your original flow.
   */
  public registerOutput(output: Output): void {
    this.logger.info("Core.registerOutput", "Registering output", {
      name: output.name,
    });
    this.outputs.set(output.name, output);
    this.processor.registerAvailableOutput(output);
  }

  public removeOutput(name: string): void {
    if (this.outputs.has(name)) {
      this.outputs.delete(name);
      this.logger.info("Core.removeOutput", `Removing output: ${name}`);
    }
  }

  /**
   * Callback for when the scheduler says "it's time" for an input to run.
   */
  private async handleInput(input: Input & { nextRun: number }): Promise<void> {
    const { name, interval } = input;

    try {
      const result = await input.handler();
      if (!result) return;

      // Re-schedule if it's recurring
      if (interval && interval > 0) {
        // Now + interval
        input.nextRun = Date.now() + interval;
        this.inputScheduler.scheduleTask(input);
      } else {
        // It's one-time, so remove from the map
        this.inputs.delete(name);
      }

      // The rest of this function can do the same stuff as your original:
      //   - find the relevant room, run the processor, store memory, etc.
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
          // handle any suggested outputs, etc.
          // ...
        }
      }
    } catch (error) {
      this.logger.error("Core.handleInput", "Error processing input", {
        name,
        error,
      });
    }
  }

  /**
   * Example same 'executeOutput' as before. (Unchanged for brevity.)
   */
  public async executeOutput<T>(name: string, data: T): Promise<T> {
    const output = this.outputs.get(name);
    if (!output) {
      throw new Error(`No output registered with name: ${name}`);
    }
    this.logger.debug("Core.executeOutput", "Executing output", { name, data });

    try {
      // etc.
      return data;
    } catch (error) {
      return error as T;
    }
  }

  /**
   * Stop everything.
   */
  public stop(): void {
    this.inputScheduler.stop();
    this.logger.info("Core.stop", "All scheduled inputs stopped.");
  }
}
