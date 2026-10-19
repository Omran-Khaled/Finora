function validateApiUrl(value, environment) {
  const configuredUrl = value?.trim();
  if (!configuredUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is required when EXPO_PUBLIC_USE_REAL_API=1.");
  }
  if (!/^https?:\/\//i.test(configuredUrl)) {
    throw new Error("EXPO_PUBLIC_API_URL must be an absolute HTTP(S) API URL.");
  }

  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be an absolute HTTP(S) API URL.");
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    path.endsWith("/api/v1")
  ) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be an absolute HTTP(S) base URL without credentials, query, fragment, or /api/v1 suffix.",
    );
  }

  if (environment === "production") {
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "example.com" ||
      host.endsWith(".example.com") ||
      host.endsWith(".test") ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".invalid")
    ) {
      throw new Error("EXPO_PUBLIC_API_URL must use HTTPS and a real, non-placeholder production host.");
    }
  }

  return configuredUrl.replace(/\/+$/, "");
}

function resolveMobileApiConfig(useRealApi, apiUrl, environment) {
  if (useRealApi !== "1" && useRealApi !== "0") {
    throw new Error('EXPO_PUBLIC_USE_REAL_API must be explicitly set to "1" or "0".');
  }

  if (environment === "production" && useRealApi !== "1") {
    throw new Error('EXPO_PUBLIC_USE_REAL_API must be "1" in production.');
  }

  if (useRealApi === "0") {
    return { useRealApi: false, baseUrl: null };
  }

  return { useRealApi: true, baseUrl: validateApiUrl(apiUrl, environment) };
}

module.exports = { resolveMobileApiConfig };
