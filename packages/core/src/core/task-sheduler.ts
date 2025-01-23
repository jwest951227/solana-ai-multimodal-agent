/**
 * Priority queue implementation for scheduling tasks.
 * Tasks are ordered by their nextRun timestamp.
 * @template T Type must include a nextRun timestamp property
 */
export class TaskScheduler<T extends { nextRun: number }> {
  private tasks: T[] = [];
  private timerId?: NodeJS.Timeout;

  /**
   * @param onTaskDue Callback executed when a task is due to run
   */
  constructor(private readonly onTaskDue: (task: T) => Promise<void>) {}

  /**
   * Schedules a new task or updates an existing one.
   * Tasks are automatically sorted by nextRun timestamp.
   * @param task The task to schedule
   */
  public scheduleTask(task: T): void {
    this.tasks = this.tasks.filter((t) => t !== task);
    this.tasks.push(task);
    this.tasks.sort((a, b) => a.nextRun - b.nextRun);
    this.start();
  }

  /**
   * Starts or restarts the scheduler timer for the next due task.
   * @private
   */
  private start() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
    if (this.tasks.length === 0) return;

    const now = Date.now();
    const earliestTask = this.tasks[0];
    const delay = Math.max(0, earliestTask.nextRun - now);

    this.timerId = setTimeout(async () => {
      this.timerId = undefined;
      const task = this.tasks.shift();
      if (!task) return;

      await this.onTaskDue(task);

      if (this.tasks.length) {
        this.start();
      }
    }, delay) as unknown as NodeJS.Timeout;
  }

  /**
   * Stops the scheduler and clears all pending tasks.
   */
  public stop() {
    if (this.timerId) clearTimeout(this.timerId);
    this.tasks = [];
  }
}
