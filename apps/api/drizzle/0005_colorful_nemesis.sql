CREATE TABLE "flat_payment_cycle_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"maintenance_cycle_id" integer NOT NULL,
	"maintenance_master_id" integer NOT NULL,
	"flat_payment_track_id" integer NOT NULL,
	"flat_id" integer NOT NULL,
	"amount_due" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"penalty_amount" integer DEFAULT 0 NOT NULL,
	"penalty_paid_amount" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'unpaid' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"maintenance_master_id" integer NOT NULL,
	"society_id" integer NOT NULL,
	"frequency" varchar(20) NOT NULL,
	"cycle_no" integer NOT NULL,
	"label" varchar(100) NOT NULL,
	"period_start_date" timestamp NOT NULL,
	"period_end_date" timestamp NOT NULL,
	"due_start_date" timestamp NOT NULL,
	"due_end_date" timestamp NOT NULL,
	"amount_owner" integer NOT NULL,
	"amount_tenant" integer NOT NULL,
	"penalty_per_day_owner" integer DEFAULT 0 NOT NULL,
	"penalty_per_day_tenant" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flat_payment_track" ADD COLUMN "penalty_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "flat_payment_track" ADD COLUMN "penalty_paid_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "penalty_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "cycles_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "flat_payment_cycle_tracks" ADD CONSTRAINT "flat_payment_cycle_tracks_maintenance_cycle_id_maintenance_cycles_id_fk" FOREIGN KEY ("maintenance_cycle_id") REFERENCES "public"."maintenance_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flat_payment_cycle_tracks" ADD CONSTRAINT "flat_payment_cycle_tracks_maintenance_master_id_maintenance_master_id_fk" FOREIGN KEY ("maintenance_master_id") REFERENCES "public"."maintenance_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flat_payment_cycle_tracks" ADD CONSTRAINT "flat_payment_cycle_tracks_flat_payment_track_id_flat_payment_track_id_fk" FOREIGN KEY ("flat_payment_track_id") REFERENCES "public"."flat_payment_track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flat_payment_cycle_tracks" ADD CONSTRAINT "flat_payment_cycle_tracks_flat_id_flats_id_fk" FOREIGN KEY ("flat_id") REFERENCES "public"."flats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_cycles" ADD CONSTRAINT "maintenance_cycles_maintenance_master_id_maintenance_master_id_fk" FOREIGN KEY ("maintenance_master_id") REFERENCES "public"."maintenance_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_cycles" ADD CONSTRAINT "maintenance_cycles_society_id_societies_id_fk" FOREIGN KEY ("society_id") REFERENCES "public"."societies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flat_cycle_track_idx" ON "flat_payment_cycle_tracks" USING btree ("maintenance_cycle_id","flat_id");--> statement-breakpoint
CREATE INDEX "flat_cycle_track_master_idx" ON "flat_payment_cycle_tracks" USING btree ("maintenance_master_id");--> statement-breakpoint
CREATE INDEX "flat_cycle_track_summary_idx" ON "flat_payment_cycle_tracks" USING btree ("flat_payment_track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_cycle_master_frequency_no_idx" ON "maintenance_cycles" USING btree ("maintenance_master_id","frequency","cycle_no");--> statement-breakpoint
CREATE INDEX "maintenance_cycles_master_idx" ON "maintenance_cycles" USING btree ("maintenance_master_id");--> statement-breakpoint
CREATE INDEX "maintenance_cycles_society_idx" ON "maintenance_cycles" USING btree ("society_id");