-- Drop existing types if they exist
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS device_status CASCADE;
DROP TYPE IF EXISTS notification_type CASCADE;

-- Create ENUM types first
CREATE TYPE user_role AS ENUM ('admin', 'parent', 'child');
CREATE TYPE device_status AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE notification_type AS ENUM ('app_install', 'usage_limit', 'device_blocked', 'system_alert');

-- Create tables
CREATE TABLE "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) UNIQUE NOT NULL,
  "created_at" timestamp DEFAULT (now()),
  "deleted_at" timestamp
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "external_auth_id" text UNIQUE NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "role" user_role NOT NULL,
  "created_at" timestamp DEFAULT (now()),
  "deleted_at" timestamp,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE TABLE "child_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "birthdate" date,
  "created_at" timestamp DEFAULT (now()),
  "deleted_at" timestamp
);

CREATE TABLE "devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "device_uid" text UNIQUE NOT NULL,
  "device_name" text,
  "device_type" text NOT NULL,
  "owner_user_id" uuid,
  "child_id" uuid,
  "os" text,
  "os_version" text, -- Fixed typo
  "status" device_status DEFAULT 'active',
  "last_seen" timestamp,
  "created_at" timestamp DEFAULT (now()),
  "deleted_at" timestamp,
  CONSTRAINT valid_device_type CHECK (device_type IN ('android', 'ios', 'web'))
);

CREATE TABLE "family_link_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "code" text UNIQUE NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used" boolean DEFAULT false,
  "used_by_device_id" UUID,
  "created_by_user_id" UUID,
  "created_at" timestamp DEFAULT (now()),
  CONSTRAINT valid_expiry_link CHECK (expires_at > created_at)
);

CREATE TABLE "tenant_invites" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "invitee_email" text NOT NULL,
  "role" user_role DEFAULT 'parent',
  "invite_code" text UNIQUE NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used" boolean DEFAULT false,
  "used_by_user_id" UUID,
  "created_by_user_id" UUID,
  "created_at" timestamp DEFAULT (now()),
  CONSTRAINT valid_expiry_invite CHECK (expires_at > created_at),
  CONSTRAINT valid_invitee_email CHECK (invitee_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE TABLE "installed_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "app_package" text NOT NULL,
  "app_name" text,
  "app_version" text,
  "app_details" jsonb,
  "created_at" timestamp DEFAULT (now())
);

CREATE TABLE "app_usage_summary" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "app_package" text NOT NULL,
  "usage_date" date NOT NULL,
  "seconds_used" integer NOT NULL DEFAULT 0,
  "opens_count" integer DEFAULT 0,
  "last_used" timestamp,
  CONSTRAINT positive_usage CHECK (seconds_used >= 0 AND opens_count >= 0)
);

CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "device_id" UUID,
  "event_type" text NOT NULL,
  "event_details" jsonb,
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamp DEFAULT (now())
);

CREATE TABLE "notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "device_id" UUID,
  "type" notification_type NOT NULL,
  "title" text NOT NULL,
  "message" jsonb,
  "created_at" timestamp DEFAULT (now()),
  "delivered_at" timestamp,
  "read_at" timestamp
);

CREATE TABLE "plans" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "stripe_price_id" text UNIQUE,
  "monthly_cost" numeric(10,2),
  "device_limit" integer DEFAULT 5,
  "features" jsonb,
  "active" boolean DEFAULT true
);

CREATE TABLE "subscriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID UNIQUE NOT NULL,
  "stripe_subscription_id" text UNIQUE NOT NULL,
  "plan_id" UUID,
  "status" text NOT NULL,
  "start_date" timestamp NOT NULL,
  "current_period_end" timestamp,
  "next_billing_date" timestamp,
  "created_at" timestamp DEFAULT (now()),
  CONSTRAINT valid_subscription_dates CHECK (current_period_end > start_date)
);

CREATE TABLE "subscription_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" UUID NOT NULL,
  "stripe_event_id" text UNIQUE,
  "event_type" text NOT NULL,
  "amount" numeric(10,2),
  "currency" text DEFAULT 'usd',
  "event_time" timestamp NOT NULL,
  "details" jsonb
);

-- Create indexes for better performance
CREATE UNIQUE INDEX ON "users" ("tenant_id", "external_auth_id");
CREATE UNIQUE INDEX ON "users" ("tenant_id", "email");
CREATE INDEX ON "users" ("tenant_id") WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ON "devices" ("tenant_id", "id");
CREATE INDEX ON "devices" ("tenant_id", "owner_user_id") WHERE deleted_at IS NULL;
CREATE INDEX ON "devices" ("tenant_id", "child_id") WHERE child_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX ON "family_link_codes" ("tenant_id", "code");
CREATE INDEX ON "family_link_codes" ("expires_at") WHERE used = false;

CREATE INDEX ON "tenant_invites" ("tenant_id", "invite_code");
CREATE INDEX ON "tenant_invites" ("expires_at") WHERE used = false;

CREATE INDEX ON "installed_apps" ("tenant_id", "device_id");
CREATE INDEX ON "installed_apps" ("device_id", "app_package");

CREATE UNIQUE INDEX ON "app_usage_summary" ("tenant_id", "device_id", "app_package", "usage_date");
CREATE INDEX ON "app_usage_summary" ("tenant_id", "usage_date");
CREATE INDEX ON "app_usage_summary" ("device_id", "usage_date");

CREATE INDEX ON "audit_logs" ("tenant_id", "created_at");
CREATE INDEX ON "audit_logs" ("user_id", "created_at");

CREATE INDEX ON "notifications" ("tenant_id", "user_id");
CREATE INDEX ON "notifications" ("tenant_id", "user_id", "created_at") WHERE read_at IS NULL;

CREATE INDEX ON "subscription_events" ("subscription_id", "event_time");

-- Add foreign key constraints
ALTER TABLE "users" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;

ALTER TABLE "child_profiles" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;

ALTER TABLE "devices" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "devices" ADD FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "devices" ADD FOREIGN KEY ("child_id") REFERENCES "child_profiles" ("id") ON DELETE SET NULL;

ALTER TABLE "family_link_codes" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "family_link_codes" ADD FOREIGN KEY ("used_by_device_id") REFERENCES "devices" ("id") ON DELETE SET NULL;
ALTER TABLE "family_link_codes" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "tenant_invites" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "tenant_invites" ADD FOREIGN KEY ("used_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "tenant_invites" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "installed_apps" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "installed_apps" ADD FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE CASCADE;

ALTER TABLE "app_usage_summary" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "app_usage_summary" ADD FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE CASCADE;

ALTER TABLE "audit_logs" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "audit_logs" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "audit_logs" ADD FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE SET NULL;

ALTER TABLE "notifications" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE SET NULL;

ALTER TABLE "subscriptions" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "subscriptions" ADD FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE SET NULL;

ALTER TABLE "subscription_events" ADD FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id") ON DELETE CASCADE;

-- Insert some sample data for testing
INSERT INTO "plans" ("name", "monthly_cost", "device_limit", "features") VALUES 
('Basic', 9.99, 3, '{"analytics": false, "unlimited_devices": false}'),
('Premium', 19.99, 10, '{"analytics": true, "unlimited_devices": false}'),
('Family', 29.99, 999, '{"analytics": true, "unlimited_devices": true}');

-- Sample tenant
INSERT INTO "tenants" ("name") VALUES ('Test Family');

-- Get the tenant ID for further inserts
DO $$
DECLARE
    tenant_uuid UUID;
BEGIN
    SELECT id INTO tenant_uuid FROM tenants WHERE name = 'Test Family';
    
    -- Sample user
    INSERT INTO "users" ("tenant_id", "external_auth_id", "email", "name", "role") 
    VALUES (tenant_uuid, 'auth0_123456', 'parent@test.com', 'John Doe', 'parent');
    
    -- Sample child profile
    INSERT INTO "child_profiles" ("tenant_id", "name", "birthdate") 
    VALUES (tenant_uuid, 'Little Johnny', '2015-05-15');
END $$;