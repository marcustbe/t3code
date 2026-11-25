import {
  MessageId,
  type OrchestrationV2Command,
  type OrchestrationV2DomainEvent,
  RunId,
  ScheduledTaskId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ScheduledTaskService from "./ScheduledTaskService.ts";
import * as ScheduledTaskSettleReactor from "./ScheduledTaskSettleReactor.ts";
import { routineForRun } from "./ScheduledTaskSettleReactor.ts";

it("matches a run to the routine that sent it, preferring the longest id", () => {
  const tasks = [
    { id: ScheduledTaskId.make("daily"), settleWhenDone: true },
    { id: ScheduledTaskId.make("daily:news"), settleWhenDone: false },
  ];
  const run = (id: string) => ({ userMessageId: MessageId.make(id) });

  assert.equal(
    routineForRun(run("scheduled-task-message:daily:1700:schedule"), tasks)?.id,
    "daily",
  );
  assert.equal(
    routineForRun(run("scheduled-task-message:daily:news:1700:schedule"), tasks)?.id,
    "daily:news",
  );
  assert.equal(routineForRun(run("scheduled-task-message:weekly:1700:schedule"), tasks), null);
  assert.equal(routineForRun(run("message:daily:1700"), tasks), null);
});

it.effect("settles only completed runs of snoozed routines", () =>
  Effect.gen(function* () {
    const runEvent = (thread: string, messageId: string, status: string) =>
      ({
        type: "run.updated",
        threadId: ThreadId.make(thread),
        payload: {
          id: RunId.make(`run:${thread}`),
          threadId: ThreadId.make(thread),
          userMessageId: MessageId.make(messageId),
          status,
        },
      }) as unknown as OrchestrationV2DomainEvent;
    const events = [
      runEvent("snoozed", "scheduled-task-message:quiet:1:schedule", "completed"),
      runEvent("loud", "scheduled-task-message:loud:1:schedule", "completed"),
      runEvent("failed", "scheduled-task-message:quiet:2:schedule", "failed"),
      runEvent("user", "message:1", "completed"),
      runEvent("snoozed-again", "scheduled-task-message:quiet:3:manual", "completed"),
    ];
    const dispatched = yield* Queue.unbounded<OrchestrationV2Command>();

    yield* ScheduledTaskSettleReactor.make.pipe(
      Effect.flatMap((reactor) => reactor.start()),
      Effect.provideService(Orchestrator.OrchestratorV2, {
        streamDomainEvents: Stream.fromIterable(events),
        dispatch: (command: OrchestrationV2Command) =>
          Queue.offer(dispatched, command).pipe(Effect.as({ sequence: 1 })),
      } as unknown as Orchestrator.OrchestratorV2["Service"]),
      Effect.provideService(ScheduledTaskService.ScheduledTaskService, {
        list: () =>
          Effect.succeed({
            tasks: [
              { id: ScheduledTaskId.make("quiet"), settleWhenDone: true },
              { id: ScheduledTaskId.make("loud") },
            ],
          }),
      } as unknown as ScheduledTaskService.ScheduledTaskService["Service"]),
    );

    const first = yield* Queue.take(dispatched);
    const second = yield* Queue.take(dispatched);
    assert.deepEqual(
      [first, second].map((command) =>
        command.type === "thread.settle"
          ? `${command.threadId} ${command.expectedLatestRunId}`
          : command.type,
      ),
      ["snoozed run:snoozed", "snoozed-again run:snoozed-again"],
    );
  }).pipe(Effect.scoped),
);
