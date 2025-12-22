import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Save a transcription result
export const save = mutation({
    args: {
        sessionId: v.id("sessions"),
        provider: v.string(),
        text: v.string(),
        latency: v.number(),
        timestamp: v.number(),
        isFinal: v.boolean(),
    },
    handler: async (ctx, args) => {
        const id = await ctx.db.insert("transcriptions", {
            sessionId: args.sessionId,
            provider: args.provider,
            text: args.text,
            latency: args.latency,
            timestamp: args.timestamp,
            isFinal: args.isFinal,
        });
        return id;
    },
});

// Save multiple transcriptions at once (batch)
export const saveBatch = mutation({
    args: {
        sessionId: v.id("sessions"),
        transcriptions: v.array(v.object({
            provider: v.string(),
            text: v.string(),
            latency: v.number(),
            timestamp: v.number(),
            isFinal: v.boolean(),
        })),
    },
    handler: async (ctx, args) => {
        const ids = [];
        for (const t of args.transcriptions) {
            const id = await ctx.db.insert("transcriptions", {
                sessionId: args.sessionId,
                ...t,
            });
            ids.push(id);
        }
        return ids;
    },
});

// Get transcriptions for a session
export const getBySession = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("transcriptions")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .collect();
    },
});

// Get transcriptions grouped by provider
export const getBySessionGrouped = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, args) => {
        const transcriptions = await ctx.db
            .query("transcriptions")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .collect();

        // Group by provider
        const grouped: Record<string, typeof transcriptions> = {};
        for (const t of transcriptions) {
            if (!grouped[t.provider]) {
                grouped[t.provider] = [];
            }
            grouped[t.provider].push(t);
        }

        return grouped;
    },
});
