// Manifest validation. A plugin whose manifest is broken, incomplete or targets a Plugin API
// version this host does not support is refused; the reason names the problem.

/** The Plugin API versions this host can run. Add a version here when the host learns it. */
export const SUPPORTED_API_VERSIONS = ["1"];

const SETTING_TYPES = ["string", "number", "boolean"];

export interface SettingField {
  name: string;
  type: string;
  default?: unknown;
  help?: string;
  secret: boolean;
}

export interface Manifest {
  id: string;
  version: string;
  apiVersion: string;
  entry: string;
  capabilities: unknown[];
  contributions: unknown[];
  settings: SettingField[];
}

export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; reason: string };

const refuse = (reason: string): ManifestResult => ({ ok: false, reason });
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validateManifest(text: string): ManifestResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return refuse(`manifest.json is not valid JSON: ${(error as Error).message}`);
  }
  if (!isObject(raw)) return refuse("manifest.json must be a JSON object");

  for (const field of ["id", "version", "apiVersion"]) {
    if (typeof raw[field] !== "string" || raw[field] === "") {
      return refuse(`manifest field "${field}" is required and must be a non-empty string`);
    }
  }
  if (raw.entry !== undefined && (typeof raw.entry !== "string" || raw.entry === "")) {
    return refuse(`manifest field "entry" must be a non-empty string`);
  }
  for (const field of ["capabilities", "contributions"]) {
    if (raw[field] !== undefined && !Array.isArray(raw[field])) {
      return refuse(`manifest field "${field}" must be an array`);
    }
  }
  if (raw.settings !== undefined && !Array.isArray(raw.settings)) {
    return refuse(`manifest field "settings" must be an array`);
  }

  const settings: SettingField[] = [];
  for (const [i, field] of ((raw.settings as unknown[] | undefined) ?? []).entries()) {
    if (!isObject(field)) return refuse(`manifest settings[${i}] must be an object`);
    if (typeof field.name !== "string" || field.name === "") {
      return refuse(`manifest settings[${i}].name is required and must be a non-empty string`);
    }
    if (typeof field.type !== "string" || !SETTING_TYPES.includes(field.type)) {
      return refuse(
        `manifest settings[${i}].type must be one of ${SETTING_TYPES.join(", ")}`,
      );
    }
    if (field.help !== undefined && typeof field.help !== "string") {
      return refuse(`manifest settings[${i}].help must be a string`);
    }
    if (field.secret !== undefined && typeof field.secret !== "boolean") {
      return refuse(`manifest settings[${i}].secret must be true or false`);
    }
    settings.push({
      name: field.name,
      type: field.type,
      default: field.default,
      help: field.help as string | undefined,
      secret: field.secret === true,
    });
  }

  if (!SUPPORTED_API_VERSIONS.includes(raw.apiVersion as string)) {
    return refuse(
      `Plugin API version "${raw.apiVersion}" is not supported; supported versions: ${
        SUPPORTED_API_VERSIONS.join(", ")
      }`,
    );
  }

  return {
    ok: true,
    manifest: {
      id: raw.id as string,
      version: raw.version as string,
      apiVersion: raw.apiVersion as string,
      entry: (raw.entry as string | undefined) ?? "index.ts",
      capabilities: (raw.capabilities as unknown[] | undefined) ?? [],
      contributions: (raw.contributions as unknown[] | undefined) ?? [],
      settings,
    },
  };
}
