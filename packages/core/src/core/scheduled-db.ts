import { MongoClient, Collection, ObjectId } from "mongodb";

// Define the shape of a scheduled task document in Mongo
export interface ScheduledTask {
    _id?: ObjectId;
    handlerName: string; // Which IOHandler to invoke
    taskData: Record<string, any>; // Arbitrary data passed to the handler
    nextRunAt: Date; // When the task is next due
    intervalMs?: number; // If present, re-schedule after each run
    status: "pending" | "running" | "completed" | "failed";
    createdAt: Date;
    updatedAt: Date;
}

export class ScheduledTaskMongoDb {
    private client: MongoClient;
    private collection!: Collection<ScheduledTask>;

    /**
     * @param uri   A MongoDB connection string
     * @param dbName   Name of the database to use
     * @param collectionName  Name of the collection to store tasks in
     */
    constructor(
        private uri: string,
        private dbName: string = "myApp",
        private collectionName: string = "scheduled_tasks"
    ) {
        this.client = new MongoClient(this.uri);
    }

    /**
     * Connects to the MongoDB server and initializes the tasks collection.
     */
    public async connect(): Promise<void> {
        if (!this.client.listenerCount("connect")) {
            await this.client.connect();
        }

        const db = this.client.db(this.dbName);
        this.collection = db.collection<ScheduledTask>(this.collectionName);

        // Optional: Create indexes
        // - An index on nextRunAt helps find "due" tasks quickly
        // - An index on status helps filter quickly by status
        await this.collection.createIndex({ nextRunAt: 1 });
        await this.collection.createIndex({ status: 1 });
    }

    /**
     * Closes the MongoDB client connection.
     */
    public async close(): Promise<void> {
        await this.client.close();
    }

    /**
     * Schedules a new task in the DB.
     *
     * @param handlerName - Name of the IOHandler to invoke
     * @param taskData    - Arbitrary JSON data to store with the task
     * @param nextRunAt   - When this task should run
     * @param intervalMs  - If set, the task will be re-scheduled after each run
     */
    public async createTask(
        handlerName: string,
        taskData: Record<string, any> = {},
        nextRunAt: Date,
        intervalMs?: number
    ): Promise<ObjectId> {
        const now = new Date();
        const doc: ScheduledTask = {
            handlerName,
            taskData,
            nextRunAt,
            intervalMs,
            status: "pending",
            createdAt: now,
            updatedAt: now,
        };

        const result = await this.collection.insertOne(doc);
        return result.insertedId;
    }

    /**
     * Finds tasks that are due to run right now (status=pending, nextRunAt <= now).
     * This is used by your polling logic to pick up tasks that need to be processed.
     *
     * @param limit - Max number of tasks to fetch at once
     */
    public async findDueTasks(limit = 50): Promise<ScheduledTask[]> {
        const now = new Date();
        if (!this.collection) {
            throw new Error("Database collection is not initialized");
        }
        return this.collection
            .find({
                status: "pending",
                nextRunAt: { $lte: now },
            })
            .sort({ nextRunAt: 1 }) // earliest tasks first
            .limit(limit)
            .toArray();
    }

    /**
     * Marks a task's status as "running". Typically called right before invoking it.
     */
    public async markRunning(taskId: ObjectId): Promise<void> {
        const now = new Date();
        await this.collection.updateOne(
            { _id: taskId },
            {
                $set: {
                    status: "running",
                    updatedAt: now,
                },
            }
        );
    }

    /**
     * Marks a task as completed (or failed).
     */
    public async markCompleted(
        taskId: ObjectId,
        failed = false
    ): Promise<void> {
        const now = new Date();
        await this.collection.updateOne(
            { _id: taskId },
            {
                $set: {
                    status: failed ? "failed" : "completed",
                    updatedAt: now,
                },
            }
        );
    }

    /**
     * Updates a task to run again in the future (if intervalMs is present).
     */
    public async updateNextRun(
        taskId: ObjectId,
        newRunTime: Date
    ): Promise<void> {
        const now = new Date();
        await this.collection.updateOne(
            { _id: taskId },
            {
                $set: {
                    status: "pending",
                    nextRunAt: newRunTime,
                    updatedAt: now,
                },
            }
        );
    }

    /**
     * Convenient method to reschedule a task using its own `intervalMs` if present.
     * Typically you'd call this after the task completes, if you want it to repeat.
     */
    public async rescheduleIfRecurring(task: ScheduledTask): Promise<void> {
        // If there's no interval, we do nothing (non-recurring).
        if (!task.intervalMs) {
            await this.markCompleted(task._id!);
            return;
        }
        const now = Date.now();
        const newRunTime = new Date(now + task.intervalMs);
        await this.updateNextRun(task._id!, newRunTime);
    }

    /**
     * Deletes all tasks from the collection.
     */
    public async deleteAll(): Promise<void> {
        await this.collection.deleteMany({});
    }
}
