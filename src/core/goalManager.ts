export type HorizonType = "long" | "medium" | "short";
export type GoalStatus = "pending" | "active" | "completed" | "failed";

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
}

// Add GoalManager class
export class GoalManager {
  private goals: Map<string, Goal> = new Map();

  public addGoal(goal: Omit<Goal, "id">): Goal {
    const id = `goal-${Math.random().toString(36).substring(2, 15)}`;
    const newGoal = { ...goal, id };
    this.goals.set(id, newGoal);
    return newGoal;
  }

  public updateGoalStatus(id: string, status: GoalStatus): void {
    const goal = this.goals.get(id);
    if (goal) {
      goal.status = status;
      if (status === "completed") {
        goal.completed_at = Date.now();
      }
    }
  }

  public getActiveGoals(horizon?: HorizonType): Goal[] {
    return Array.from(this.goals.values())
      .filter(
        (g) => g.status === "active" && (!horizon || g.horizon === horizon)
      )
      .sort((a, b) => b.priority - a.priority);
  }

  public getPendingGoals(horizon?: HorizonType): Goal[] {
    return Array.from(this.goals.values())
      .filter(
        (g) => g.status === "pending" && (!horizon || g.horizon === horizon)
      )
      .sort((a, b) => b.priority - a.priority);
  }

  public getReadyGoals(): Goal[] {
    return this.getPendingGoals().filter((goal) => {
      if (!goal.dependencies?.length) return true;
      return goal.dependencies.every((depId) => {
        const dep = this.goals.get(depId);
        return dep?.status === "completed";
      });
    });
  }
}
