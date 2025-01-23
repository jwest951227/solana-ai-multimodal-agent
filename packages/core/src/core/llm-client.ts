/**
 * Core LLM client module for interacting with various AI providers
 * @module LLMClient
 */

import { setTimeout } from "timers/promises";
import { EventEmitter } from "events";
import type {
  AnalysisOptions,
  LLMClientConfig,
  LLMResponse,
  StructuredAnalysis,
} from "../types";
import { generateText } from "ai";

import { openai } from "@ai-sdk/openai";
import { azure } from "@ai-sdk/azure";
import { anthropic } from "@ai-sdk/anthropic";
import { bedrock } from "@ai-sdk/amazon-bedrock";
import { google } from "@ai-sdk/google";
import { vertex } from "@ai-sdk/google-vertex";
import { mistral } from "@ai-sdk/mistral";
import { xai } from "@ai-sdk/xai";
import { togetherai } from "@ai-sdk/togetherai";
import { cohere } from "@ai-sdk/cohere";
import { fireworks } from "@ai-sdk/fireworks";
import { deepinfra } from "@ai-sdk/deepinfra";
import { deepseek } from "@ai-sdk/deepseek";
import { cerebras } from "@ai-sdk/cerebras";
import { groq } from "@ai-sdk/groq";
import { openrouter } from "@openrouter/ai-sdk-provider";

/** Mapping of provider names to their implementations */
type ProviderMap = {
  openai: typeof openai;
  azure: typeof azure;
  anthropic: typeof anthropic;
  bedrock: typeof bedrock;
  google: typeof google;
  vertex: typeof vertex;
  mistral: typeof mistral;
  xai: typeof xai;
  togetherai: typeof togetherai;
  cohere: typeof cohere;
  fireworks: typeof fireworks;
  deepinfra: typeof deepinfra;
  deepseek: typeof deepseek;
  cerebras: typeof cerebras;
  groq: typeof groq;
  openrouter: typeof openrouter;
};

const providers: ProviderMap = {
  openai,
  azure,
  anthropic,
  bedrock,
  google,
  vertex,
  mistral,
  xai,
  togetherai,
  cohere,
  fireworks,
  deepinfra,
  deepseek,
  cerebras,
  groq,
  openrouter,
};

/** Function type for provider model initialization */
type ProviderFunction<T> = (modelId: string, config?: any) => T;

/**
 * Main client class for interacting with LLM providers
 * @extends EventEmitter
 */
export class LLMClient extends EventEmitter {
  private readonly config: Required<LLMClientConfig>;
  private readonly provider: keyof ProviderMap;

  /**
   * Creates a new LLM client instance - supports all major LLM providers
   * @param config - Configuration options for the client
   * @param config.model - Model identifier in format "provider/model". Popular models:
   *   - OpenAI: openai/o1 | openai/o1-2024-12-17 | openai/o1-mini | openai/o1-mini-2024-09-12 | openai/o1-preview | openai/o1-preview-2024-09-12 | openai/gpt-4o | openai/gpt-4o-2024-05-13 | openai/gpt-4o-2024-08-06 | openai/gpt-4o-2024-11-20 | openai/gpt-4o-audio-preview | openai/gpt-4o-audio-preview-2024-10-01 | openai/gpt-4o-audio-preview-2024-12-17 | openai/gpt-4o-mini | openai/gpt-4o-mini-2024-07-18 | openai/gpt-4-turbo | openai/gpt-4-turbo-2024-04-09 | openai/gpt-4-turbo-preview | openai/gpt-4-0125-preview | openai/gpt-4-1106-preview | openai/gpt-4 | openai/gpt-4-0613 | openai/gpt-3.5-turbo-0125 | openai/gpt-3.5-turbo | openai/gpt-3.5-turbo-1106
   *   - Anthropic: anthropic/claude-3-5-sonnet-latest | anthropic/claude-3-5-sonnet-20241022 | anthropic/claude-3-5-sonnet-20240620 | anthropic/claude-3-5-haiku-latest | anthropic/claude-3-5-haiku-20241022 | anthropic/claude-3-opus-latest | anthropic/claude-3-opus-20240229 | anthropic/claude-3-sonnet-20240229 | anthropic/claude-3-haiku-20240307
   *   - Google: google/gemini-2.0-flash-exp | google/gemini-1.5-flash | google/gemini-1.5-flash-latest | google/gemini-1.5-flash-001 | google/gemini-1.5-flash-002 | google/gemini-1.5-flash-exp-0827 | google/gemini-1.5-flash-8b | google/gemini-1.5-flash-8b-latest | google/gemini-1.5-flash-8b-exp-0924 | google/gemini-1.5-flash-8b-exp-0827 | google/gemini-1.5-pro-latest | google/gemini-1.5-pro | google/gemini-1.5-pro-001 | google/gemini-1.5-pro-002 | google/gemini-1.5-pro-exp-0827 | google/gemini-1.0-pro
   *   - Mistral: mistral/ministral-3b-latest | mistral/ministral-8b-latest | mistral/mistral-large-latest | mistral/mistral-small-latest | mistral/pixtral-large-latest | mistral/pixtral-12b-2409 | mistral/open-mistral-7b | mistral/open-mixtral-8x7b | mistral/open-mixtral-8x22b
   *   - Azure: azure/gpt-4, azure/gpt-35-turbo etc like OpenAI
   *   - Cohere: cohere/command-r-plus | cohere/command-r-plus-08-2024 | cohere/command-r | cohere/command-r-08-2024 | cohere/command-r-03-2024 | cohere/command | cohere/command-nightly | cohere/command-light | cohere/command-light-nightly
   *   - Together AI: togetherai/meta-llama/Llama-3.3-70B-Instruct-Turbo | togetherai/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo | togetherai/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo | togetherai/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo | togetherai/meta-llama/Meta-Llama-3-8B-Instruct-Turbo | togetherai/meta-llama/Meta-Llama-3-70B-Instruct-Turbo | togetherai/meta-llama/Llama-3.2-3B-Instruct-Turbo | togetherai/meta-llama/Meta-Llama-3-8B-Instruct-Lite | togetherai/meta-llama/Meta-Llama-3-70B-Instruct-Lite | togetherai/meta-llama/Llama-3-8b-chat-hf | togetherai/meta-llama/Llama-3-70b-chat-hf | togetherai/nvidia/Llama-3.1-Nemotron-70B-Instruct-HF | togetherai/Qwen/Qwen2.5-Coder-32B-Instruct | togetherai/Qwen/QwQ-32B-Preview | togetherai/microsoft/WizardLM-2-8x22B | togetherai/google/gemma-2-27b-it | togetherai/google/gemma-2-9b-it | togetherai/databricks/dbrx-instruct | togetherai/deepseek-ai/deepseek-llm-67b-chat | togetherai/deepseek-ai/DeepSeek-V3 | togetherai/google/gemma-2b-it | togetherai/Gryphe/MythoMax-L2-13b | togetherai/meta-llama/Llama-2-13b-chat-hf | togetherai/mistralai/Mistral-7B-Instruct-v0.1 | togetherai/mistralai/Mistral-7B-Instruct-v0.2 | togetherai/mistralai/Mistral-7B-Instruct-v0.3 | togetherai/mistralai/Mixtral-8x7B-Instruct-v0.1 | togetherai/mistralai/Mixtral-8x22B-Instruct-v0.1 | togetherai/NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO | togetherai/Qwen/Qwen2.5-7B-Instruct-Turbo | togetherai/Qwen/Qwen2.5-72B-Instruct-Turbo | togetherai/Qwen/Qwen2-72B-Instruct | togetherai/upstage/SOLAR-10.7B-Instruct-v1.0

   * @param config.maxRetries - Maximum number of retry attempts (default: 3)
   * @param config.timeout - Request timeout in milliseconds (default: 30000)
   * @param config.temperature - Sampling temperature between 0-1 (default: 0.3)
   * @param config.maxTokens - Maximum tokens in response (default: 1000)
   * @param config.baseDelay - Base delay for retries in ms (default: 1000)
   * @param config.maxDelay - Maximum delay for retries in ms (default: 10000)
   * @example
   * ```typescript
   * const llm = new LLMClient({
   *   model: "openai/gpt-4-turbo-preview",
   *   temperature: 0.7,
   *   maxTokens: 2000,
   *   maxRetries: 5
   * });
   * ```
   */
  constructor(config: LLMClientConfig) {
    super();
    this.setMaxListeners(50);

    this.provider = this.extractProvider(
      config.model || this.getDefaultModel()
    );

    this.config = {
      model: config.model || this.getDefaultModel(),
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 30000,
      temperature: config.temperature || 0.3,
      maxTokens: config.maxTokens || 1000,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 10000,
    };

    this.initializeClient();
  }

  private initializeClient(): void {}

  /**
   * Extracts the provider name from a model identifier
   * @param model - Full model identifier string
   * @returns Provider name
   */
  private extractProvider(model: string): keyof ProviderMap {
    if (model.includes(":")) {
      return "openrouter";
    }

    const [provider] = model.split("/");
    if (!(provider in providers)) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    return provider as keyof ProviderMap;
  }

  /**
   * Gets the model identifier portion from the full model string
   */
  private getModelIdentifier(): string {
    if (this.provider === "openrouter") {
      return this.config.model;
    }

    const [, ...modelParts] = this.config.model.split("/");
    return modelParts.join("/");
  }

  /**
   * Initializes a provider-specific model instance
   * @param provider - Name of the provider
   * @param modelId - Model identifier
   */
  private getProviderModel(provider: keyof ProviderMap, modelId: string) {
    const providerFn = providers[provider] as ProviderFunction<any>;

    switch (provider) {
      case "openai":
        return providerFn(modelId, {
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });
      case "anthropic":
        return providerFn(modelId, {
          temperature: this.config.temperature,
          maxTokensToSample: this.config.maxTokens,
        });
      case "azure":
        return providerFn(modelId, {
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          deploymentName: modelId,
        });
      case "google":
      case "vertex":
        return providerFn(modelId, {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxTokens,
        });
      default:
        return providerFn(modelId);
    }
  }

  /**
   * Completes a prompt using the configured LLM
   * @param prompt - Input prompt text
   * @returns Promise resolving to the completion response
   */
  public async complete(prompt: string): Promise<LLMResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.executeCompletion(prompt);
      } catch (error) {
        lastError = error as Error;

        if (this.shouldRetry(error as Error, attempt)) {
          const delay = this.calculateBackoff(attempt);
          await setTimeout(delay);
          continue;
        }

        throw this.enhanceError(error as Error);
      }
    }

    throw this.enhanceError(lastError!);
  }

  /**
   * Gets the full model name
   */
  public getModelName(): string {
    return this.config.model;
  }

  /**
   * Extracts the version number from the model name
   */
  public getModelVersion(): string {
    const versionMatch = this.config.model.match(/\d+(\.\d+)*/);
    return versionMatch ? versionMatch[0] : "unknown";
  }

  /**
   * Executes a completion request with timeout handling
   */
  private async executeCompletion(prompt: string): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      return await this.call(prompt, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Makes the actual API call to the LLM provider
   */
  private async call(
    prompt: string,
    signal: AbortSignal
  ): Promise<LLMResponse> {
    const modelId = this.getModelIdentifier();
    const model = this.getProviderModel(this.provider, modelId);

    let response;
    switch (this.provider) {
      case "openai":
        response = await generateText({
          model,
          prompt,
          abortSignal: signal,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });
        break;

      case "anthropic":
        response = await generateText({
          model,
          prompt,
          abortSignal: signal,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });
        break;

      case "azure":
        response = await generateText({
          model,
          prompt,
          abortSignal: signal,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });
        break;

      case "google":
      case "vertex":
        response = await generateText({
          model,
          prompt,
          abortSignal: signal,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });
        break;

      case "mistral":
      case "togetherai":
      case "cohere":
      case "fireworks":
      case "deepinfra":
      case "deepseek":
      case "cerebras":
      case "groq":
      case "openrouter":
      default:
        response = await generateText({
          model,
          prompt,
          abortSignal: signal,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });
        break;
    }

    return {
      text: response.text,
      model: this.config.model,
      usage: {
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens:
          response.usage.promptTokens + response.usage.completionTokens,
      },
      metadata: {
        stop_reason: response.finishReason,
      },
    };
  }

  /**
   * Gets the default model identifier
   */
  private getDefaultModel(): string {
    return "openai/gpt-4-turbo-preview";
  }

  /**
   * Determines if an error should trigger a retry
   */
  private shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) return false;

    if (error.name === "AbortError") return true;
    if (error.message.includes("rate limit")) return true;
    if (error.message.includes("timeout")) return true;
    if (error.message.includes("5")) return true;

    return false;
  }

  /**
   * Calculates exponential backoff with jitter for retries
   */
  private calculateBackoff(attempt: number): number {
    const exponentialDelay = this.config.baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, this.config.maxDelay);
  }

  /**
   * Enhances an error with additional context
   */
  private enhanceError(error: Error): Error {
    const enhancedError = new Error(
      `LLM Error (${this.config.model}): ${error.message}`
    );
    enhancedError.cause = error;
    return enhancedError;
  }

  /**
   * Analyzes text using the LLM with optional structured output
   * @param prompt - Input text to analyze
   * @param options - Analysis configuration options
   * @returns Promise resolving to analysis result
   */
  async analyze(
    prompt: string,
    options: AnalysisOptions = {}
  ): Promise<string | StructuredAnalysis> {
    const {
      temperature = this.config.temperature,
      maxTokens = this.config.maxTokens,
      formatResponse = false,
    } = options;

    const modelId = this.getModelIdentifier();
    const model = this.getProviderModel(this.provider, modelId);

    let response;
    switch (this.provider) {
      case "openai":
        response = await generateText({
          model,
          temperature,
          messages: [
            {
              role: "system",
              content: "\n\nProvide response in JSON format.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens,
        });
        break;

      case "anthropic":
        response = await generateText({
          model,
          temperature,
          messages: [
            {
              role: "system",
              content: "\n\nProvide response in JSON format.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens,
        });
        break;

      case "azure":
        response = await generateText({
          model,
          temperature,
          messages: [
            {
              role: "system",
              content: "\n\nProvide response in JSON format.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens,
        });
        break;

      case "google":
      case "vertex":
        response = await generateText({
          model,
          temperature,
          messages: [
            {
              role: "system",
              content: "\n\nProvide response in JSON format.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens,
        });
        break;

      case "mistral":
      case "togetherai":
      case "cohere":
      case "fireworks":
      case "deepinfra":
      case "deepseek":
      case "cerebras":
      case "groq":
      case "openrouter":
      default:
        response = await generateText({
          model,
          temperature,
          messages: [
            {
              role: "system",
              content: "\n\nProvide response in JSON format.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens,
        });
        break;
    }

    this.emit("trace:tokens", {
      input: response?.usage.promptTokens,
      output: response?.usage.completionTokens,
    });

    const result = response?.text;

    if (formatResponse && result) {
      try {
        return JSON.parse(result) as StructuredAnalysis;
      } catch (e) {
        console.warn("Failed to parse structured response, returning raw text");
        return result;
      }
    }

    return result;
  }
}
