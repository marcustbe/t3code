import { CommandId, type OrchestrationV2Run, type ScheduledTask } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { forkParked } from "../serverActivation.ts";
import * as ScheduledTaskService from "./ScheduledTaskService.ts";

/** Matches the message id ScheduledTaskService gives each run: `scheduled-task-message:<task id>:…`. */
const ROUTINE_MESSAGE_PREFIX = "scheduled-task-message:";

/**
 * The routine whose run this is. Task ids may contain colons, so the longest
 * id that prefixes the message id wins.
 */
export function routineForRun(
  run: Pick<OrchestrationV2Run, "userMessageId">,
  tasks: ReadonlyArray<Pick<ScheduledTask, "id" | "settleWhenDone">>,
): Pick<ScheduledTask, "id" | "settleWhenDone"> | null {
  if (!run.userMessageId.startsWith(ROUTINE_MESSAGE_PREFIX)) return null;
  const rest = run.userMessageId.slice(ROUTINE_MESSAGE_PREFIX.length);
  let match: Pick<ScheduledTask, "id" | "settleWhenDone"> | null = null;
  for (const task of tasks) {
    if (!rest.startsWith(`${task.id}:`)) continue;
    if (match === null || task.id.length > match.id.length) match = task;
  }
  return match;
}

/**
 * Ghost: a snoozed routine (`settleWhenDone`) settles its chat as soon as a run
 * completes, so it goes to Settled instead of Done. Failed or stopped runs stay
 * in Done; a run queued after this one makes the settle refuse.
 */
export const make = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const scheduledTasks = yield* ScheduledTaskService.ScheduledTaskService;

  const settleIfSnoozed = Effect.fn("ScheduledTaskSettleReactor.settleIfSnoozed")(
    function* (run: OrchestrationV2Run) {
      const { tasks } = yield* scheduledTasks.list();
      const task = routineForRun(run, tasks);
      if (task?.settleWhenDone !== true) return;
      yield* orchestrator.dispatch({
        type: "thread.settle",
        // One settle per completed run, even across duplicate events.
        commandId: CommandId.make(`server:routine-settle:${run.threadId}:${run.id}`),
        threadId: run.threadId,
        expectedLatestRunId: run.id,
      });
    },
    (effect, run) =>
      effect.pipe(
        Effect.catch((cause) =>
          Effect.logInfo("snoozed routine settle skipped", { threadId: run.threadId, cause }),
        ),
      ),
  );

  const start = Effect.fn("ScheduledTaskSettleReactor.start")(function* () {
    yield* forkParked(
      Stream.runForEach(orchestrator.streamDomainEvents, (event) =>
        event.type === "run.updated" &&
        event.payload.status === "completed" &&
        event.payload.userMessageId.startsWith(ROUTINE_MESSAGE_PREFIX)
          ? settleIfSnoozed(event.payload)
          : Effect.void,
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Snoozed routine settle stream failed", { cause }),
        ),
      ),
    );
  });
  return { start };
});
