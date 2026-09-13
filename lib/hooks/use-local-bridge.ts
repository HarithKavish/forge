"use client";

/**
 * Shared local-bridge client logic (docs/BRIDGE.md "Local bridge
 * discovery"). Fixed local port, no manual URL/token -- the browser probes
 * on its own, and links automatically once it detects an unlinked bridge.
 *
 * bridgeToken lives in memory only (a module-level variable, not
 * localStorage): once the browser has linked, `/link`'s response handed it
 * back a fresh token this same page load; there is nothing to persist
 * across reloads because /discover + /link happens again, harmlessly, on
 * every page load (idempotent -- linking an already-linked bridge just
 * re-confirms the same workspace).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { mintBridgePairingTokenAction } from "@/lib/data/actions";
import type { NormalizedPart } from "@/components/agent-sessions/local-bridge-types";

export const BRIDGE_PORT = 4317;
const BRIDGE_ORIGIN = `http://127.0.0.1:${BRIDGE_PORT}`;

let bridgeTokenMemo: string | undefined;

export interface DiscoveredSession {
  providerSessionId: string;
  summary: string;
  customTitle?: string;
  firstPrompt?: string;
  gitBranch?: string;
  cwd?: string;
  lastModified: number;
  status: {
    source: "bridge" | "hook" | "none";
    live: boolean;
    state?: string;
    activity?: string;
    controlledByBridge: boolean;
  };
}

export interface HistoryMessage {
  uuid: string;
  role: "user" | "assistant";
  parts: NormalizedPart[];
}

export type BridgeConnection =
  | { phase: "checking" }
  | { phase: "not_found" }
  | { phase: "unlinked" }
  | { phase: "linked" };

async function bridgeFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BRIDGE_ORIGIN}${path}`, {
    ...init,
    headers: { ...init?.headers, ...(bridgeTokenMemo ? { Authorization: `Bearer ${bridgeTokenMemo}` } : {}) },
  });
}

/**
 * Detects a bridge and links it automatically if it isn't yet -- no
 * user-visible step beyond, at most, one confirmation click, and no URL or
 * token ever shown. Safe to call from anywhere that needs the bridge (the
 * project panel's "Link agent session" flow); it's cheap and idempotent.
 */
export function useLocalBridge() {
  const [connection, setConnection] = useState<BridgeConnection>({ phase: "checking" });
  const [linking, setLinking] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const probe = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_ORIGIN}/discover`);
      if (!res.ok) throw new Error("not found");
      const data = (await res.json()) as { connected: boolean; linked: boolean };
      if (!mounted.current) return;
      if (!data.linked) {
        setConnection({ phase: "unlinked" });
        return;
      }
      // Already linked (a prior page load did it) -- but this fresh page
      // load has no bridgeToken in memory yet, so re-link transparently to
      // fetch one. Same one-request cost as a fresh link; no UI shown.
      if (!bridgeTokenMemo) {
        await linkNow();
        return;
      }
      setConnection({ phase: "linked" });
    } catch {
      if (mounted.current) setConnection({ phase: "not_found" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkNow = useCallback(async () => {
    setLinking(true);
    try {
      const result = await mintBridgePairingTokenAction();
      if ("error" in result) throw new Error(result.error);
      const res = await fetch(`${BRIDGE_ORIGIN}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingToken: result.token }),
      });
      if (!res.ok) throw new Error("The bridge rejected the pairing token.");
      const data = (await res.json()) as { bridgeToken: string };
      bridgeTokenMemo = data.bridgeToken;
      if (mounted.current) setConnection({ phase: "linked" });
    } catch (error) {
      console.error("Failed to link local bridge:", error);
      if (mounted.current) setConnection({ phase: "not_found" });
    } finally {
      if (mounted.current) setLinking(false);
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  const listSessions = useCallback(async (): Promise<DiscoveredSession[]> => {
    const res = await bridgeFetch("/sessions");
    if (!res.ok) return [];
    return (await res.json()) as DiscoveredSession[];
  }, []);

  const getMessages = useCallback(async (providerSessionId: string, limit = 50): Promise<HistoryMessage[]> => {
    const res = await bridgeFetch(`/sessions/${encodeURIComponent(providerSessionId)}/messages?limit=${limit}`);
    if (!res.ok) return [];
    return (await res.json()) as HistoryMessage[];
  }, []);

  const sendMessage = useCallback(
    (providerSessionId: string, prompt: string) =>
      bridgeFetch(`/sessions/${encodeURIComponent(providerSessionId)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }),
    [],
  );

  const connectLive = useCallback((onUpdate: (providerSessionId: string, status: DiscoveredSession["status"]) => void) => {
    if (!bridgeTokenMemo) return () => {};
    const ws = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}/live?token=${bridgeTokenMemo}`);
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; providerSessionId?: string; status?: DiscoveredSession["status"] };
      if (message.type === "status" && message.providerSessionId && message.status) {
        onUpdate(message.providerSessionId, message.status);
      }
    };
    return () => ws.close();
  }, []);

  return { connection, linking, linkNow, listSessions, getMessages, sendMessage, connectLive };
}
