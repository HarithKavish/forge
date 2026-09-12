-- The Worldview sharing primitive (docs/WORLDVIEW.md §13a): grants one user
-- access to one project's registered sessions/presence, across a workspace
-- boundary they are not otherwise a member of. Project-scoped by design --
-- a collaborator gains nothing about the workspace's resources, billing, or
-- other projects. One right today (view + register their own sessions);
-- no role/tier column since there is only one tier.
CREATE TABLE "project_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_collaborators_project_user_key" ON "project_collaborators" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_collaborators_user_idx" ON "project_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_collaborators_workspace_idx" ON "project_collaborators" USING btree ("workspace_id");