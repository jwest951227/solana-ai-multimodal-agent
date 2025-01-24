import { LLMClient } from "./llm-client";
import { Logger } from "./logger";
import { Room } from "./room";
import type { VectorDB } from "./types";

import type {
  Character,
  ProcessedResult,
  SearchResult,
  SuggestedOutput,
} from "./types";
import { LogLevel } from "./types";

import { hashString, validateLLMResponseSchema } from "./utils";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { HandlerRole, type IOHandler } from "./types";

export class Processor {
  private logger: Logger;
  private readonly ioHandlers = new Map<string, IOHandler>();

  constructor(
    private vectorDb: VectorDB,
    private llmClient: LLMClient,
    private character: Character,
    logLevel: LogLevel = LogLevel.ERROR
  ) {
    this.logger = new Logger({
      level: logLevel,
      enableColors: true,
      enableTimestamp: true,
    });
  }

  public registerIOHandler(handler: IOHandler): void {
    this.ioHandlers.set(handler.name, handler);
  }

  async process(content: any, room: Room): Promise<ProcessedResult> {
    this.logger.debug("Processor.process", "Processing content", {
      content,
      roomId: room.id,
    });

    const contentId = this.generateContentId(content);

    const hasProcessed = await this.hasProcessedContent(contentId, room);

    console.log("hasProcessed", hasProcessed);

    if (hasProcessed) {
      return {
        content,
        metadata: {},
        enrichedContext: {
          timeContext: this.getTimeContext(new Date()),
          summary: "",
          topics: [],
          relatedMemories: [],
          sentiment: "neutral",
          entities: [],
          intent: "unknown",
          availableOutputs: Array.from(this.ioHandlers.keys()),
        },
        suggestedOutputs: [],
        alreadyProcessed: true,
      };
    }

    const contentStr =
      typeof content === "string" ? content : JSON.stringify(content);

    // Get related memories first since we'll need them for context
    const relatedMemories = await this.vectorDb.findSimilarInRoom(
      contentStr,
      room.id,
      3
    );

    const prompt = `Analyze the following content and provide a complete analysis:

# New Content to process: 
${contentStr}

# Related Context:
${relatedMemories.map((m: SearchResult) => `- ${m.content}`).join("\n")}

# Use the Character's voice and tone to analyze the content.
${JSON.stringify(this.character)}

# Available Outputs:
${Array.from(this.ioHandlers.entries())
  .filter(([_, handler]) => handler.role === HandlerRole.OUTPUT)
  .map(
    ([name, output]) =>
      `${name}: ${JSON.stringify(zodToJsonSchema(output.schema, name))}`
  )
  .join("\n")}

#Available Actions:
${Array.from(this.ioHandlers.entries())
  .filter(([_, handler]) => handler.role === HandlerRole.ACTION)
  .map(
    ([name, action]) =>
      `${name}: ${JSON.stringify(zodToJsonSchema(action.schema, name))}`
  )
  .join("\n")}

  <thinking id="content_classification">
  1. Content classification and type
  2. Content enrichment (summary, topics, sentiment, entities, intent)
  </thinking>

  <thinking id="output_suggestion">
  1. Suggested outputs/actions based on the available handlers based on the content and the available handlers. 
  2. If the content is a message, use the personality of the character to determine if the output was successful.
  3. If possible you should include summary of the content in the output for the user to avoid more processing.
  </thinking>

`;

    try {
      const result = await validateLLMResponseSchema({
        prompt,
        systemPrompt:
          "You are an expert system that analyzes content and provides comprehensive analysis with appropriate automated responses.",
        schema: z.object({
          classification: z.object({
            contentType: z.string(),
            requiresProcessing: z.boolean(),
            context: z.object({
              topic: z.string(),
              urgency: z.enum(["high", "medium", "low"]),
              additionalContext: z.string(),
            }),
          }),
          enrichment: z.object({
            summary: z.string().max(1000),
            topics: z.array(z.string()).max(20),
            sentiment: z.enum(["positive", "negative", "neutral"]),
            entities: z.array(z.string()),
            intent: z.string().describe("The intent of the content"),
          }),
          suggestedOutputs: z.array(
            z.object({
              name: z.string().describe("The name of the output or action"),
              data: z
                .any()
                .describe("The data that matches the output's schema"),
              confidence: z.number().describe("The confidence score (0-1)"),
              reasoning: z
                .string()
                .describe("The reasoning for the suggestion"),
            })
          ),
        }),
        llmClient: this.llmClient,
        logger: this.logger,
      });

      await this.markContentAsProcessed(contentId, room);

      return {
        content,
        metadata: {
          ...result.classification.context,
          contentType: result.classification.contentType,
        },
        enrichedContext: {
          ...result.enrichment,
          timeContext: this.getTimeContext(new Date()),
          relatedMemories: relatedMemories.map((m: SearchResult) => m.content),
          availableOutputs: Array.from(this.ioHandlers.keys()),
        },
        suggestedOutputs: result.suggestedOutputs as SuggestedOutput<any>[],
        alreadyProcessed: false,
      };
    } catch (error) {
      this.logger.error("Processor.process", "Processing failed", { error });
      return {
        content,
        metadata: {},
        enrichedContext: {
          timeContext: this.getTimeContext(new Date()),
          summary: contentStr.slice(0, 100),
          topics: [],
          relatedMemories: [],
          sentiment: "neutral",
          entities: [],
          intent: "unknown",
          availableOutputs: Array.from(this.ioHandlers.keys()),
        },
        suggestedOutputs: [],
        alreadyProcessed: false,
      };
    }
  }

  private getTimeContext(timestamp: Date): string {
    const now = new Date();
    const hoursDiff = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 24) return "very_recent";
    if (hoursDiff < 72) return "recent";
    if (hoursDiff < 168) return "this_week";
    if (hoursDiff < 720) return "this_month";
    return "older";
  }

  // Helper method to generate a consistent ID for content
  private generateContentId(content: any): string {
    try {
      // 1. Special handling for Twitter mentions/tweets array
      if (Array.isArray(content) && content[0]?.type === "tweet") {
        // Use the newest tweet's ID as the marker
        const newestTweet = content[0];
        return `tweet_batch_${newestTweet.metadata.tweetId}`;
      }

      // 2. Single tweet handling
      if (content?.type === "tweet") {
        return `tweet_${content.metadata.tweetId}`;
      }

      // 3. If it's a plain string, fallback to hashing the string but also add a small random/time factor.
      //    This ensures repeated user messages with the same text won't collapse to the same ID.
      if (typeof content === "string") {
        // Add a short suffix: e.g. timestamp + small random
        const suffix = `${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        return `content_${hashString(content)}_${suffix}`;
      }

      // 4. For arrays (non-tweets), attempt to find known IDs or hash the items
      if (Array.isArray(content)) {
        const ids = content.map((item) => {
          // Check if there's an explicit .id
          if (item.id) return item.id;
          // Check for item.metadata?.id
          if (item.metadata?.id) return item.metadata.id;

          // Otherwise, hash the item
          const relevantData = {
            content: item.content || item,
            type: item.type,
          };
          return hashString(JSON.stringify(relevantData));
        });

        // Join them, but also add a short suffix so different array orders don't collide
        const suffix = `${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        return `array_${ids.join("_").slice(0, 100)}_${suffix}`;
      }

      // 5. For single objects, check .id first
      if (content.id) {
        return `obj_${content.id}`;
      }

      // 6. Special handling for "internal_thought" or "consciousness"
      if (
        content.type === "internal_thought" ||
        content.source === "consciousness"
      ) {
        const thoughtData = {
          content: content.content,
          timestamp: content.timestamp,
        };
        return `thought_${hashString(JSON.stringify(thoughtData))}`;
      }

      // 7. Then check if there's a metadata.id
      if (content.metadata?.id) {
        return `obj_${content.metadata.id}`;
      }

      // 8. Or any metadata key ending with 'id'
      if (content.metadata) {
        for (const [key, value] of Object.entries(content.metadata)) {
          if (key.toLowerCase().endsWith("id") && value) {
            return `obj_${value}`;
          }
        }
      }

      // 9. Finally, fallback to hashing the object,
      //    but add a random/time suffix so repeated content isn't auto-deduplicated.
      const relevantData = {
        content: content.content || content,
        type: content.type,
        // Include source if available
        ...(content.source &&
          content.source !== "consciousness" && {
            source: content.source,
          }),
      };
      const baseHash = hashString(JSON.stringify(relevantData));
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      return `obj_${baseHash}_${suffix}`;
    } catch (error) {
      this.logger.error("Processor.generateContentId", "Error generating ID", {
        error,
        content:
          typeof content === "object" ? JSON.stringify(content) : content,
      });
      return `fallback_${Date.now()}`;
    }
  }

  // Check if we've already processed this content
  private async hasProcessedContent(
    contentId: string,
    room: Room
  ): Promise<boolean> {
    try {
      // Use findSimilarInRoom but with exact metadata matching
      const results = await this.vectorDb.findSimilarInRoom(
        contentId, // Simple query text since we're using metadata matching
        room.id,
        1,
        {
          contentId: contentId,
        }
      );

      return results.length > 0;
    } catch (error) {
      this.logger.error("Processor.hasProcessedContent", "Check failed", {
        error: error instanceof Error ? error.message : String(error),
        contentId,
        roomId: room.id,
      });
      return false;
    }
  }

  // Mark content as processed
  private async markContentAsProcessed(
    contentId: string,
    room: Room
  ): Promise<void> {
    try {
      const markerId = `processed_${contentId}`;

      await this.vectorDb.storeInRoom(
        `Processed marker for content: ${contentId}`,
        room.id,
        {
          type: "processed_marker",
          contentId: contentId,
          timestamp: new Date().toISOString(),
        }
      );

      this.logger.debug(
        "Processor.markContentAsProcessed",
        "Marked content as processed",
        {
          contentId,
          roomId: room.id,
          markerId,
        }
      );
    } catch (error) {
      this.logger.error(
        "Processor.markContentAsProcessed",
        "Failed to mark content",
        {
          error: error instanceof Error ? error.message : String(error),
          contentId,
          roomId: room.id,
        }
      );
      throw error;
    }
  }
}
