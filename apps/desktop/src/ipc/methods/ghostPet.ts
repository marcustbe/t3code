import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import { getDesktopUrl } from "../../electron/ElectronProtocol.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import { GhostPetWindow } from "../../ghostPet/GhostPetWindow.ts";
import { GHOST_PET_COMMAND_CHANNEL, SET_GHOST_PET_CHANNEL } from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number });

const GhostPetState = Schema.Struct({
  chats: Schema.Array(
    Schema.Struct({
      environmentId: Schema.String,
      threadId: Schema.String,
      title: Schema.String,
      state: Schema.Literals(["working", "needs", "done", "failed"]),
    }),
  ).check(Schema.isMaxLength(200)),
});

/** The floating Ghost pet: the app window feeds it chat states and it asks the app to open chats. */
export const installGhostPet = Effect.fn("desktop.ipc.installGhostPet")(function* () {
  const ipc = yield* DesktopIpc.DesktopIpc;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const path = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;
  const runFork = Effect.runForkWith(yield* Effect.context<never>());
  const statePath = path.join(environment.stateDir, "ghost-pet.json");

  const command = Effect.fn("desktop.ghostPet.command")(function* (payload: unknown) {
    const main = yield* electronWindow.main;
    if (Option.isNone(main)) return;
    yield* electronWindow.reveal(main.value);
    if (payload !== null) main.value.webContents.send(GHOST_PET_COMMAND_CHANNEL, payload);
  });
  const initialCenter = yield* fileSystem
    .readFileString(statePath)
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Point))), Effect.option);

  const pet = new GhostPetWindow({
    preload: path.join(environment.dirname, "ghost-pet-preload.cjs"),
    url: `${getDesktopUrl(environment.isDevelopment)}pet.html`,
    initialCenter: Option.getOrNull(initialCenter),
    // The position is a convenience; failing to save it only resets the Ghost to its corner.
    saveCenter: (center) =>
      runFork(fileSystem.writeFileString(statePath, JSON.stringify(center)).pipe(Effect.ignore)),
    onOpen: (thread) => runFork(command(thread === null ? null : { type: "open", ...thread })),
    onHide: () => runFork(command({ type: "hide" })),
  });
  yield* Effect.addFinalizer(() => Effect.sync(() => pet.dispose()));

  yield* ipc.handle(
    DesktopIpc.makeIpcMethod({
      channel: SET_GHOST_PET_CHANNEL,
      payload: Schema.NullOr(GhostPetState),
      result: Schema.Void,
      handler: (state) => Effect.sync(() => pet.update(state === null ? null : state.chats)),
    }),
  );
});
