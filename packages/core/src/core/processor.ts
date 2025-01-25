import { LLMClient } from "./llm-client";
import { Logger } from "./logger";

import type { Character, ProcessedResult } from "./types";
import { LogLevel } from "./types";

import { type IOHandler } from "./types";

/**
 * Base abstract class for content processors that handle different types of input
 * and generate appropriate responses using LLM.
 */
export abstract class BaseProcessor {
    /** Logger instance for this processor */
    protected logger: Logger;

    /**
     * Creates a new BaseProcessor instance
     * @param metadata - Metadata about this processor including name and description
     * @param loggerLevel - The logging level to use
     * @param character - The character personality to use for responses
     * @param llmClient - The LLM client instance to use for processing
     */
    constructor(
        protected metadata: { name: string; description: string },
        protected loggerLevel: LogLevel = LogLevel.ERROR,
        protected character: Character,
        protected llmClient: LLMClient
    ) {
        this.logger = new Logger({
            level: loggerLevel,
            enableColors: true,
            enableTimestamp: true,
        });
    }

    /**
     * Gets the name of this processor
     * @returns The processor name from metadata
     */
    public getName(): string {
        return this.metadata.name;
    }

    /**
     * Determines if this processor can handle the given content.
     * @param content - The content to check
     * @returns True if this processor can handle the content, false otherwise
     */
    public abstract canHandle(content: any): boolean;

    /**
     * Processes the given content and returns a result.
     * @param content - The content to process
     * @param otherContext - Additional context string to consider during processing
     * @param ioContext - Optional context containing available outputs and actions
     * @param ioContext.availableOutputs - Array of available output handlers
     * @param ioContext.availableActions - Array of available action handlers
     * @returns Promise resolving to the processed result
     */
    public abstract process(
        content: any,
        otherContext: string,
        ioContext?: {
            availableOutputs: IOHandler[];
            availableActions: IOHandler[];
        }
    ): Promise<ProcessedResult>;
}
