import {
  GeminiError,
  GeminiErrorType,
  GeminiRateLimitError,
} from "./types";

/**
 * Classifies any error (HTTP status, JSON body, network exception) into an explicit GeminiError.
 */
export function classifyGeminiError(
  rawError: any,
  httpStatus?: number,
  bodyText?: string,
  model?: string
): GeminiError {
  const message = (
    rawError?.message ||
    bodyText ||
    (typeof rawError === "string" ? rawError : "Unknown Gemini error")
  ).toString();

  const lowerMsg = message.toLowerCase();

  // 1. Timeout / AbortController
  if (
    rawError?.name === "AbortError" ||
    rawError?.name === "TimeoutError" ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("aborted")
  ) {
    return new GeminiError(
      `Gemini request timed out: ${message}`,
      GeminiErrorType.TIMEOUT,
      httpStatus,
      true,
      undefined,
      model
    );
  }

  // 2. Corporate Proxy & Socket Reset errors (ECONNRESET / WSAECONNRESET 10054)
  if (
    rawError?.code === "ECONNRESET" ||
    lowerMsg.includes("econnreset") ||
    lowerMsg.includes("10054") ||
    lowerMsg.includes("wsarecv") ||
    lowerMsg.includes("socket hang up") ||
    lowerMsg.includes("connection reset")
  ) {
    return new GeminiError(
      `Corporate socket reset / connection drop: ${message}`,
      GeminiErrorType.ECONNRESET,
      httpStatus,
      true,
      undefined,
      model
    );
  }

  // 3. HTTP 429 - Distinguish RPM vs RPD
  if (httpStatus === 429 || lowerMsg.includes("429") || lowerMsg.includes("resource exhausted")) {
    const retryMatch = message.match(/retry in\s+([\d.]+)\s*s/i) || message.match(/retry-after:\s*(\d+)/i);
    const retryAfterSeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : undefined;

    // Check clear indicators of RPD exhaustion (Daily quota)
    const isDailyExhausted =
      lowerMsg.includes("perday") ||
      lowerMsg.includes("daily") ||
      lowerMsg.includes("quota exceeded, please check your plan") ||
      (lowerMsg.includes("resource exhausted") && !retryAfterSeconds && lowerMsg.includes("billing"));

    if (isDailyExhausted) {
      return new GeminiRateLimitError(
        `Gemini daily quota exhausted (RPD): ${message}`,
        undefined,
        GeminiErrorType.RATE_LIMIT_RPD,
        model
      );
    }

    if (retryAfterSeconds != null || lowerMsg.includes("perminute") || lowerMsg.includes("rpm") || lowerMsg.includes("rate limit")) {
      return new GeminiRateLimitError(
        message,
        retryAfterSeconds,
        GeminiErrorType.RATE_LIMIT_RPM,
        model
      );
    }

    return new GeminiRateLimitError(
      message,
      retryAfterSeconds,
      GeminiErrorType.RATE_LIMIT_RPM_OR_UNKNOWN,
      model
    );
  }

  // 4. HTTP 400 - Invalid Request
  if (httpStatus === 400 || lowerMsg.includes("invalid_argument")) {
    return new GeminiError(
      `Invalid request: ${message}`,
      GeminiErrorType.INVALID_REQUEST,
      400,
      false,
      undefined,
      model
    );
  }

  // 5. HTTP 401 - Auth Error
  if (
    httpStatus === 401 ||
    lowerMsg.includes("api_key_invalid") ||
    lowerMsg.includes("api key not valid")
  ) {
    return new GeminiError(
      `API key authentication failed: ${message}`,
      GeminiErrorType.AUTH_ERROR,
      401,
      false,
      undefined,
      model
    );
  }

  // 6. HTTP 403 - Permission Error
  if (httpStatus === 403 || lowerMsg.includes("permission_denied")) {
    return new GeminiError(
      `Permission denied: ${message}`,
      GeminiErrorType.PERMISSION_ERROR,
      403,
      false,
      undefined,
      model
    );
  }

  // 7. HTTP 404 - Model Not Found
  if (httpStatus === 404 || lowerMsg.includes("is not found for api version") || lowerMsg.includes("not found")) {
    return new GeminiError(
      `Model not found or deprecated: ${message}`,
      GeminiErrorType.MODEL_NOT_FOUND,
      404,
      false,
      undefined,
      model
    );
  }

  // 8. HTTP 5xx Server Errors (500, 502, 503, 504)
  if (httpStatus && httpStatus >= 500 && httpStatus <= 599) {
    return new GeminiError(
      `Server error (${httpStatus}): ${message}`,
      GeminiErrorType.SERVER_5XX,
      httpStatus,
      true,
      undefined,
      model
    );
  }

  // 9. Generic Network Failure
  if (
    rawError?.name === "TypeError" &&
    (lowerMsg.includes("fetch failed") || lowerMsg.includes("network"))
  ) {
    return new GeminiError(
      `Network fetch error: ${message}`,
      GeminiErrorType.NETWORK_ERROR,
      httpStatus,
      true,
      undefined,
      model
    );
  }

  // 10. Fallback
  return new GeminiError(
    message,
    GeminiErrorType.UNKNOWN_ERROR,
    httpStatus,
    false,
    undefined,
    model
  );
}
