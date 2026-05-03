CREATE TABLE "dues" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"flat_id" integer NOT NULL,
	"base_amount" integer NOT NULL,
	"hybrid_override_amount" integer,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"penalty_amount" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flat_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"flat_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"relation" varchar(20) DEFAULT 'owner' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flats" (
	"id" serial PRIMARY KEY NOT NULL,
	"society_id" integer NOT NULL,
	"block" varchar(20) NOT NULL,
	"flat_no" varchar(20) NOT NULL,
	"owner_name" varchar(200),
	"residency_type" varchar(20) DEFAULT 'owner' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"society_id" integer NOT NULL,
	"period_type" varchar(20) DEFAULT 'yearly' NOT NULL,
	"owner_amount" integer NOT NULL,
	"tenant_amount" integer NOT NULL,
	"penalty_per_day" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_configs_society_id_unique" UNIQUE("society_id")
);
--> statement-breakpoint
CREATE TABLE "maintenance_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"society_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"due_id" integer NOT NULL,
	"paid_by_user_id" integer,
	"amount" integer NOT NULL,
	"mode" varchar(20) NOT NULL,
	"gateway_txn_id" varchar(200),
	"gateway" varchar(50),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"receipt_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "societies" (
	"id" serial PRIMARY KEY NOT NULL,
	"super_admin_id" integer NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" text,
	"total_flats" integer DEFAULT 0,
	"plan_amount" integer DEFAULT 0,
	"plan_start_date" timestamp,
	"plan_end_date" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "society_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"society_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" integer
);
--> statement-breakpoint
ALTER TABLE "super_admins" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "super_admins" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_period_id_maintenance_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."maintenance_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_flat_id_flats_id_fk" FOREIGN KEY ("flat_id") REFERENCES "public"."flats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flat_members" ADD CONSTRAINT "flat_members_flat_id_flats_id_fk" FOREIGN KEY ("flat_id") REFERENCES "public"."flats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flat_members" ADD CONSTRAINT "flat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flats" ADD CONSTRAINT "flats_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_configs" ADD CONSTRAINT "maintenance_configs_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_periods" ADD CONSTRAINT "maintenance_periods_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_due_id_dues_id_fk" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "societies" ADD CONSTRAINT "societies_super_admin_id_super_admins_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."super_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_roles" ADD CONSTRAINT "society_roles_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_roles" ADD CONSTRAINT "society_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "society_roles" ADD CONSTRAINT "society_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flat_period_idx" ON "dues" USING btree ("period_id","flat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flat_user_idx" ON "flat_members" USING btree ("flat_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flat_per_society_idx" ON "flats" USING btree ("society_id","block","flat_no");--> statement-breakpoint
CREATE UNIQUE INDEX "society_slug_per_super_admin_idx" ON "societies" USING btree ("super_admin_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "society_user_role_idx" ON "society_roles" USING btree ("society_id","user_id","role");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_super_admin_id_super_admins_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."super_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_mobile_idx" ON "users" USING btree ("mobile");