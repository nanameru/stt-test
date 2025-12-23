/**
 * Simple in-memory rate limiter using sliding window algorithm
 * 
 * Note: This is suitable for single-instance deployments.
 * For production with multiple instances, use Redis or similar.
 */

interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Maximum requests per window
}

interface RequestRecord {
    count: number;
    resetTime: number;
}

// In-memory store for rate limiting
const rateLimitStore = new Map<string, RequestRecord>();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;

    lastCleanup = now;
    for (const [key, record] of rateLimitStore.entries()) {
        if (record.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}

export interface RateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (usually IP address)
 * @param config - Rate limit configuration
 * @returns RateLimitResult with success status and headers info
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): RateLimitResult {
    cleanupExpiredEntries();

    const now = Date.now();
    const key = identifier;
    const record = rateLimitStore.get(key);

    if (!record || record.resetTime < now) {
        // First request or window expired - create new record
        rateLimitStore.set(key, {
            count: 1,
            resetTime: now + config.windowMs,
        });

        return {
            success: true,
            limit: config.maxRequests,
            remaining: config.maxRequests - 1,
            resetTime: now + config.windowMs,
        };
    }

    // Check if limit exceeded
    if (record.count >= config.maxRequests) {
        return {
            success: false,
            limit: config.maxRequests,
            remaining: 0,
            resetTime: record.resetTime,
        };
    }

    // Increment count
    record.count++;

    return {
        success: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - record.count,
        resetTime: record.resetTime,
    };
}

/**
 * Get client IP address from request headers
 * Handles common proxy headers (X-Forwarded-For, etc.)
 */
export function getClientIP(request: Request): string {
    // Check various headers in order of priority
    const headers = request.headers;

    const forwardedFor = headers.get("x-forwarded-for");
    if (forwardedFor) {
        // X-Forwarded-For can contain multiple IPs, take the first one
        return forwardedFor.split(",")[0].trim();
    }

    const realIP = headers.get("x-real-ip");
    if (realIP) {
        return realIP;
    }

    const cfConnectingIP = headers.get("cf-connecting-ip");
    if (cfConnectingIP) {
        return cfConnectingIP;
    }

    // Fallback to a default identifier
    return "unknown";
}

// Pre-configured rate limiters for different endpoints
export const RATE_LIMITS = {
    // STT API endpoints - 30 requests per minute
    stt: {
        windowMs: 60 * 1000,
        maxRequests: 30,
    },
    // Evaluation API - 10 requests per minute
    evaluate: {
        windowMs: 60 * 1000,
        maxRequests: 10,
    },
    // Health check - more lenient
    health: {
        windowMs: 60 * 1000,
        maxRequests: 60,
    },
} as const;

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): HeadersInit {
    return {
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": Math.ceil(result.resetTime / 1000).toString(),
    };
}
