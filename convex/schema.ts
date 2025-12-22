import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    // Recording sessions
    sessions: defineTable({
        startTime: v.number(),
        endTime: v.optional(v.number()),
        providersUsed: v.array(v.string()),
        status: v.union(v.literal("recording"), v.literal("completed")),
    }).index("by_startTime", ["startTime"]),

    // Individual transcription results
    transcriptions: defineTable({
        sessionId: v.id("sessions"),
        provider: v.string(),
        text: v.string(),
        latency: v.number(),
        timestamp: v.number(),
        isFinal: v.boolean(),
    }).index("by_session", ["sessionId"]),

    // AI evaluation results
    evaluations: defineTable({
        sessionId: v.id("sessions"),
        summary: v.string(),
        bestProvider: v.optional(v.string()),
        groundTruthUsed: v.boolean(),
        results: v.array(v.object({
            provider: v.string(),
            grade: v.string(),
            similarity: v.number(),
            cer: v.optional(v.number()),
            wer: v.optional(v.number()),
            comment: v.string(),
            strengths: v.array(v.string()),
            weaknesses: v.array(v.string()),
        })),
    }).index("by_session", ["sessionId"]),
});
