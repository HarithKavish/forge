/**
 * Live state, kept honest (per the plan's "do not fake session status"):
 * two genuinely different sources feed this, and a reader always knows
 * which one it's looking at rather than one collapsed boolean.
 *
 * - Hook-sourced: a native Claude Code hook fired somewhere on this
 *   machine (a terminal, an IDE) -- evidence the process is alive, but the
 *   bridge isn't driving it and has no way to send it a prompt.
 * - Bridge-sourced: the bridge itself called `query({ resume })` and is
 *   actively streaming that session's output -- the bridge *is* the
 *   controller right now.
 *
 * A session with neither is not "offline" by assertion -- it's simply
 * "no evidence," and callers should render that state honestly rather
 * than guessing.
 */

const HOOK_ONLINE_TIMEOUT_MS = 90_000; // matches forge-gateway's own ONLINE_TIMEOUT_MS

export type HookEventState = "working" | "idle" | "stopped";
export type BridgeRunState = "working" | "waiting_for_input" | "done" | "error";

interface HookInfo {
  state: HookEventState;
  activity?: string;
  at: number;
}

interface BridgeControlInfo {
  state: BridgeRunState;
  activity?: string;
  at: number;
}

interface LiveEntry {
  hook?: HookInfo;
  bridgeControl?: BridgeControlInfo;
}

const entries = new Map<string, LiveEntry>();
type Listener = (providerSessionId: string, status: EffectiveStatus) => void;
const listeners = new Set<Listener>();

export function onLiveStateChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(providerSessionId: string): void {
  const status = getEffectiveStatus(providerSessionId);
  for (const listener of listeners) listener(providerSessionId, status);
}

export function recordHookEvent(providerSessionId: string, state: HookEventState, activity?: string): void {
  const entry = entries.get(providerSessionId) ?? {};
  entry.hook = { state, activity, at: Date.now() };
  entries.set(providerSessionId, entry);
  notify(providerSessionId);
}

export function recordBridgeControl(providerSessionId: string, state: BridgeRunState, activity?: string): void {
  const entry = entries.get(providerSessionId) ?? {};
  entry.bridgeControl = { state, activity, at: Date.now() };
  entries.set(providerSessionId, entry);
  notify(providerSessionId);
}

export function clearBridgeControl(providerSessionId: string): void {
  const entry = entries.get(providerSessionId);
  if (entry) {
    entry.bridgeControl = undefined;
    notify(providerSessionId);
  }
}

export interface EffectiveStatus {
  source: "bridge" | "hook" | "none";
  /** True only when there is live, recent evidence -- never asserted from
   *  a session merely existing on disk. */
  live: boolean;
  state?: HookEventState | BridgeRunState;
  activity?: string;
  lastEventAt?: number;
  /** Set only while the bridge itself holds an open resume() stream --
   *  the concurrency lock check reads this, not `live`. */
  controlledByBridge: boolean;
}

export function getEffectiveStatus(providerSessionId: string): EffectiveStatus {
  const entry = entries.get(providerSessionId);
  if (!entry) return { source: "none", live: false, controlledByBridge: false };

  if (entry.bridgeControl) {
    return {
      source: "bridge",
      live: entry.bridgeControl.state === "working" || entry.bridgeControl.state === "waiting_for_input",
      state: entry.bridgeControl.state,
      activity: entry.bridgeControl.activity,
      lastEventAt: entry.bridgeControl.at,
      controlledByBridge: true,
    };
  }

  if (entry.hook) {
    const fresh = Date.now() - entry.hook.at < HOOK_ONLINE_TIMEOUT_MS;
    return {
      source: "hook",
      live: fresh && entry.hook.state !== "stopped",
      state: entry.hook.state,
      activity: entry.hook.activity,
      lastEventAt: entry.hook.at,
      controlledByBridge: false,
    };
  }

  return { source: "none", live: false, controlledByBridge: false };
}

export function isControlledByBridge(providerSessionId: string): boolean {
  return entries.get(providerSessionId)?.bridgeControl !== undefined;
}
