CREATE TABLE "allowed_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowed_emails_email_normalized" CHECK ("allowed_emails"."email" = lower(btrim("allowed_emails"."email")) AND length("allowed_emails"."email") BETWEEN 3 AND 254)
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"ui_locale" text DEFAULT 'en' NOT NULL,
	"translation_language" text DEFAULT 'ru' NOT NULL,
	"timezone" text,
	"daily_new_limit" integer DEFAULT 20 NOT NULL,
	"desired_retention" numeric(3, 2) DEFAULT 0.9 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_ui_locale" CHECK ("user_settings"."ui_locale" IN ('en')),
	CONSTRAINT "user_settings_translation_language" CHECK ("user_settings"."translation_language" IN ('ru', 'en', 'uk')),
	CONSTRAINT "user_settings_timezone" CHECK ("user_settings"."timezone" IS NULL OR length("user_settings"."timezone") BETWEEN 1 AND 64),
	CONSTRAINT "user_settings_daily_new_limit" CHECK ("user_settings"."daily_new_limit" BETWEEN 0 AND 200),
	CONSTRAINT "user_settings_desired_retention" CHECK ("user_settings"."desired_retention" BETWEEN 0.70 AND 0.97)
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;