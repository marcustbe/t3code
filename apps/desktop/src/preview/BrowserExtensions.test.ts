import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import type { Session } from "electron";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { vi } from "vite-plus/test";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as BrowserExtensions from "./BrowserExtensions.ts";

const CHROME_ID = "abcdefghijklmnopabcdefghijklmnop";

const layer = (baseDir: string) =>
  BrowserExtensions.layer.pipe(
    Layer.provideMerge(
      DesktopEnvironment.layer({
        dirname: "/repo/apps/desktop/src",
        homeDirectory: baseDir,
        platform: "darwin",
        processArch: "arm64",
        appVersion: "1.2.3",
        appPath: "/repo",
        isPackaged: true,
        resourcesPath: "/missing/resources",
        runningUnderArm64Translation: false,
      }).pipe(
        Layer.provide(
          Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({ T3CODE_HOME: baseDir })),
        ),
      ),
    ),
    Layer.provideMerge(NodeServices.layer),
  );

const fakeSession = () => {
  const loadExtension = vi.fn((path: string) => Promise.resolve({ id: `id:${path}` }));
  const removeExtension = vi.fn();
  const session = { extensions: { loadExtension, removeExtension } } as unknown as Session;
  return { session, loadExtension, removeExtension };
};

describe("BrowserExtensions", () => {
  it.effect("imports a Chrome extension as a clean copy, loads it everywhere and removes it", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-browser-ext-" });
      const chromeRoot = `${baseDir}/Library/Application Support/Google/Chrome`;
      const source = `${chromeRoot}/Default/Extensions/${CHROME_ID}/1.10.0_0`;
      yield* fileSystem.makeDirectory(`${source}/_locales/en`, { recursive: true });
      yield* fileSystem.makeDirectory(`${source}/_metadata`, { recursive: true });
      yield* fileSystem.makeDirectory(`${chromeRoot}/Default/Extensions/${CHROME_ID}/1.9.0_0`, {
        recursive: true,
      });
      yield* fileSystem.writeFileString(
        `${chromeRoot}/Local State`,
        JSON.stringify({ profile: { info_cache: { Default: { name: "Personal" } } } }),
      );
      yield* fileSystem.writeFileString(
        `${source}/manifest.json`,
        JSON.stringify({ name: "__MSG_appName__", version: "1.10.0", default_locale: "en" }),
      );
      yield* fileSystem.writeFileString(
        `${source}/_locales/en/messages.json`,
        JSON.stringify({ appname: { message: "Dark Reader" } }),
      );
      yield* fileSystem.writeFileString(`${source}/_metadata/verified_contents.json`, "[]");

      yield* Effect.gen(function* () {
        const extensions = yield* BrowserExtensions.BrowserExtensions;
        const first = fakeSession();
        yield* extensions.attach(first.session);

        const candidates = yield* extensions.listChromeCandidates;
        assert.deepStrictEqual(
          candidates.map(({ name, version, profileName, path }) => ({
            name,
            version,
            profileName,
            path,
          })),
          [
            {
              name: "Dark Reader",
              version: "1.10.0",
              profileName: "Chrome (Personal)",
              path: source,
            },
          ],
        );

        const imported = yield* extensions.importFromChrome(source);
        assert.isTrue(imported.imported);
        assert.notEqual(imported.path, source);
        assert.isTrue(yield* fileSystem.exists(`${imported.path}/manifest.json`));
        assert.isFalse(yield* fileSystem.exists(`${imported.path}/_metadata`));
        assert.deepStrictEqual(first.loadExtension.mock.calls[0]?.[0], imported.path);

        // A session created later (another profile, or the next launch) gets the saved list.
        const second = fakeSession();
        yield* extensions.attach(second.session);
        assert.deepStrictEqual(second.loadExtension.mock.calls[0]?.[0], imported.path);
        assert.deepStrictEqual(
          (yield* extensions.list).map(({ name, error }) => ({ name, error })),
          [{ name: "Dark Reader", error: undefined }],
        );

        yield* extensions.remove(imported.path);
        assert.deepStrictEqual(first.removeExtension.mock.calls, [[`id:${imported.path}`]]);
        assert.deepStrictEqual(second.removeExtension.mock.calls, [[`id:${imported.path}`]]);
        assert.isFalse(yield* fileSystem.exists(imported.path));
        assert.isTrue(yield* fileSystem.exists(`${source}/manifest.json`));
        assert.deepStrictEqual(yield* extensions.list, []);
      }).pipe(Effect.provide(layer(baseDir)));
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.effect("refuses a folder without a manifest and paths outside Chrome profiles", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-browser-ext-" });
      yield* Effect.gen(function* () {
        const extensions = yield* BrowserExtensions.BrowserExtensions;
        const added = yield* Effect.flip(extensions.add(baseDir));
        assert.strictEqual(added._tag, "BrowserExtensionError");
        const imported = yield* Effect.flip(extensions.importFromChrome(baseDir));
        assert.strictEqual(imported._tag, "BrowserExtensionError");
        assert.deepStrictEqual(yield* extensions.list, []);
      }).pipe(Effect.provide(layer(baseDir)));
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
});
