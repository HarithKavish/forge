/**
 * Mirrors bridge/src/claude/sdk.ts's NormalizedPart -- duplicated rather
 * than imported because the bridge is a separate package (its own
 * node_modules, never bundled into Forge's Next.js build; see bridge/README).
 * Keep these two in sync by hand if the shape changes.
 */
export interface NormalizedTextPart {
  type: "text";
  text: string;
}
export interface NormalizedToolCallPart {
  type: "tool_call";
  toolUseId: string;
  name: string;
  input: unknown;
}
export interface NormalizedToolResultPart {
  type: "tool_result";
  toolUseId: string;
  text: string;
  isError?: boolean;
}
export type NormalizedPart = NormalizedTextPart | NormalizedToolCallPart | NormalizedToolResultPart;
