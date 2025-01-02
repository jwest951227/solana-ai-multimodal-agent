export type HorizonType = "long" | "medium" | "short";
export type GoalStatus =
  | "pending"
  | "active"
  | "completed"
  | "failed"
  | "ready"
  | "blocked";

// Add new interfaces for goal management
interface Goal {
  id: string;
  horizon: HorizonType;
  description: string;
  status: GoalStatus;
  priority: number;
  dependencies?: string[]; // IDs of goals that must be completed first
  subgoals?: string[]; // IDs of child goals
  parentGoal?: string; // ID of parent goal
  success_criteria: string[];
  created_at: number;
  completed_at?: number;
  progress?: number; // 0-100 to track partial completion
  meta?: Record<string, any>;
}

// Add GoalManager class
export class GoalManager {
  private goals: Map<string, Goal> = new Map();

  public addGoal(goal: Omit<Goal, "id">): Goal {
    const id = `goal-${Math.random().toString(36).substring(2, 15)}`;
    const newGoal = { ...goal, id, progress: 0 };
    this.goals.set(id, newGoal);

    // If this is a subgoal, update the parent's subgoals array
    if (goal.parentGoal) {
      const parent = this.goals.get(goal.parentGoal);
      if (parent) {
        parent.subgoals = parent.subgoals || [];
        parent.subgoals.push(id);
      }
    }

    return newGoal;
  }

  public updateGoalStatus(id: string, status: GoalStatus): void {
    const goal = this.goals.get(id);
    if (!goal) return;

    goal.status = status;

    if (status === "completed") {
      goal.completed_at = Date.now();
      goal.progress = 100;
      this.updateParentProgress(goal);
      this.checkAndUpdateDependentGoals(id);
    }
  }

  private updateParentProgress(goal: Goal): void {
    if (!goal.parentGoal) return;

    const parent = this.goals.get(goal.parentGoal);
    if (!parent || !parent.subgoals) return;

    // Calculate parent progress based on completed subgoals
    const completedSubgoals = parent.subgoals.filter(
      (subId) => this.goals.get(subId)?.status === "completed"
    ).length;

    parent.progress = Math.round(
      (completedSubgoals / parent.subgoals.length) * 100
    );

    // If all subgoals are complete, mark parent as ready
    if (parent.progress === 100) {
      parent.status = "ready";
    }
  }

  private checkAndUpdateDependentGoals(completedGoalId: string): void {
    // Find all goals that depend on the completed goal
    Array.from(this.goals.values()).forEach((goal) => {
      if (goal.dependencies?.includes(completedGoalId)) {
        // Check if all dependencies are now completed
        const allDependenciesMet = goal.dependencies.every(
          (depId) => this.goals.get(depId)?.status === "completed"
        );

        if (allDependenciesMet) {
          goal.status = "ready";
        }
      }
    });
  }

  public getGoalsByHorizon(horizon: HorizonType): Goal[] {
    return Array.from(this.goals.values())
      .filter((g) => g.horizon === horizon)
      .sort((a, b) => b.priority - a.priority);
  }

  public getReadyGoals(horizon?: HorizonType): Goal[] {
    return Array.from(this.goals.values())
      .filter((goal) => {
        const horizonMatch = !horizon || goal.horizon === horizon;
        const isReady = goal.status === "ready";
        const dependenciesMet =
          !goal.dependencies?.length ||
          goal.dependencies.every(
            (depId) => this.goals.get(depId)?.status === "completed"
          );
        return horizonMatch && (isReady || dependenciesMet);
      })
      .sort((a, b) => b.priority - a.priority);
  }

  public getGoalHierarchy(goalId: string): Goal[] {
    const goal = this.goals.get(goalId);
    if (!goal) return [];

    const hierarchy: Goal[] = [goal];

    // Get all subgoals recursively
    if (goal.subgoals) {
      goal.subgoals.forEach((subId) => {
        hierarchy.push(...this.getGoalHierarchy(subId));
      });
    }

    return hierarchy;
  }

  public getBlockingGoals(goalId: string): Goal[] {
    const goal = this.goals.get(goalId);
    if (!goal || !goal.dependencies) return [];

    return goal.dependencies
      .map((depId) => this.goals.get(depId))
      .filter(
        (dep): dep is Goal => dep !== undefined && dep.status !== "completed"
      );
  }

  // Add method to get a single goal by ID
  public getGoalById(id: string): Goal | undefined {
    return this.goals.get(id);
  }

  // Add method to get child goals of a parent goal
  public getChildGoals(parentId: string): Goal[] {
    const parent = this.goals.get(parentId);
    if (!parent || !parent.subgoals) return [];

    return parent.subgoals
      .map((id) => this.goals.get(id))
      .filter((goal): goal is Goal => goal !== undefined);
  }

  // Add method to get goals that depend on a given goal
  public getDependentGoals(goalId: string): Goal[] {
    return Array.from(this.goals.values()).filter((goal) =>
      goal.dependencies?.includes(goalId)
    );
  }

  // Add method to check if all prerequisites are met for a goal
  public arePrerequisitesMet(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal || !goal.dependencies) return true;

    return goal.dependencies.every((depId) => {
      const dep = this.goals.get(depId);
      return dep?.status === "completed";
    });
  }

  // Add method to update goal progress
  public updateGoalProgress(id: string, progress: number): void {
    const goal = this.goals.get(id);
    if (!goal) return;

    goal.progress = Math.min(100, Math.max(0, progress));

    // If progress is 100%, mark as ready for completion validation
    if (goal.progress === 100 && goal.status !== "completed") {
      goal.status = "ready";
    }

    // Update parent progress if this is a subgoal
    if (goal.parentGoal) {
      this.updateParentProgress(this.goals.get(goal.parentGoal)!);
    }
  }

  // Add method to get all goals in a specific status
  public getGoalsByStatus(status: GoalStatus): Goal[] {
    return Array.from(this.goals.values())
      .filter((goal) => goal.status === status)
      .sort((a, b) => b.priority - a.priority);
  }

  // Add method to check if a goal can be refined
  public canBeRefined(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    // Goals can be refined if they are:
    // 1. Not short-term goals
    // 2. Don't already have subgoals
    // 3. Are not completed or failed
    return (
      goal.horizon !== "short" &&
      (!goal.subgoals || goal.subgoals.length === 0) &&
      !["completed", "failed"].includes(goal.status)
    );
  }

  // Add method to mark a goal and its subgoals as blocked
  public blockGoalHierarchy(goalId: string, reason: string): void {
    const goal = this.goals.get(goalId);
    if (!goal) return;

    goal.status = "blocked";
    goal.meta = { ...goal.meta, blockReason: reason };

    // Block all subgoals recursively
    if (goal.subgoals) {
      goal.subgoals.forEach((subId) => {
        this.blockGoalHierarchy(
          subId,
          `Parent goal ${goalId} is blocked: ${reason}`
        );
      });
    }
  }

  // Add method to get the full path to root for a goal
  public getGoalPath(goalId: string): Goal[] {
    const path: Goal[] = [];
    let currentGoal = this.goals.get(goalId);

    while (currentGoal) {
      path.unshift(currentGoal);
      if (!currentGoal.parentGoal) break;
      currentGoal = this.goals.get(currentGoal.parentGoal);
    }

    return path;
  }

  // Add method to estimate completion time for a goal
  public estimateCompletionTime(goalId: string): number {
    const goal = this.goals.get(goalId);
    if (!goal) return 0;

    // Base time for the goal itself (could be configured based on horizon)
    const baseTime =
      {
        short: 1,
        medium: 3,
        long: 8,
      }[goal.horizon] || 1;

    // Add time for incomplete dependencies
    const dependencyTime = (goal.dependencies || [])
      .map((depId) => {
        const dep = this.goals.get(depId);
        return dep && dep.status !== "completed"
          ? this.estimateCompletionTime(depId)
          : 0;
      })
      .reduce((sum, time) => sum + time, 0);

    // Add time for incomplete subgoals
    const subgoalTime = (goal.subgoals || [])
      .map((subId) => {
        const sub = this.goals.get(subId);
        return sub && sub.status !== "completed"
          ? this.estimateCompletionTime(subId)
          : 0;
      })
      .reduce((sum, time) => sum + time, 0);

    return baseTime + Math.max(dependencyTime, subgoalTime);
  }
}
