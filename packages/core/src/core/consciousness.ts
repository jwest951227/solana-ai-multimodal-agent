import { Logger } from "./logger";
import { LLMClient } from "./llm-client";
import { type Room } from "./room";
import { type RoomManager } from "./room-manager";
import {
  LogLevel,
  type Thought,
  type ThoughtTemplate,
  type ThoughtType,
} from "./types";
import { validateLLMResponseSchema } from "./utils";
import { z } from "zod";

export class Consciousness {
  private static readonly ROOM_ID = "consciousness_main";

  private logger: Logger;
  private thoughtInterval: NodeJS.Timer | null = null;

  private thoughtTemplates: Map<ThoughtType, ThoughtTemplate> = new Map([
    [
      "social_share",
      {
        type: "social_share",
        description: "Generate engaging social media content",
        prompt: `Generate content suitable for social sharing based on recent observations or insights.`,
        temperature: 0.8,
      },
    ],
    [
      "research",
      {
        type: "research",
        description: "Identify topics requiring deeper investigation",
        prompt: `Analyze recent information and identify topics that warrant deeper research.
Consider:
- Emerging patterns or trends
- Unclear or conflicting information
- Knowledge gaps that could be valuable to fill
- Potential opportunities or risks`,
        temperature: 0.7,
      },
    ],
    [
      "analysis",
      {
        type: "analysis",
        description: "Analyze patterns and generate insights",
        prompt: `Review recent information and identify meaningful patterns or insights.
Focus on:
- Market trends and opportunities
- User behavior patterns
- System performance metrics
- Emerging risks or issues`,
        temperature: 0.6,
      },
    ],
  ]);

  constructor(
    private llmClient: LLMClient,
    private roomManager: RoomManager,
    private config: {
      intervalMs?: number;
      minConfidence?: number;
      logLevel?: LogLevel;
    } = {}
  ) {
    this.logger = new Logger({
      level: config.logLevel || LogLevel.INFO,
      enableColors: true,
      enableTimestamp: true,
    });
  }

  public async start(): Promise<Thought> {
    return this.think();
  }

  public async stop(): Promise<void> {
    if (this.thoughtInterval) {
      clearInterval(this.thoughtInterval);
      this.thoughtInterval = null;
    }
    this.logger.info("Consciousness.stop", "Internal thought process stopped");
  }

  private async think(): Promise<Thought> {
    try {
      const thought = await this.generateThought();

      if (thought.confidence >= (this.config.minConfidence || 0.7)) {
        return {
          type: "internal_thought",
          source: "consciousness",
          content: thought.content,
          timestamp: thought.timestamp,
          confidence: thought.confidence,
          metadata: {
            ...thought.context,
            confidence: thought.confidence,
            suggestedActions: thought.context?.suggestedActions || [],
            roomId: Consciousness.ROOM_ID,
          },
        };
      } else {
        this.logger.debug(
          "Consciousness.think",
          "Thought below confidence threshold",
          {
            confidence: thought.confidence,
            threshold: this.config.minConfidence,
          }
        );
        // Return a default thought object when confidence is too low
        return {
          type: "low_confidence",
          source: "consciousness",
          content: "Thought was below confidence threshold",
          timestamp: new Date(),
          confidence: thought.confidence,
          metadata: {
            confidence: thought.confidence,
            threshold: this.config.minConfidence || 0.7,
          },
        };
      }
    } catch (error) {
      this.logger.error("Consciousness.think", "Error in thought process", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Return error thought object
      return {
        type: "error",
        source: "consciousness",
        content: "Error occurred during thought process",
        timestamp: new Date(),
        confidence: 0,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async generateThought(): Promise<Thought> {
    const recentMemories = this.getRecentMemories(
      await this.roomManager.listRooms()
    );

    const thoughtType = await this.determineThoughtType(recentMemories);

    const template = this.thoughtTemplates.get(thoughtType);

    if (!template) {
      throw new Error(`No template found for thought type: ${thoughtType}`);
    }

    const prompt = `${template.prompt}

    # Recent Memories
    ${recentMemories.map((m) => `- ${m.content}`).join("\n")}

    Only return the JSON object, no other text.
    `;

    const response = await validateLLMResponseSchema({
      prompt,
      systemPrompt: `
      You are a thoughtful AI assistant that analyzes recent memories and generates meaningful insights. Your role is to:

      1. Carefully evaluate the provided memories and identify key patterns, trends and relationships
      2. Generate relevant thoughts that demonstrate understanding of context and nuance
      3. Assess confidence based on evidence quality and reasoning strength
      4. Consider multiple perspectives and potential implications
      5. Focus on actionable insights that could drive meaningful outcomes

      Base your thoughts on the concrete evidence in the memories while maintaining appropriate epistemic uncertainty.

      Only return the JSON object, no other text.
      `,
      schema: z.object({
        thought: z.string(),
        confidence: z.number(),
        reasoning: z.string(),
        context: z.object({
          mood: z.enum(["contemplative", "playful", "analytical"]),
          platform: z.enum(["twitter", "telegram", "discord"]),
          topics: z.array(z.string()),
          urgency: z.enum(["low", "medium", "high"]).optional(),
          domain: z.enum(["tech", "finance", "science", "other"]).optional(),
          currentKnowledge: z.string().optional(),
          dataPoints: z.array(z.any()).optional(),
          timeframe: z.string().optional(),
          reliability: z.enum(["low", "medium", "high"]).optional(),
        }),
        suggestedActions: z.array(
          z.object({
            type: z.enum([
              "tweet",
              "message",
              "post",
              "research_query",
              "data_analysis",
              "expert_consult",
              "alert",
              "report",
              "action_recommendation",
            ]),
            platform: z.string().optional(),
            priority: z.number(),
            parameters: z.object({
              sources: z.array(z.string()).optional(),
              timeframe: z.string().optional(),
              specific_questions: z.array(z.string()).optional(),
              metrics: z.record(z.any()).optional(),
              recommendations: z.array(z.string()).optional(),
            }),
          })
        ),
      }),
      llmClient: this.llmClient,
      logger: this.logger,
    });

    return {
      content: response.thought,
      confidence: response.confidence,
      type: thoughtType,
      source: "consciousness",
      context: {
        reasoning: response.reasoning,
        ...response.context,
        type: thoughtType,
        suggestedActions: response.suggestedActions,
      },
      timestamp: new Date(),
    };
  }

  private async determineThoughtType(
    memories: Array<{ content: string; roomId: string }>
  ): Promise<ThoughtType> {
    // If no memories, default to social_share to generate initial content
    if (memories.length === 0) {
      return "social_share";
    }

    const prompt = `Analyze these recent memories and determine the most appropriate type of thought to generate next.

Recent memories:
${memories.map((m) => `- ${m.content}`).join("\n")}

Available thought types:
1. social_share: For generating engaging social media content, observations, or insights worth sharing
2. research: For identifying topics that need deeper investigation or understanding
3. analysis: For recognizing patterns, trends, or correlations in data/behavior
4. alert: For flagging important issues or opportunities that need attention
5. inquiry: For generating questions or seeking clarification on unclear topics

Consider:
- Patterns or trends in the conversations
- Knowledge gaps that need research
- Urgent matters requiring alerts
- Interesting insights worth sharing
- Complex topics needing analysis
`;

    const response = await validateLLMResponseSchema({
      prompt,
      systemPrompt: `You are the brain of an agent that reasons about it's memories. You are an expert at analyzing data and making decisions. You like predicting what will happen next, and you are very good at it. You base your decisions on the context factors provided to you. You speak plain and to the point, with a dry sense of humor.`,
      schema: z.object({
        selectedType: z.enum([
          "social_share",
          "research",
          "analysis",
          "alert",
          "inquiry",
        ]),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
        contextualFactors: z.object({
          urgency: z.enum(["low", "medium", "high"]),
          complexity: z.enum(["low", "medium", "high"]),
          socialRelevance: z.enum(["low", "medium", "high"]),
          knowledgeGaps: z.array(z.string()),
          identifiedPatterns: z.array(z.string()),
        }),
      }),
      llmClient: this.llmClient,
      logger: this.logger,
    });

    // Log the decision-making process
    this.logger.debug(
      "Consciousness.determineThoughtType",
      "Thought type selection",
      {
        selectedType: response.selectedType,
        confidence: response.confidence,
        reasoning: response.reasoning,
        factors: response.contextualFactors,
      }
    );

    if (response.contextualFactors.urgency === "high") {
      return "alert";
    }

    if (response.contextualFactors.knowledgeGaps.length > 2) {
      return "research";
    }

    if (response.contextualFactors.complexity === "high") {
      return "analysis";
    }

    if (response.confidence >= 0.7) {
      return response.selectedType as ThoughtType;
    }

    // Fallback to random selection if confidence is low
    const types = Array.from(this.thoughtTemplates.keys());
    return types[Math.floor(Math.random() * types.length)];
  }

  private getRecentMemories(
    rooms: Room[],
    limit: number = 10
  ): Array<{ content: string; roomId: string }> {
    const allMemories: Array<{
      content: string;
      roomId: string;
      timestamp: Date;
    }> = [];

    for (const room of rooms) {
      const memories = room.getMemories(5); // Get last 5 memories from each room
      allMemories.push(
        ...memories.map((m) => ({
          content: m.content,
          roomId: room.id,
          timestamp: m.timestamp,
        }))
      );
    }

    // Sort by timestamp and take the most recent ones
    return allMemories
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map(({ content, roomId }) => ({ content, roomId }));
  }
}
