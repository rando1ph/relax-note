export interface EnrichmentConfig {
  configured: boolean;
  autoEnrich: boolean;
}

/**
 * Explicit enrichment trigger policy. There is deliberately no
 * "enrich every pending item" trigger: configuring AI never bulk-enriches
 * historical vocabulary.
 */
export type EnrichmentTrigger = "create" | "manual" | "settings-change";

export function shouldEnrich(
  trigger: EnrichmentTrigger,
  config: EnrichmentConfig,
): boolean {
  if (trigger === "settings-change") return false;
  if (trigger === "manual") return config.configured;
  return config.configured && config.autoEnrich;
}
