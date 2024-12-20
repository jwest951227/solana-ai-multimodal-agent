# Daydreams: Technical Guide

## Overview

The daydreams provides a blueprint for creating autonomous onchain game agents. These agents interpret onchain game states, use historical data for context, and continually refine their strategies through an evolving chain of thought. By integrating vector databases as a long-term memory store and enabling multi-agent "swarm rooms" for knowledge sharing, the protocol fosters rapid, collective self-improvement among agents.

Daydreams is designed to integrate seamlessly with the Dojo onchain game engine. Any Dojo-based game can be connected with minimal configuration, allowing developers to quickly deploy Daydream agents that can effectively engage with their games. Within a month, anyone will be able to launch a Daydream agent to play any Dojo onchain game.

The creators of daydreams are the same team behind the Dojo onchain game engine, Realms (@eternum), Dopewars, and Cartridge.

## Why Games?

Games present some of the most challenging environments for autonomous agents, requiring rapid adaptation, strategic foresight, and creative problem-solving. By conquering these complex arenas, agents demonstrate an ability to handle uncertainty, optimize outcomes, and refine strategies in real-time—key capabilities on the path toward more general intelligence. If these high-level skills can be generalized beyond gaming contexts, it moves us significantly closer to AGI.

## Why Onchain Games?

Onchain gaming environments introduce an inherent profit motive, transforming strategies from abstract puzzle-solving into economically driven optimization. Agents playing blockchain-based games are directly incentivized to maximize their onchain value, whether in tokens, NFTs, or other digital assets. This measurable, universal "gain function" encourages continuous self-improvement and endows the learning process with real-world stakes. For developers, this ecosystem accelerates adoption by attracting participants eager to leverage advanced agents for tangible gains, ultimately pushing the collective intelligence of these systems forward.

## Core Concepts

### Onchain Games as Standardized Environments

- **Standardization**: Onchain games provide uniform, RPC-based interfaces (e.g., gRPC) that present game states, actions, and player data in a consistent JSON format.
- **Uniformity of Actions**: With all moves encoded in a standard schema, agents can easily interpret and generate valid game actions without custom integrations.

### Agent Self-Improvement and Incentives

- **Economic Incentives**: Onchain games tie actions directly to tangible financial outcomes (e.g., tokens, NFTs), motivating agents to consistently enhance their strategies.
- **Adaptive Strategies**: Agents draw on past successes—stored as vector embeddings—to inform new decisions, continually improving to maximize expected value.

### Dynamic, Context-Aware Reasoning (Chain of Thought)

- **Contextual Inputs**: Agents consider the current game state, historical performance data, and previously learned tactics.
- **On-Demand Queries**: Agents can retrieve additional insights at runtime by querying SQL-like databases or other game APIs.
- **Memory Retrieval**: Using vector database embeddings, agents recall similar past scenarios and outcomes, guiding more informed and effective decision-making.

## Protocol Design

### Open and Modular Architecture

#### Context Layers:

##### Game Context:

- Current game state (entities, resources, turn counters)
- Provided by onchain queries (RPC calls to smart contracts or sidechain services)

##### SQL Context:

- Historical gameplay logs stored in a relational database
- May include tables like moves, outcomes, player_stats, and world_events
- Agents query these tables to find patterns and retrieve valuable historical insights

##### Execution Context:

- Details of how to interact with the blockchain:
  - RPC endpoints or gRPC services
  - Transaction formatting (e.g., JSON-RPC payload)
  - Gas and fee considerations
- Agents rely on this context to execute moves safely and efficiently

### Chain of Thought (CoT) Kernel:

A reasoning component that:

- Integrates all contexts and produces next-step strategies
- Dynamically queries vector DBs and SQL stores
- Evaluates possible actions and decides on the best move to commit

### Embedded Vector Database for Memory:

#### Storing Past Chains:

- Each completed Chain of Thought (CoT) sequence is embedded into a vector and stored
- This embedding captures state, decisions, and outcomes

#### Retrieval and Similarity Matching:

- When encountering a new game state, the CoT kernel retrieves the most similar past CoT embeddings
- Similarity search helps the agent recall tactics that previously led to favorable outcomes

#### Feedback Loops:

- After executing an action, the agent retrieves the results and associates them with the relevant CoT entry
- Positive outcomes increase the weight of that embedding in future searches

### Swarm Rooms for Collaborative Learning:

#### Multi-Agent Knowledge Sharing:

- Set up "swarm rooms" where multiple agents can publish their successful CoT embeddings

#### Federated Memory Updates:

- Other agents subscribe to these rooms, retrieving successful strategy embeddings to enhance their own vector DBs
- This collective intelligence accelerates group learning and performance improvements

#### Privacy and Access Control:

- Agents can be configured to share only certain embeddings (e.g., non-proprietary data)
- Use cryptographic means to prove trustworthiness of shared CoTs

## Integration with External Agents

Daydreams can be added to any existing Agent infrastructure like Eliza or Rig.
