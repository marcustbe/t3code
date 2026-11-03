import type { DesktopBrowserExtension, DesktopChromeExtensionCandidate } from "@t3tools/contracts";
import type { Session } from "electron";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { BROWSER_IMPORT_SOURCES } from "./BrowserImport/Sources.ts";

const StoredExtensions = Schema.fromJsonString(
  Schema.Struct({
    extensions: Schema.Array(Schema.Struct({ path: Schema.String, imported: Schema.Boolean })),
  }),
);
type StoredExtension = (typeof StoredExtensions.Type)["extensions"][number];
const decodeStoredExtensions = Schema.decodeEffect(StoredExtensions);
const encodeStoredExtensions = Schema.encodeEffect(StoredExtensions);

const Manifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.optional(Schema.String),
    version: Schema.optional(Schema.String),
    default_locale: Schema.optional(Schema.String),
  }),
);

const LocaleMessages = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Struct({ message: Schema.optional(Schema.String) })),
);

const LocalState = Schema.fromJsonString(
  Schema.Struct({
    profile: Schema.optional(
      Schema.Struct({
        info_cache: Schema.optional(
          Schema.Record(Schema.String, Schema.Struct({ name: Schema.optional(Schema.String) })),
        ),
      }),
    ),
  }),
);

const decodeManifest = Schema.decodeEffect(Manifest);
const decodeLocaleMessages = Schema.decodeEffect(LocaleMessages);
const decodeLocalState = Schema.decodeEffect(LocalState);

export class BrowserExtensionError extends Schema.TaggedError<BrowserExtensionError>()(
  "BrowserExtensionError",
  { path: Schema.String, reason: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return `${this.reason} (${this.path})`;
  }
}

export class BrowserExtensions extends Context.Service<
  BrowserExtensions,
  {
    /** Loads every saved extension into a preview session; later adds and removes follow it. */
    readonly attach: (session: Session) => Effect.Effect<void>;
    readonly list: Effect.Effect<ReadonlyArray<DesktopBrowserExtension>>;
    readonly add: (path: string) => Effect.Effect<DesktopBrowserExtension, BrowserExtensionError>;
    readonly remove: (path: string) => Effect.Effect<void>;
    readonly listChromeCandidates: Effect.Effect<ReadonlyArray<DesktopChromeExtensionCandidate>>;
    readonly importFromChrome: (
      path: string,
    ) => Effect.Effect<DesktopBrowserExtension, BrowserExtensionError>;
  }
>()("@t3tools/desktop/preview/BrowserExtensions") {}

/** @public */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const { path } = environment;
  const storePath = path.join(environment.stateDir, "browser-extensions.json");
  const importDir = path.join(environment.stateDir, "browser-extensions");
  const mutex = yield* Semaphore.make(1);
  /** Extension ids Electron assigned, per attached session and extension path. */
  const attached = new Map<Session, Map<string, string>>();

  const readStore = fileSystem.readFileString(storePath).pipe(
    Effect.flatMap(decodeStoredExtensions),
    Effect.map((store) => store.extensions),
    Effect.orElseSucceed((): ReadonlyArray<StoredExtension> => []),
  );
  const writeStore = (extensions: ReadonlyArray<StoredExtension>) =>
    fileSystem.makeDirectory(environment.stateDir, { recursive: true }).pipe(
      Effect.andThen(encodeStoredExtensions({ extensions })),
      Effect.flatMap((json) => fileSystem.writeFileString(storePath, json)),
      Effect.catch((error) => Effect.logWarning("Could not save browser extensions.", { error })),
    );

  const localizedName = Effect.fnUntraced(function* (
    directory: string,
    name: string,
    defaultLocale: string | undefined,
  ) {
    const key = /^__MSG_(.+)__$/.exec(name)?.[1];
    if (key === undefined) return name;
    for (const locale of [defaultLocale, "en", "en_US"]) {
      if (locale === undefined) continue;
      const messages = yield* fileSystem
        .readFileString(path.join(directory, "_locales", locale, "messages.json"))
        .pipe(Effect.flatMap(decodeLocaleMessages), Effect.option);
      if (Option.isNone(messages)) continue;
      const match = Object.entries(messages.value).find(
        ([candidate]) => candidate.toLowerCase() === key.toLowerCase(),
      );
      if (match?.[1].message) return match[1].message;
    }
    return path.basename(directory);
  });

  const describe = Effect.fnUntraced(function* (directory: string) {
    const manifest = yield* fileSystem
      .readFileString(path.join(directory, "manifest.json"))
      .pipe(Effect.flatMap(decodeManifest), Effect.option);
    if (Option.isNone(manifest)) return Option.none();
    const { name, version, default_locale } = manifest.value;
    return Option.some({
      name: yield* localizedName(directory, name ?? path.basename(directory), default_locale),
      version: version ?? "",
    });
  });

  const toExtension = Effect.fnUntraced(function* (stored: StoredExtension) {
    const described = yield* describe(stored.path);
    return Option.match(described, {
      onNone: (): DesktopBrowserExtension => ({
        path: stored.path,
        imported: stored.imported,
        name: path.basename(stored.path),
        version: "",
        error: "Folder or manifest.json is missing",
      }),
      onSome: (info): DesktopBrowserExtension => ({ ...stored, ...info }),
    });
  });

  const loadInto = (session: Session, extensionPath: string) => {
    const loaded = attached.get(session);
    if (!loaded || loaded.has(extensionPath)) return Effect.void;
    return Effect.tryPromise(() =>
      session.extensions.loadExtension(extensionPath, { allowFileAccess: true }),
    ).pipe(
      Effect.tap((extension) => Effect.sync(() => loaded.set(extensionPath, extension.id))),
      Effect.asVoid,
    );
  };

  const unloadEverywhere = (extensionPath: string) =>
    Effect.sync(() => {
      for (const [session, loaded] of attached) {
        const id = loaded.get(extensionPath);
        if (id === undefined) continue;
        loaded.delete(extensionPath);
        try {
          session.extensions.removeExtension(id);
        } catch {}
      }
    });

  const addStored = Effect.fn("BrowserExtensions.save")(
    function* (stored: StoredExtension) {
      const described = yield* describe(stored.path);
      if (Option.isNone(described)) {
        return yield* new BrowserExtensionError({
          path: stored.path,
          reason: "No manifest.json in this folder; pick an unpacked extension folder",
        });
      }
      // Reloads a re-added folder so its current files are used.
      yield* unloadEverywhere(stored.path);
      for (const session of attached.keys()) {
        yield* loadInto(session, stored.path).pipe(
          Effect.mapError(
            (cause) =>
              new BrowserExtensionError({
                path: stored.path,
                reason: "Electron could not load this extension",
                cause,
              }),
          ),
        );
      }
      const current = yield* readStore;
      yield* writeStore([...current.filter((entry) => entry.path !== stored.path), stored]);
      return { ...stored, ...described.value } satisfies DesktopBrowserExtension;
    },
    (effect) => mutex.withPermits(1)(effect),
  );

  const chromeCandidates = Effect.gen(function* () {
    const context = {
      path,
      platform: environment.platform,
      home: environment.homeDirectory,
      appData: process.env.APPDATA,
      localAppData: process.env.LOCALAPPDATA,
    };
    const candidates: DesktopChromeExtensionCandidate[] = [];
    for (const source of BROWSER_IMPORT_SOURCES) {
      if (source.engine !== "chromium" || !source.platforms.includes(environment.platform)) {
        continue;
      }
      const root = source.userDataDirectory(context);
      if (root === undefined) continue;
      const profileNames = yield* fileSystem.readFileString(path.join(root, "Local State")).pipe(
        Effect.flatMap(decodeLocalState),
        Effect.map((state) => state.profile?.info_cache ?? {}),
        Effect.orElseSucceed(() => ({}) as Record<string, { readonly name?: string }>),
      );
      const profiles = yield* fileSystem
        .readDirectory(root)
        .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
      for (const profile of profiles) {
        const extensionsDir = path.join(root, profile, "Extensions");
        const ids = yield* fileSystem
          .readDirectory(extensionsDir)
          .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
        for (const chromeId of ids) {
          if (!/^[a-p]{32}$/.test(chromeId)) continue;
          const versions = yield* fileSystem
            .readDirectory(path.join(extensionsDir, chromeId))
            .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
          const latest = versions
            .filter((version) => !version.startsWith("."))
            .toSorted((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
          if (latest === undefined) continue;
          const directory = path.join(extensionsDir, chromeId, latest);
          const described = yield* describe(directory);
          if (Option.isNone(described)) continue;
          candidates.push({
            path: directory,
            chromeId,
            ...described.value,
            profileName: `${source.name} (${profileNames[profile]?.name?.trim() || profile})`,
          });
        }
      }
    }
    return candidates.toSorted((a, b) => a.name.localeCompare(b.name));
  });

  const serialized = <A, E, R>(effect: Effect.Effect<A, E, R>) => mutex.withPermits(1)(effect);

  // Serialized so a second webview on the same session waits until its extensions are loaded.
  const attach = Effect.fn("BrowserExtensions.attach")(function* (session: Session) {
    if (attached.has(session)) return;
    attached.set(session, new Map());
    for (const stored of yield* readStore) {
      yield* loadInto(session, stored.path).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Could not load browser extension.", { path: stored.path, error }),
        ),
      );
    }
  }, serialized);

  const remove = Effect.fn("BrowserExtensions.remove")(function* (extensionPath: string) {
    yield* unloadEverywhere(extensionPath);
    const current = yield* readStore;
    const entry = current.find((stored) => stored.path === extensionPath);
    yield* writeStore(current.filter((stored) => stored.path !== extensionPath));
    // Only copies this app made are deleted; a folder the user picked stays untouched.
    if (entry?.imported && path.dirname(entry.path) === importDir) {
      yield* fileSystem.remove(entry.path, { recursive: true, force: true }).pipe(Effect.ignore);
    }
  }, serialized);

  const importFromChrome = Effect.fn("BrowserExtensions.importFromChrome")(function* (
    sourcePath: string,
  ) {
    const candidate = (yield* chromeCandidates).find((entry) => entry.path === sourcePath);
    if (candidate === undefined) {
      return yield* new BrowserExtensionError({
        path: sourcePath,
        reason: "Not an extension installed in a local Chrome profile",
      });
    }
    // Copy so Chrome's own updates and cleanup never break the loaded path.
    const target = path.join(importDir, candidate.chromeId);
    yield* Effect.gen(function* () {
      yield* fileSystem.makeDirectory(importDir, { recursive: true });
      yield* fileSystem.remove(target, { recursive: true, force: true });
      yield* fileSystem.copy(candidate.path, target);
      // Chrome refuses unpacked folders with reserved `_`-prefixed entries other than _locales.
      yield* fileSystem.remove(path.join(target, "_metadata"), { recursive: true, force: true });
    }).pipe(
      Effect.mapError(
        (cause) =>
          new BrowserExtensionError({
            path: sourcePath,
            reason: "Could not copy the extension from Chrome",
            cause,
          }),
      ),
    );
    return yield* addStored({ path: target, imported: true });
  });

  const add = Effect.fn("BrowserExtensions.add")(function* (extensionPath: string) {
    return yield* addStored({ path: path.resolve(extensionPath), imported: false });
  });

  return BrowserExtensions.of({
    attach,
    list: Effect.gen(function* () {
      return yield* Effect.forEach(yield* readStore, toExtension);
    }),
    add,
    remove,
    listChromeCandidates: chromeCandidates,
    importFromChrome,
  });
}).pipe(Effect.withSpan("BrowserExtensions.make"));

export const layer = Layer.effect(BrowserExtensions, make);
