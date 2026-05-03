DROP INDEX "society_user_role_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "society_user_role_idx" ON "society_roles" USING btree ("society_id","user_id");