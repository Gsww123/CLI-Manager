export type ExtensionCli = "claude" | "codex" | "grok";

export type McpTransport = "stdio" | "sse" | "streamableHttp";

export type McpConfigFormat = "json" | "toml";

export interface McpTimeout {
  startupMs: number | null;
  requestMs: number | null;
}

export interface McpResourceSource {
  kind: string;
  identity: string;
  label: string | null;
}

export type JsonObject = Record<string, unknown>;

export interface McpResource {
  schemaVersion: number;
  resourceId: string;
  serverKey: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[];
  cwd: string | null;
  url: string | null;
  env: Record<string, string>;
  headers: Record<string, string>;
  secretRefs: Record<string, string>;
  timeout: McpTimeout | null;
  perCliExtensions: Record<string, JsonObject>;
  source: McpResourceSource | null;
  [key: string]: unknown;
}

export interface McpResourceRedacted {
  schemaVersion: number;
  resourceId: string;
  serverKey: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[];
  cwd: string | null;
  url: string | null;
  env: Record<string, string>;
  headers: Record<string, string>;
  secretRefs: Record<string, string>;
  timeout: McpTimeout | null;
  perCliExtensions: Record<string, JsonObject>;
  source: McpResourceSource | null;
  extra: Record<string, unknown>;
  redactedFields: string[];
}

export interface McpValidationIssue {
  code: string;
  field: string;
}

export interface McpValidationReport {
  valid: boolean;
  issues: McpValidationIssue[];
}

export type CapabilityStatus = "supported" | "globalOnly" | "unknown" | "error";
export type CapabilityFieldStatus = "supported" | "unsupported" | "canonicalOnly";

export interface McpCapabilityField {
  status: CapabilityFieldStatus;
  note: string | null;
}

export interface McpCliCapability {
  cli: ExtensionCli;
  displayName: string;
  format: McpConfigFormat;
  rootKey: string;
  version: string | null;
  status: CapabilityStatus;
  transports: McpTransport[];
  fields: Record<string, McpCapabilityField>;
}

export type ProjectionStatus = "ready" | "unsupported";

export interface McpProjectionIssue {
  code: string;
  field: string;
  resourceId: string | null;
}

export interface McpProjectionPreview {
  cli: ExtensionCli;
  format: McpConfigFormat;
  status: ProjectionStatus;
  content: string;
  resources: McpResourceRedacted[];
  issues: McpProjectionIssue[];
  omittedFields: string[];
  changed: boolean;
}

export interface McpNativeConfigPreview {
  cli: ExtensionCli;
  format: McpConfigFormat;
  resources: McpResourceRedacted[];
}

export interface McpProjectionRequest {
  cli: ExtensionCli;
  baseConfig: string;
  resources: McpResource[];
}
