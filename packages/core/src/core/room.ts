import { createHash } from "crypto";
import type { RoomMetadata } from "../types";
import type { Memory } from "../types";

/**
 * Represents a room/conversation context that can store memories and metadata.
 */
export class Room {
  /** Unique identifier for the room */
  public readonly id: string;
  /** Collection of memories associated with this room */
  private memories: Memory[] = [];
  /** Metadata about the room like name, description, participants etc */
  private metadata: RoomMetadata;

  /**
   * Creates a new Room instance
   * @param platformId - Platform-specific identifier (e.g. tweet thread ID, chat ID)
   * @param platform - Platform name where this room exists
   * @param metadata - Optional metadata to initialize the room with
   */
  constructor(
    public readonly platformId: string,
    public readonly platform: string,
    metadata?: Partial<RoomMetadata>
  ) {
    this.id = Room.createDeterministicId(platform, platformId);

    this.metadata = {
      name: metadata?.name || `Room ${platformId}`,
      description: metadata?.description,
      participants: metadata?.participants || [],
      createdAt: metadata?.createdAt || new Date(),
      lastActive: metadata?.lastActive || new Date(),
      metadata: metadata?.metadata,
    };
  }

  /**
   * Creates a deterministic room ID based on platform and platformId
   * @param platform - Platform name
   * @param platformId - Platform-specific identifier
   * @returns A deterministic room ID string
   */
  public static createDeterministicId(
    platform: string,
    platformId: string
  ): string {
    const hash = createHash("sha256")
      .update(`${platform}:${platformId}`)
      .digest("hex")
      .slice(0, 16);

    return `${platform}_${hash}`;
  }

  /**
   * Adds a new memory to the room
   * @param content - Content of the memory
   * @param metadata - Optional metadata for the memory
   * @returns The created Memory object
   */
  public async addMemory(
    content: string,
    metadata?: Record<string, any>
  ): Promise<Memory> {
    // Create deterministic memory ID based on room ID and content
    const memoryId = Room.createDeterministicMemoryId(this.id, content);

    const memory: Memory = {
      id: memoryId,
      roomId: this.id,
      content,
      timestamp: new Date(),
      metadata,
    };

    this.memories.push(memory);
    this.metadata.lastActive = new Date();

    return memory;
  }

  /**
   * Creates a deterministic memory ID based on room ID and content
   * @param roomId - ID of the room
   * @param content - Content of the memory
   * @returns A deterministic memory ID string
   */
  public static createDeterministicMemoryId(
    roomId: string,
    content: string
  ): string {
    const hash = createHash("sha256")
      .update(`${roomId}:${content}`)
      .digest("hex")
      .slice(0, 16);

    return `mem_${hash}`;
  }

  /**
   * Retrieves memories from the room
   * @param limit - Optional limit on number of memories to return
   * @returns Array of Memory objects
   */
  public getMemories(limit?: number): Memory[] {
    return limit ? this.memories.slice(-limit) : this.memories;
  }

  /**
   * Gets a copy of the room's metadata
   * @returns Copy of room metadata
   */
  public getMetadata(): RoomMetadata {
    return { ...this.metadata };
  }

  /**
   * Updates the room's metadata
   * @param update - Partial metadata object with fields to update
   */
  public updateMetadata(update: Partial<RoomMetadata>): void {
    this.metadata = {
      ...this.metadata,
      ...update,
      lastActive: new Date(),
    };
  }

  /**
   * Converts the room instance to a plain object
   * @returns Plain object representation of the room
   */
  public toJSON() {
    return {
      id: this.id,
      platformId: this.platformId,
      platform: this.platform,
      metadata: this.metadata,
      memories: this.memories,
    };
  }
}
