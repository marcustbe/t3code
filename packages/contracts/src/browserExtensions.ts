import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** An unpacked Chrome extension loaded into every desktop preview browser profile. */
export const DesktopBrowserExtension = Schema.Struct({
  path: TrimmedNonEmptyString,
  name: Schema.String,
  version: Schema.String,
  /** Copied from an installed Chrome profile, so removing it also deletes the copy. */
  imported: Schema.Boolean,
  /** Set when the folder is gone or its manifest cannot be read. */
  error: Schema.optional(Schema.String),
});
export type DesktopBrowserExtension = typeof DesktopBrowserExtension.Type;

/** An extension installed in a local Chrome profile that can be copied in. */
export const DesktopChromeExtensionCandidate = Schema.Struct({
  path: TrimmedNonEmptyString,
  chromeId: TrimmedNonEmptyString,
  name: Schema.String,
  version: Schema.String,
  profileName: Schema.String,
});
export type DesktopChromeExtensionCandidate = typeof DesktopChromeExtensionCandidate.Type;

export const DesktopBrowserExtensionPathInput = Schema.Struct({
  path: TrimmedNonEmptyString,
});
