CREATE TABLE "super_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"logo_url" text,
	"brand_color" varchar(20) DEFAULT '#1e40af',
	"contact_mobile" varchar(15) NOT NULL,
	"contact_email" varchar(200),
	"plan_amount" integer DEFAULT 0,
	"plan_start_date" timestamp,
	"plan_end_date" timestamp,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "super_admins_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"mobile" varchar(15) NOT NULL,
	"name" varchar(200),
	"email" varchar(200),
	"user_type" varchar(20) NOT NULL,
	"super_admin_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_mobile_unique" UNIQUE("mobile")
);
