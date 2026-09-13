import { pushPresence } from "../gatewayClient.js";
import { recordHookEvent, type HookEventState } from "../liveState.js";

/**
 * What a native Claude Code `type: "http"` hook actually POSTs -- confirmed
 * fields: session_id, cwd, transcript_path, hook_event_name, and (on tool
 * hooks) tool_name/tool_input/tool_result. Reads only event name + tool
 * name + session/cwd identity, the same restraint forge-gateway's old
 * adapters/claude.ts already applied and for the same reason: this
 * payload's tool_input/tool_result can carry real file contents and
 * command output, and none of that is meant to leave this function -- it
 * is never forwarded to forge-gateway (see gatewayClient.ts). It's only
 * ever used locally, and only for the event-name/tool-name category label.
 */
export interface ClaudeHookPayload {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
}

function classify(payload: ClaudeHookPayload): { state: HookEventState; activity?: string } {
  switch (payload.hook_event_name) {
    case "SessionStart":
      return { state: "working", activity: "Session started" };
    case "UserPromptSubmit":
      return { state: "working", activity: "Processing prompt" };
    case "PreToolUse":
      return { state: "working", activity: payload.tool_name ? `Running ${payload.tool_name}` : "Running a tool" };
    case "PostToolUse":
      return { state: "working", activity: payload.tool_name ? `Finished ${payload.tool_name}` : "Finished a tool" };
    case "PostToolUseFailure":
      return { state: "working", activity: payload.tool_name ? `${payload.tool_name} failed` : "A tool failed" };
    case "PermissionRequest":
      return { state: "idle", activity: "Waiting for permission" };
    case "SubagentStart":
      return { state: "working", activity: "Subagent started" };
    case "SubagentStop":
      return { state: "working", activity: "Subagent finished" };
    case "Stop":
      // End of one turn, not the CLI session -- still open, waiting on the
      // next prompt (docs/WORLDVIEW.md's existing reasoning, unchanged).
      return { state: "idle", activity: "Waiting for input" };
    case "SessionEnd":
      return { state: "stopped" };
    default:
      return { state: "working", activity: payload.hook_event_name };
  }
}

export async function handleClaudeHook(payload: ClaudeHookPayload): Promise<void> {
  if (!payload.session_id) return; // nothing to key this event by

  const { state, activity } = classify(payload);
  recordHookEvent(payload.session_id, state, activity);
  await pushPresence({ providerSessionId: payload.session_id, cwd: payload.cwd, state, activity });
}
