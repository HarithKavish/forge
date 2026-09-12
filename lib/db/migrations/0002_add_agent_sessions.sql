-- Registration for Worldview's agent-session presence map (docs/WORLDVIEW.md).
--
-- This table is configuration, not conversation: it records who a coding-
-- agent session belongs to, which project it's tagged to, and which provider
-- it is. Online/offline state, activity labels and anything from a hook
-- payload are deliberately never persisted here -- they live only in the
-- gateway's memory (docs/WORLDVIEW.md §4).
--
-- `workspace_members.color` is added alongside it: a per-person, per-
-- workspace color used to tell agents apart in the Worldview UI.
CREATE TYPE "public"."agent_provider" AS ENUM('claude', 'codex', 'gemini', 'other');--> statement-breakpoint
CREATE TYPE "public"."agent_session_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid,
	"provider" "agent_provider" NOT NULL,
	"session_ref" text NOT NULL,
	"label" text,
	"status" "agent_session_status" DEFAULT 'active' NOT NULL,
	"last_registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_ref_key" ON "agent_sessions" USING btree ("session_ref");--> statement-breakpoint
CREATE INDEX "agent_sessions_workspace_idx" ON "agent_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_sessions_project_idx" ON "agent_sessions" USING btree ("project_id");