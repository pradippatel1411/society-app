CREATE TABLE "flat_payment_track" (
	"id" serial PRIMARY KEY NOT NULL,
	"maintenance_master_id" integer NOT NULL,
	"flat_id" integer NOT NULL,
	"frequency" varchar(20),
	"total_amount" integer,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'unpaid' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"society_id" integer NOT NULL,
	"fy_label" varchar(50) NOT NULL,
	"fy_start_date" timestamp NOT NULL,
	"fy_end_date" timestamp NOT NULL,
	"owner_monthly" integer,
	"owner_quarterly" integer,
	"owner_half_yearly" integer,
	"owner_yearly" integer,
	"tenant_monthly" integer,
	"tenant_quarterly" integer,
	"tenant_half_yearly" integer,
	"tenant_yearly" integer,
	"penalty_per_day_owner" integer DEFAULT 0,
	"penalty_per_day_tenant" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dues" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_configs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_periods" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "dues" CASCADE;--> statement-breakpoint
DROP TABLE "maintenance_configs" CASCADE;--> statement-breakpoint
DROP TABLE "maintenance_periods" CASCADE;--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_due_id_dues_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'success';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "maintenance_master_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "flat_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "frequency" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "paid_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "flat_payment_track" ADD CONSTRAINT "flat_payment_track_maintenance_master_id_maintenance_master_id_fk" FOREIGN KEY ("maintenance_master_id") REFERENCES "public"."maintenance_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flat_payment_track" ADD CONSTRAINT "flat_payment_track_flat_id_flats_id_fk" FOREIGN KEY ("flat_id") REFERENCES "public"."flats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_master" ADD CONSTRAINT "maintenance_master_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flat_master_idx" ON "flat_payment_track" USING btree ("maintenance_master_id","flat_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_maintenance_master_id_maintenance_master_id_fk" FOREIGN KEY ("maintenance_master_id") REFERENCES "public"."maintenance_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_flat_id_flats_id_fk" FOREIGN KEY ("flat_id") REFERENCES "public"."flats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "due_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "created_at";