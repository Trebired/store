import { result } from "@package/result";
import type { RuntimeBootFollowUpOutcome } from "#pq1c0xwc48qu";

type BootFollowUpOutcomeDetails = {
  recordId?: string;
  message?: string;
  error_code?: string;
  result?: unknown;
  details?: unknown;
};

function bootFollowUpSkipped(
  call: string,
  entity: string,
  details: BootFollowUpOutcomeDetails = {},
): RuntimeBootFollowUpOutcome {
  const envelope = result.noop("boot-follow-up-skipped", {
      details: details.details,
      meta: {
        message: details.message || "Boot follow-up skipped.",
      },
  });
  return {
    ...envelope,
    call,
    entity,
    error_code: details.error_code || envelope.status_code,
    message: details.message || "Boot follow-up skipped.",
    recordId: details.recordId,
    result: details.result,
    skipped: true,
  };
}

function bootFollowUpSucceeded(
  call: string,
  entity: string,
  value?: unknown,
  recordId?: string,
): RuntimeBootFollowUpOutcome {
  const envelope = result.ok("boot-follow-up-completed", {
      data: value ?? null,
  });
  return {
    ...envelope,
    call,
    entity,
    message: "Boot follow-up completed.",
    recordId,
    result: value,
    skipped: false,
  };
}

function bootFollowUpFailed(
  call: string,
  entity: string,
  error?: unknown,
  recordId?: string,
): RuntimeBootFollowUpOutcome {
  const message = error instanceof Error ? error.message : "Boot follow-up failed.";
  const envelope = result.error("boot-follow-up-failed", 500, {
      details: {
        cause: error,
        message,
      },
  });
  return {
    ...envelope,
    call,
    entity,
    message,
    recordId,
    result: error,
    skipped: false,
  };
}

export {
  bootFollowUpFailed,
  bootFollowUpSkipped,
  bootFollowUpSucceeded,
};
export type {
  BootFollowUpOutcomeDetails,
};
