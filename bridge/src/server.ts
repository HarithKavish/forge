import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import { ALLOWED_ORIGINS, BRIDGE_PORT } from "./config.js";
import { handleClaudeHook, type ClaudeHookPayload } from "./hooks/receiver.js";
import { discoverSessions, getHistory, getSession } from "./claude/sdk.js";
import { resumeAndStream, SessionAlreadyControlledError } from "./claude/resume.js";
import { getEffectiveStatus, onLiveStateChange } from "./liveState.js";
import { readPairingClaims } from "./pairing.js";
import { loadState, saveState } from "./state.js";

/**
 * The bridge's local API. Two very different trust levels share one
 * process, kept structurally separate:
 *
 * - Browser -> bridge (this file's HTTP/WS routes below `requireBridgeAuth`):
 *   gated on `bridgeToken`, a secret generated once on this machine and
 *   handed to the browser exactly once via a one-time link (never sent to
 *   Forge's remote side). CORS is restricted to Forge's own origins so a
 *   response body can't be read cross-origin even if some other open tab
 *   fires a blind request.
 * - Claude Code hook -> bridge (`/hooks/claude`): same bridgeToken, baked
 *   into the hook's own `headers` by the installer -- loopback-only, so the
 *   realistic threat model is "another local process," not the network.
 *
 * No route here ever accepts or returns a Forge session cookie or the
 * pairing token's signing secret -- the bridge only ever forwards the
 * opaque pairing token onward to forge-gateway (gatewayClient.ts).
 */

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length);
}

function requireBridgeAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const state = loadState();
  if (bearerToken(req) !== state.bridgeToken) {
    sendJson(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    // Loopback-only, bridgeToken-gated, never subject to browser CORS
    // (Claude Code's hook client isn't a browser) -- see file header.
    if (req.method === "POST" && url.pathname === "/hooks/claude") {
      if (!requireBridgeAuth(req, res)) return;
      const payload = JSON.parse(await readBody(req)) as ClaudeHookPayload;
      await handleClaudeHook(payload);
      sendJson(res, 200, {});
      return;
    }

    if (req.method === "POST" && url.pathname === "/pair") {
      if (!requireBridgeAuth(req, res)) return;
      const { pairingToken } = JSON.parse(await readBody(req)) as { pairingToken?: string };
      if (!pairingToken) return sendJson(res, 400, { error: "pairingToken required" });
      const claims = readPairingClaims(pairingToken);
      if (!claims) return sendJson(res, 400, { error: "Malformed pairing token" });

      const state = loadState();
      state.pairingToken = pairingToken;
      state.linkedWorkspaceId = claims.workspaceId;
      state.linkedProjectId = claims.projectId;
      saveState(state);
      sendJson(res, 200, { linkedWorkspaceId: claims.workspaceId, linkedProjectId: claims.projectId });
      return;
    }

    if (req.method === "GET" && url.pathname === "/status") {
      if (!requireBridgeAuth(req, res)) return;
      const state = loadState();
      sendJson(res, 200, {
        connected: true,
        linked: Boolean(state.pairingToken),
        linkedWorkspaceId: state.linkedWorkspaceId,
        linkedProjectId: state.linkedProjectId,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/sessions") {
      if (!requireBridgeAuth(req, res)) return;
      const sessions = await discoverSessions();
      sendJson(
        res,
        200,
        sessions.map((s) => ({ ...s, status: getEffectiveStatus(s.providerSessionId) })),
      );
      return;
    }

    if (req.method === "GET" && parts[0] === "sessions" && parts.length === 2) {
      if (!requireBridgeAuth(req, res)) return;
      const id = decodeURIComponent(parts[1]!);
      const session = await getSession(id);
      if (!session) return sendJson(res, 404, { error: "Session not found" });
      sendJson(res, 200, { ...session, status: getEffectiveStatus(id) });
      return;
    }

    if (req.method === "GET" && parts[0] === "sessions" && parts.length === 3 && parts[2] === "messages") {
      if (!requireBridgeAuth(req, res)) return;
      const id = decodeURIComponent(parts[1]!);
      const session = await getSession(id);
      if (!session) return sendJson(res, 404, { error: "Session not found" });
      const limit = url.searchParams.get("limit");
      const offset = url.searchParams.get("offset");
      const messages = await getHistory(id, {
        dir: session.cwd,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      sendJson(res, 200, messages);
      return;
    }

    if (req.method === "POST" && parts[0] === "sessions" && parts.length === 3 && parts[2] === "message") {
      if (!requireBridgeAuth(req, res)) return;
      const id = decodeURIComponent(parts[1]!);
      const { prompt } = JSON.parse(await readBody(req)) as { prompt?: string };
      if (!prompt?.trim()) return sendJson(res, 400, { error: "prompt required" });
      const session = await getSession(id);
      if (!session) return sendJson(res, 404, { error: "Session not found" });

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      try {
        for await (const event of resumeAndStream({ providerSessionId: id, cwd: session.cwd, prompt })) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (error) {
        if (error instanceof SessionAlreadyControlledError) {
          res.write(`data: ${JSON.stringify({ type: "done", ok: false, error: error.message })}\n\n`);
        } else {
          throw error;
        }
      }
      res.end();
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal error" });
  }
}

export function startServer(): void {
  const httpServer = createServer((req, res) => {
    void handleRequest(req, res);
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/live" });
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const state = loadState();
    if (url.searchParams.get("token") !== state.bridgeToken) {
      ws.close(4401, "Unauthorized");
      return;
    }

    const unsubscribe = onLiveStateChange((providerSessionId, status) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "status", providerSessionId, status }));
      }
    });
    ws.on("close", unsubscribe);
  });

  httpServer.listen(BRIDGE_PORT, "127.0.0.1", () => {
    console.log(`Forge bridge listening on http://127.0.0.1:${BRIDGE_PORT}`);
  });
}
