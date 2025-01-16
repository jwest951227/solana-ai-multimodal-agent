import { LLMClient } from "./llm-client";
import { Logger } from "./logger";
import { Room } from "./room";
import type { VectorDB } from "./vector-db";
import type { Character } from "./character";
import type { SearchResult } from "../types";
import { LogLevel } from "../types";

export interface ProcessedResult {
  content: any;
  metadata: Record<string, any>;
  enrichedContext: EnrichedContext;
}

export interface EnrichedContext {
  timeContext: string;
  summary: string;
  topics: string[];
  relatedMemories: string[];
  sentiment?: string;
  entities?: string[];
  intent?: string;
  similarMessages?: any[];
  metadata?: Record<string, any>;
}

interface EnrichedContent {
  originalContent: string;
  timestamp: Date;
  context: EnrichedContext;
}

// Type guard for VectorDB with room methods
interface VectorDBWithRooms extends VectorDB {
  storeInRoom: (
    content: string,
    roomId: string,
    metadata?: Record<string, any>
  ) => Promise<void>;
  findSimilarInRoom: (
    content: string,
    roomId: string,
    limit?: number,
    metadata?: Record<string, any>
  ) => Promise<SearchResult[]>;
}

function hasRoomSupport(vectorDb: VectorDB): vectorDb is VectorDBWithRooms {
  return "storeInRoom" in vectorDb && "findSimilarInRoom" in vectorDb;
}

export class Processor {
  private logger: Logger;

  constructor(
    private vectorDb: VectorDB,
    private llmClient: LLMClient,
    private character: Character,
    logLevel: LogLevel = LogLevel.INFO
  ) {
    this.logger = new Logger({
      level: logLevel,
      enableColors: true,
      enableTimestamp: true,
    });
  }

  async process(content: any, room: Room): Promise<ProcessedResult> {
    this.logger.debug("Processor.process", "Processing content", {
      content,
      roomId: room.id,
    });

    // First, classify the content
    const contentClassification = await this.classifyContent(content);

    // Second, enrich content
    const enrichedContent = await this.enrichContent(content, room, new Date());

    // Store in vector DB if supported
    if (hasRoomSupport(this.vectorDb)) {
      await this.vectorDb.storeInRoom(
        typeof content === "string" ? content : JSON.stringify(content),
        room.id,
        {
          ...contentClassification.context,
          ...enrichedContent.context,
        }
      );
    }

    return {
      content,
      metadata: {
        ...contentClassification.context,
        contentType: contentClassification.contentType,
      },
      enrichedContext: enrichedContent.context,
    };
  }

  private async classifyContent(content: any): Promise<{
    contentType: string;
    context: Record<string, any>;
  }> {
    const contentStr =
      typeof content === "string" ? content : JSON.stringify(content);

    const prompt = `Classify the following content and provide context:

Content: "${contentStr}"

Determine:
1. What type of content this is (data, message, event, etc.)
2. What kind of processing it requires
3. Any relevant context

Return JSON only:
{
  "contentType": "data|message|event|etc",
  "requiresProcessing": boolean,
  "context": {
    "topic": "string",
    "urgency": "high|medium|low",
    "additionalContext": "string"
  }
}`;

    const classification = await this.llmClient.analyze(prompt, {
      system: "You are an expert content classifier.",
      temperature: 0.3,
      formatResponse: true,
    });

    return typeof classification === "string"
      ? JSON.parse(this.stripCodeBlock(classification))
      : classification;
  }

  private stripCodeBlock(text: string): string {
    text = text
      .replace(/^```[\w]*\n/, "")
      .replace(/\n```$/, "")
      .trim();

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    return jsonMatch ? jsonMatch[0] : text;
  }

  private async enrichContent(
    content: any,
    room: Room,
    timestamp: Date
  ): Promise<EnrichedContent> {
    const contentStr =
      typeof content === "string" ? content : JSON.stringify(content);

    // Get related memories if supported
    const relatedMemories = hasRoomSupport(this.vectorDb)
      ? await this.vectorDb.findSimilarInRoom(contentStr, room.id, 3)
      : [];

    const prompt = `Analyze the following content and provide enrichment:

Content: "${contentStr}"

Related Context:
${relatedMemories.map((m: SearchResult) => `- ${m.content}`).join("\n")}

Provide a JSON response with:
1. A brief summary (max 100 chars)
2. Key topics mentioned (max 5)
3. Sentiment analysis
4. Named entities
5. Detected intent/purpose

Response format:
{
  "summary": "Brief summary here",
  "topics": ["topic1", "topic2"],
  "sentiment": "positive|negative|neutral",
  "entities": ["entity1", "entity2"],
  "intent": "purpose of the content"
}

Return only valid JSON, no other text.`;

    try {
      const enrichment = await this.llmClient.analyze(prompt, {
        system: this.character.voice.tone,
        temperature: 0.3,
        formatResponse: true,
      });

      let result;
      try {
        const cleanJson =
          typeof enrichment === "string"
            ? this.stripCodeBlock(enrichment)
            : enrichment;

        result =
          typeof cleanJson === "string" ? JSON.parse(cleanJson) : cleanJson;

        if (!result.summary || !Array.isArray(result.topics)) {
          throw new Error("Invalid response structure");
        }
      } catch (parseError) {
        this.logger.warn(
          "Processor.enrichContent",
          "Failed to parse LLM response, retrying",
          { error: parseError }
        );

        const retryPrompt = `${prompt}\n\nIMPORTANT: Respond with ONLY the JSON object.`;
        const retryResponse = await this.llmClient.analyze(retryPrompt, {
          system: this.character.voice.tone,
          temperature: 0.2,
          formatResponse: true,
        });

        result =
          typeof retryResponse === "string"
            ? JSON.parse(this.stripCodeBlock(retryResponse))
            : retryResponse;
      }

      return {
        originalContent: contentStr,
        timestamp,
        context: {
          timeContext: this.getTimeContext(timestamp),
          summary: result.summary || contentStr.slice(0, 100),
          topics: Array.isArray(result.topics) ? result.topics : [],
          relatedMemories: relatedMemories.map((m: SearchResult) => m.content),
          sentiment: result.sentiment || "neutral",
          entities: Array.isArray(result.entities) ? result.entities : [],
          intent: result.intent || "unknown",
        },
      };
    } catch (error) {
      this.logger.error("Processor.enrichContent", "Enrichment failed", {
        error,
      });

      return {
        originalContent: contentStr,
        timestamp,
        context: {
          timeContext: this.getTimeContext(timestamp),
          summary: contentStr.slice(0, 100),
          topics: [],
          relatedMemories: relatedMemories.map((m: SearchResult) => m.content),
          sentiment: "neutral",
          entities: [],
          intent: "unknown",
        },
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
}
