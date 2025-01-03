// Add new step types at the top
type StepType = "action" | "planning" | "system" | "task";

interface BaseStep {
  id: string;
  type: StepType;
  content: string;
  timestamp: number;
  tags?: string[];
  meta?: Record<string, any>;
}

interface ActionStep extends BaseStep {
  type: "action";
  content: string;
  toolCall?: {
    name: string;
    arguments: any;
    id: string;
  };
  error?: Error;
  observations?: string;
  actionOutput?: any;
  duration?: number;
}

interface PlanningStep extends BaseStep {
  type: "planning";
  plan: string;
  facts: string;
}

interface SystemStep extends BaseStep {
  type: "system";
  systemPrompt: string;
}

interface TaskStep extends BaseStep {
  type: "task";
  task: string;
}

type Step = ActionStep | PlanningStep | SystemStep | TaskStep;

// Add StepManager class
class StepManager {
  private steps: Step[] = [];
  private stepIds: Set<string> = new Set();

  constructor() {
    this.steps = [];
    this.stepIds = new Set();
  }

  public addStep(step: Step): Step {
    if (this.stepIds.has(step.id)) {
      throw new Error(`Step with ID ${step.id} already exists`);
    }

    this.steps.push(step);
    this.stepIds.add(step.id);
    return step;
  }

  public getSteps(): Step[] {
    return this.steps;
  }

  public getStepById(id: string): Step | undefined {
    return this.steps.find((s) => s.id === id);
  }

  public updateStep(id: string, updates: Partial<Step>): void {
    const index = this.steps.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`Step with ID ${id} not found`);
    }

    const currentStep = this.steps[index];
    const updatedStep = {
      ...currentStep,
      ...updates,
      type: currentStep.type, // Preserve the original step type
      timestamp: Date.now(), // Update timestamp on changes
    } as Step;

    this.steps[index] = updatedStep;
  }

  public removeStep(id: string): void {
    const index = this.steps.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`Step with ID ${id} not found`);
    }

    this.steps.splice(index, 1);
    this.stepIds.delete(id);
  }

  public clear(): void {
    this.steps = [];
    this.stepIds.clear();
  }
}

export { StepManager, type Step, type StepType };
