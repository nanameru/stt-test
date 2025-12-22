import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new recording session
export const create = mutation({
    args: {
        providersUsed: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        const sessionId = await ctx.db.insert("sessions", {
            startTime: Date.now(),
            providersUsed: args.providersUsed,
            status: "recording",
        });
        return sessionId;
    },
});

// End a recording session
export const end = mutation({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.sessionId, {
            endTime: Date.now(),
            status: "completed",
        });
    },
});

// Get all sessions ordered by most recent
export const list = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 20;
        const sessions = await ctx.db
            .query("sessions")
            .withIndex("by_startTime")
            .order("desc")
            .take(limit);
        return sessions;
    },
});

// Get a single session with details
export const get = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) return null;

        // Get transcriptions for this session
        const transcriptions = await ctx.db
            .query("transcriptions")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .collect();

        // Get evaluation for this session
        const evaluations = await ctx.db
            .query("evaluations")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .collect();

        return {
            ...session,
            transcriptions,
            evaluation: evaluations[0] ?? null,
        };
    },
});

// Delete a session and its related data
export const remove = mutation({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, args) => {
        // Delete transcriptions
        const transcriptions = await ctx.db
            .query("transcriptions")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .collect();
        for (const t of transcriptions) {
            await ctx.db.delete(t._id);
        }

        // Delete evaluations
        const evaluations = await ctx.db
            .query("evaluations")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .collect();
        for (const e of evaluations) {
            await ctx.db.delete(e._id);
        }

        // Delete session
        await ctx.db.delete(args.sessionId);
    },
});
