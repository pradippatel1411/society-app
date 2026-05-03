CREATE TABLE "otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"mobile" varchar(15) NOT NULL,
	"code" varchar(10) NOT NULL,
	"scope" varchar(30) NOT NULL,
	"scope_ref" varchar(100),
	"attempts" integer DEFAULT 0 NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "otps_mobile_scope_idx" ON "otps" USING btree ("mobile","scope");