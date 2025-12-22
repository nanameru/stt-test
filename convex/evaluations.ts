import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Save evaluation results
export const save = mutation({
    args: {
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
    },
    handler: async (ctx, args) => {
        // Check if evaluation already exists for this session
        const existing = await ctx.db
            .query("evaluations")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .first();

        if (existing) {
            // Update existing
            await ctx.db.patch(existing._id, {
                summary: args.summary,
                bestProvider: args.bestProvider,
                groundTruthUsed: args.groundTruthUsed,
                results: args.results,
            });
            return existing._id;
        }

        // Create new
        const id = await ctx.db.insert("evaluations", {
            sessionId: args.sessionId,
            summary: args.summary,
            bestProvider: args.bestProvider,
            groundTruthUsed: args.groundTruthUsed,
            results: args.results,
        });
        return id;
    },
});

// Get evaluation for a session
export const getBySession = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("evaluations")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .first();
    },
});
