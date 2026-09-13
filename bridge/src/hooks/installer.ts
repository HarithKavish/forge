#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CLAUDE_CONFIG_DIR, CLAUDE_SETTINGS_PATH, hookUrl } from "../config.js";
import { loadState } from "../state.js";

/**
 * One-time, global hook install -- the whole point of the bridge over the
 * old per-session pairing flow (docs/BRIDGE.md): every Claude Code session
 * on this machine, present and future, reports to the SAME fixed local
 * URL, so there is nothing to configure per session ever again.
 *
 * Safety rules, because this edits a file Claude Code itself reads on
 * every launch and the user may already have real hooks in it:
 * - Never replace the file wholesale; parse and merge.
 * - Never touch a hook entry this installer didn't add itself (identified
 *   by URL, not by event name -- an event can carry other people's hooks
 *   too).
 * - `install` is idempotent: running it twice does not duplicate entries.
 * - `uninstall` removes only entries whose url is exactly this bridge's
 *   hook URL, and prunes now-empty structures it created, not anything
 *   pre-existing left behind at zero length by someone else.
 */

const MANAGED_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "SessionEnd",
] as const;

interface HookDef {
  type: string;
  url?: string;
  command?: string;
  headers?: Record<string, string>;
  allowedEnvVars?: string[];
  [key: string]: unknown;
}
interface HookGroup {
  matcher?: string;
  hooks: HookDef[];
  [key: string]: unknown;
}
interface Settings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

function readSettings(): Settings {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf8")) as Settings;
  } catch (error) {
    throw new Error(
      `${CLAUDE_SETTINGS_PATH} exists but isn't valid JSON -- refusing to touch it. Fix or back it up first. (${(error as Error).message})`,
    );
  }
}

function writeSettings(settings: Settings): void {
  if (!existsSync(CLAUDE_CONFIG_DIR)) mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
  writeFileSync(CLAUDE_SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export function install(): { changed: boolean } {
  const state = loadState();
  const url = hookUrl();
  const settings = readSettings();
  settings.hooks ??= {};

  let changed = false;
  for (const event of MANAGED_EVENTS) {
    const groups = (settings.hooks[event] ??= []);
    const alreadyPresent = groups.some((g) => g.hooks.some((h) => h.url === url));
    if (alreadyPresent) continue;

    groups.push({
      matcher: "",
      hooks: [
        {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${state.bridgeToken}` },
        },
      ],
    });
    changed = true;
  }

  if (changed) writeSettings(settings);
  return { changed };
}

export function uninstall(): { changed: boolean } {
  const url = hookUrl();
  if (!existsSync(CLAUDE_SETTINGS_PATH)) return { changed: false };
  const settings = readSettings();
  if (!settings.hooks) return { changed: false };

  let changed = false;
  for (const event of Object.keys(settings.hooks)) {
    const groups = settings.hooks[event];
    if (!groups) continue;
    const hooksRemoved = groups.reduce((n, g) => n + g.hooks.filter((h) => h.url === url).length, 0);
    if (hooksRemoved === 0) continue;

    changed = true;
    settings.hooks[event] = groups
      .map((g) => ({ ...g, hooks: g.hooks.filter((h) => h.url !== url) }))
      .filter((g) => g.hooks.length > 0);
  }

  if (changed) writeSettings(settings);
  return { changed };
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const cmd = process.argv[2];
  if (cmd === "install") {
    const { changed } = install();
    console.log(changed ? `Installed hooks pointing at ${hookUrl()}` : "Hooks already installed -- nothing to do.");
  } else if (cmd === "uninstall") {
    const { changed } = uninstall();
    console.log(changed ? "Removed this bridge's hooks." : "No hooks from this bridge were found.");
  } else {
    console.log("Usage: tsx src/hooks/installer.ts install|uninstall");
    process.exitCode = 1;
  }
}
