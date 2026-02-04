import { AuthError } from "./api";

/**
 * API Client with retry logic and request deduplication.
 *
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Request deduplication for GET requests (prevents duplicate in-flight requests)
 * - Proper error handling with AuthError for 401 responses
 * - Configurable retry count and timeout
 */

type RequestConfig = {
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Enable request deduplication for GET requests (default: true) */
  dedupe?: boolean;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryDelay?: number;
};

// Track in-flight requests for deduplication
const inflightRequests = new Map<string, Promise<unknown>>();

/**
 * Generate cache key for request deduplication
 */
function getCacheKey(url: string, options: RequestInit): string {
  const method = options.method?.toUpperCase() || "GET";
  return `${method}:${url}`;
}

/**
 * Wait with exponential backoff
 */
function wait(attempt: number, baseDelay: number): Promise<void> {
  const delay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 100; // Add jitter to prevent thundering herd
  return new Promise((resolve) => setTimeout(resolve, delay + jitter));
}

/**
 * Check if error is retryable (network errors, 5xx, 429)
 */
function isRetryableError(error: unknown, status?: number): boolean {
  // Network errors are retryable
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  // Server errors and rate limits are retryable
  if (status && (status >= 500 || status === 429)) {
    return true;
  }

  return false;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Make an API request with retry logic and optional deduplication.
 *
 * @example
 * // Simple GET request
 * const data = await apiRequest<User[]>("/api/users");
 *
 * @example
 * // POST request with body
 * const result = await apiRequest<CreateResult>("/api/users", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ name: "John" }),
 * });
 *
 * @example
 * // With custom config
 * const data = await apiRequest<Data>("/api/data", {}, {
 *   retries: 5,
 *   timeout: 60000,
 * });
 */
export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  config: RequestConfig = {}
): Promise<T> {
  const {
    retries = 3,
    dedupe = true,
    timeout = 30000,
    retryDelay = 1000,
  } = config;

  const method = options.method?.toUpperCase() || "GET";
  const cacheKey = getCacheKey(url, options);

  // Deduplication: Return existing promise for identical GET requests
  if (dedupe && method === "GET") {
    const existing = inflightRequests.get(cacheKey);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const executeRequest = async (attempt: number): Promise<T> => {
    try {
      const response = await fetchWithTimeout(url, options, timeout);

      // Handle auth errors immediately (no retry)
      if (response.status === 401) {
        throw new AuthError("Not authenticated");
      }

      // Handle client errors (no retry)
      if (response.status >= 400 && response.status < 500) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      // Handle server errors with retry
      if (!response.ok) {
        if (attempt < retries && isRetryableError(null, response.status)) {
          await wait(attempt, retryDelay);
          return executeRequest(attempt + 1);
        }
        throw new Error(`HTTP ${response.status}`);
      }

      // Success - parse JSON
      return response.json();
    } catch (error) {
      // Don't retry auth errors
      if (error instanceof AuthError) {
        throw error;
      }

      // Retry network errors
      if (attempt < retries && isRetryableError(error)) {
        await wait(attempt, retryDelay);
        return executeRequest(attempt + 1);
      }

      throw error;
    }
  };

  // Create and track the request promise
  const promise = executeRequest(1).finally(() => {
    // Clean up after completion
    inflightRequests.delete(cacheKey);
  });

  // Track for deduplication (GET only)
  if (dedupe && method === "GET") {
    inflightRequests.set(cacheKey, promise);
  }

  return promise;
}

/**
 * Convenience method for GET requests
 */
export function apiGet<T>(
  url: string,
  config?: RequestConfig
): Promise<T> {
  return apiRequest<T>(url, { method: "GET" }, config);
}

/**
 * Convenience method for POST requests
 */
export function apiPost<T>(
  url: string,
  body?: unknown,
  config?: RequestConfig
): Promise<T> {
  const options: RequestInit = {
    method: "POST",
  };

  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  return apiRequest<T>(url, options, { ...config, dedupe: false });
}

/**
 * Convenience method for PATCH requests
 */
export function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: RequestConfig
): Promise<T> {
  const options: RequestInit = {
    method: "PATCH",
  };

  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  return apiRequest<T>(url, options, { ...config, dedupe: false });
}

/**
 * Convenience method for DELETE requests
 */
export function apiDelete<T>(
  url: string,
  config?: RequestConfig
): Promise<T> {
  return apiRequest<T>(url, { method: "DELETE" }, { ...config, dedupe: false });
}

/**
 * Clear all pending request deduplication entries.
 * Useful for testing or when user logs out.
 */
export function clearInflightRequests(): void {
  inflightRequests.clear();
}
