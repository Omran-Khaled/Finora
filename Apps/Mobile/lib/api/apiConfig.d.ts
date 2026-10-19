export type ApiEnvironment = "development" | "test" | "production";

export interface MobileApiConfig {
  useRealApi: boolean;
  baseUrl: string | null;
}

export function resolveMobileApiConfig(
  useRealApi: string | undefined,
  apiUrl: string | undefined,
  environment: ApiEnvironment,
): MobileApiConfig;
