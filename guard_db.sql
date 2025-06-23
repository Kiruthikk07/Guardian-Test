-- Drop existing types if they exist
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS device_status CASCADE;
DROP TYPE IF EXISTS notification_type CASCADE;

-- Create ENUM types first
CREATE TYPE user_role AS ENUM ('admin', 'parent', 'child');
CREATE TYPE device_status AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE notification_type AS ENUM ('app_install', 'usage_limit', 'device_blocked', 'system_alert');

-- Drop tables if they exist to ensure a clean slate
DROP TABLE IF EXISTS "subscription_events" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "plans" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "app_usage_summary" CASCADE;
DROP TABLE IF EXISTS "installed_apps" CASCADE;
DROP TABLE IF EXISTS "tenant_invites" CASCADE;
DROP TABLE IF EXISTS "family_link_codes" CASCADE;
DROP TABLE IF EXISTS "devices" CASCADE;
DROP TABLE IF EXISTS "child_profiles" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "tenants" CASCADE;

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
  "os_version" text,
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
  "user_id" UUID,
  "device_id" UUID,
  "event_type" text NOT NULL,
  "table_name" text NOT NULL,
  "record_id" UUID,
  "old_values" jsonb,
  "new_values" jsonb,
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
CREATE INDEX ON "audit_logs" ("table_name", "record_id");

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
ALTER TABLE "audit_logs" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "audit_logs" ADD FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE SET NULL;

ALTER TABLE "notifications" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD FOREIGN KEY ("device_id") REFERENCES "devices" ("id") ON DELETE SET NULL;

ALTER TABLE "subscriptions" ADD FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "subscriptions" ADD FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE SET NULL;

ALTER TABLE "subscription_events" ADD FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id") ON DELETE CASCADE;

-- =====================================================
-- AUDIT TRIGGERS SETUP
-- =====================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
DECLARE
  audit_row RECORD;
  excluded_columns text[] := ARRAY['created_at', 'updated_at', 'last_seen'];
  old_values jsonb := '{}'::jsonb;
  new_values jsonb := '{}'::jsonb;
  tenant_id_val UUID;
  user_id_val UUID;
BEGIN
  -- Get tenant_id from the row
  IF TG_OP = 'DELETE' THEN
    tenant_id_val := OLD.tenant_id;
    audit_row := OLD;
  ELSE
    tenant_id_val := NEW.tenant_id;
    audit_row := NEW;
  END IF;

  -- Try to get current user_id from session (you can set this in your app)
  BEGIN
    user_id_val := current_setting('app.current_user_id', true)::UUID;
  EXCEPTION
    WHEN others THEN
      user_id_val := NULL;
  END;

  -- Build old_values and new_values JSON, excluding certain columns
  IF TG_OP = 'UPDATE' THEN
    old_values := to_jsonb(OLD.*) - excluded_columns;
    new_values := to_jsonb(NEW.*) - excluded_columns;
    -- Do nothing if there are no changes
    IF new_values = old_values THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    new_values := to_jsonb(NEW.*) - excluded_columns;
  ELSIF TG_OP = 'DELETE' THEN
    old_values := to_jsonb(OLD.*) - excluded_columns;
  END IF;

  -- Insert audit log
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    event_type,
    table_name,
    record_id,
    old_values,
    new_values,
    event_details
  ) VALUES (
    tenant_id_val,
    user_id_val,
    TG_OP,
    TG_TABLE_NAME,
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN old_values ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN new_values ELSE NULL END,
    jsonb_build_object(
      'timestamp', now(),
      'operation', TG_OP,
      'table', TG_TABLE_NAME
    )
  );

  -- Return appropriate value
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create audit triggers for all main tables
DO $$
DECLARE
  table_name TEXT;
  tables_to_audit TEXT[] := ARRAY[
    'users', 'child_profiles', 'devices', 'family_link_codes', 
    'tenant_invites', 'installed_apps', 'app_usage_summary', 
    'notifications', 'subscriptions'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_to_audit
  LOOP
    -- Drop existing triggers if they exist
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON %I', table_name);
    
    -- Create new audit trigger
    EXECUTE format('
      CREATE TRIGGER audit_trigger
      AFTER INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_function()
    ', table_name);
  END LOOP;
END $$;

-- =====================================================
-- SAMPLE DATA INSERTION
-- =====================================================

-- Insert plans first
INSERT INTO "plans" ("name", "stripe_price_id", "monthly_cost", "device_limit", "features", "active") VALUES 
('Basic', 'price_basic_monthly', 9.99, 3, '{"analytics": false, "unlimited_devices": false, "support": "email"}', true),
('Premium', 'price_premium_monthly', 19.99, 10, '{"analytics": true, "unlimited_devices": false, "support": "priority"}', true),
('Family', 'price_family_monthly', 29.99, 999, '{"analytics": true, "unlimited_devices": true, "support": "priority", "custom_rules": true}', true),
('Free Trial', 'price_trial', 0.00, 1, '{"analytics": false, "unlimited_devices": false, "support": "community"}', false);

-- Insert multiple tenants
INSERT INTO "tenants" ("name") VALUES 
('Smith Family'),
('Johnson Family'),
('Williams Family'),
('Brown Family');

-- Insert comprehensive test data
DO $$
DECLARE
    tenant1_uuid UUID;
    tenant2_uuid UUID;
    tenant3_uuid UUID;
    tenant4_uuid UUID;
    plan1_uuid UUID;
    plan2_uuid UUID;
    plan3_uuid UUID;
    user1_uuid UUID;
    user2_uuid UUID;
    user3_uuid UUID;
    user4_uuid UUID;
    user5_uuid UUID;
    user6_uuid UUID;
    child1_uuid UUID;
    child2_uuid UUID;
    child3_uuid UUID;
    child4_uuid UUID;
    device1_uuid UUID;
    device2_uuid UUID;
    device3_uuid UUID;
    device4_uuid UUID;
    device5_uuid UUID;
    subscription1_uuid UUID;
    subscription2_uuid UUID;
BEGIN
    -- Get tenant and plan UUIDs
    SELECT id INTO tenant1_uuid FROM tenants WHERE name = 'Smith Family';
    SELECT id INTO tenant2_uuid FROM tenants WHERE name = 'Johnson Family';
    SELECT id INTO tenant3_uuid FROM tenants WHERE name = 'Williams Family';
    SELECT id INTO tenant4_uuid FROM tenants WHERE name = 'Brown Family';
    
    SELECT id INTO plan1_uuid FROM plans WHERE name = 'Basic';
    SELECT id INTO plan2_uuid FROM plans WHERE name = 'Premium';
    SELECT id INTO plan3_uuid FROM plans WHERE name = 'Family';
    
    -- Insert users
    INSERT INTO "users" ("tenant_id", "external_auth_id", "email", "name", "role") VALUES
    (tenant1_uuid, 'auth0_smith_parent1', 'john.smith@email.com', 'John Smith', 'parent'),
    (tenant1_uuid, 'auth0_smith_parent2', 'jane.smith@email.com', 'Jane Smith', 'parent'),
    (tenant2_uuid, 'auth0_johnson_parent', 'mike.johnson@email.com', 'Mike Johnson', 'parent'),
    (tenant2_uuid, 'auth0_johnson_admin', 'admin.johnson@email.com', 'Admin Johnson', 'admin'),
    (tenant3_uuid, 'auth0_williams_parent', 'sarah.williams@email.com', 'Sarah Williams', 'parent'),
    (tenant4_uuid, 'auth0_brown_parent', 'david.brown@email.com', 'David Brown', 'parent');
    
    -- Get user UUIDs
    SELECT id INTO user1_uuid FROM users WHERE email = 'john.smith@email.com';
    SELECT id INTO user2_uuid FROM users WHERE email = 'jane.smith@email.com';
    SELECT id INTO user3_uuid FROM users WHERE email = 'mike.johnson@email.com';
    SELECT id INTO user4_uuid FROM users WHERE email = 'admin.johnson@email.com';
    SELECT id INTO user5_uuid FROM users WHERE email = 'sarah.williams@email.com';
    SELECT id INTO user6_uuid FROM users WHERE email = 'david.brown@email.com';
    
    -- Insert child profiles
    INSERT INTO "child_profiles" ("tenant_id", "name", "birthdate") VALUES
    (tenant1_uuid, 'Emma Smith', '2012-03-15'),
    (tenant1_uuid, 'Liam Smith', '2015-07-22'),
    (tenant2_uuid, 'Olivia Johnson', '2013-11-08'),
    (tenant3_uuid, 'Noah Williams', '2014-01-30'),
    (tenant4_uuid, 'Ava Brown', '2016-09-12');
    
    -- Get child UUIDs
    SELECT id INTO child1_uuid FROM child_profiles WHERE name = 'Emma Smith';
    SELECT id INTO child2_uuid FROM child_profiles WHERE name = 'Liam Smith';
    SELECT id INTO child3_uuid FROM child_profiles WHERE name = 'Olivia Johnson';
    SELECT id INTO child4_uuid FROM child_profiles WHERE name = 'Noah Williams';
    
    -- Insert devices
    INSERT INTO "devices" ("tenant_id", "device_uid", "device_name", "device_type", "owner_user_id", "child_id", "os", "os_version", "status", "last_seen") VALUES
    (tenant1_uuid, 'DEVICE_SMITH_001', 'Emma''s iPhone', 'ios', user1_uuid, child1_uuid, 'iOS', '17.2', 'active', now() - interval '5 minutes'),
    (tenant1_uuid, 'DEVICE_SMITH_002', 'Liam''s Android', 'android', user2_uuid, child2_uuid, 'Android', '14', 'active', now() - interval '1 hour'),
    (tenant2_uuid, 'DEVICE_JOHNSON_001', 'Olivia''s iPad', 'ios', user3_uuid, child3_uuid, 'iPadOS', '17.1', 'active', now() - interval '30 minutes'),
    (tenant3_uuid, 'DEVICE_WILLIAMS_001', 'Noah''s Phone', 'android', user5_uuid, child4_uuid, 'Android', '13', 'inactive', now() - interval '2 days'),
    (tenant4_uuid, 'DEVICE_BROWN_001', 'Family Tablet', 'android', user6_uuid, NULL, 'Android', '12', 'blocked', now() - interval '1 week');
    
    -- Get device UUIDs
    SELECT id INTO device1_uuid FROM devices WHERE device_uid = 'DEVICE_SMITH_001';
    SELECT id INTO device2_uuid FROM devices WHERE device_uid = 'DEVICE_SMITH_002';
    SELECT id INTO device3_uuid FROM devices WHERE device_uid = 'DEVICE_JOHNSON_001';
    SELECT id INTO device4_uuid FROM devices WHERE device_uid = 'DEVICE_WILLIAMS_001';
    SELECT id INTO device5_uuid FROM devices WHERE device_uid = 'DEVICE_BROWN_001';
    
    -- Insert subscriptions
    INSERT INTO "subscriptions" ("tenant_id", "stripe_subscription_id", "plan_id", "status", "start_date", "current_period_end", "next_billing_date") VALUES
    (tenant1_uuid, 'sub_smith_premium_001', plan2_uuid, 'active', now() - interval '15 days', now() + interval '15 days', now() + interval '15 days'),
    (tenant2_uuid, 'sub_johnson_family_001', plan3_uuid, 'active', now() - interval '25 days', now() + interval '5 days', now() + interval '5 days'),
    (tenant3_uuid, 'sub_williams_basic_001', plan1_uuid, 'past_due', now() - interval '35 days', now() - interval '5 days', now() + interval '2 days');
    
    -- Get subscription UUIDs
    SELECT id INTO subscription1_uuid FROM subscriptions WHERE tenant_id = tenant1_uuid;
    SELECT id INTO subscription2_uuid FROM subscriptions WHERE tenant_id = tenant2_uuid;
    
    -- Insert family link codes
    INSERT INTO "family_link_codes" ("tenant_id", "code", "expires_at", "used", "used_by_device_id", "created_by_user_id") VALUES
    (tenant1_uuid, 'FAMILY001', now() + interval '7 days', false, NULL, user1_uuid),
    (tenant2_uuid, 'FAMILY002', now() + interval '3 days', true, device3_uuid, user3_uuid),
    (tenant3_uuid, 'FAMILY003', now() + interval '1 day', false, NULL, user5_uuid);
    
    -- Insert tenant invites
    INSERT INTO "tenant_invites" ("tenant_id", "invitee_email", "role", "invite_code", "expires_at", "used", "created_by_user_id") VALUES
    (tenant1_uuid, 'grandma.smith@email.com', 'parent', 'INVITE001', now() + interval '7 days', false, user1_uuid),
    (tenant2_uuid, 'uncle.johnson@email.com', 'parent', 'INVITE002', now() + interval '5 days', false, user4_uuid),
    (tenant3_uuid, 'helper.williams@email.com', 'parent', 'INVITE003', now() + interval '2 days', false, user5_uuid);
    
    -- Insert installed apps
    INSERT INTO "installed_apps" ("tenant_id", "device_id", "app_package", "app_name", "app_version", "app_details") VALUES
    (tenant1_uuid, device1_uuid, 'com.instagram.android', 'Instagram', '302.0.0', '{"category": "social", "size_mb": 45}'),
    (tenant1_uuid, device1_uuid, 'com.tiktok.musically', 'TikTok', '32.1.3', '{"category": "entertainment", "size_mb": 120}'),
    (tenant1_uuid, device1_uuid, 'com.duolingo', 'Duolingo', '5.123.4', '{"category": "education", "size_mb": 67}'),
    (tenant1_uuid, device2_uuid, 'com.minecraft.education', 'Minecraft Education', '1.20.12', '{"category": "education", "size_mb": 89}'),
    (tenant1_uuid, device2_uuid, 'com.youtube.android', 'YouTube', '18.45.43', '{"category": "entertainment", "size_mb": 156}'),
    (tenant2_uuid, device3_uuid, 'com.apple.mobilesafari', 'Safari', '17.1', '{"category": "browser", "size_mb": 23}'),
    (tenant2_uuid, device3_uuid, 'com.khan.academy.app', 'Khan Academy', '7.3.2', '{"category": "education", "size_mb": 78}'),
    (tenant3_uuid, device4_uuid, 'com.whatsapp', 'WhatsApp', '2.23.24.84', '{"category": "communication", "size_mb": 67}');
    
    -- Insert app usage summary
    INSERT INTO "app_usage_summary" ("tenant_id", "device_id", "app_package", "usage_date", "seconds_used", "opens_count", "last_used") VALUES
    -- Emma's usage (device1)
    (tenant1_uuid, device1_uuid, 'com.instagram.android', CURRENT_DATE, 3600, 15, now() - interval '2 hours'),
    (tenant1_uuid, device1_uuid, 'com.instagram.android', CURRENT_DATE - 1, 2700, 12, now() - interval '1 day 3 hours'),
    (tenant1_uuid, device1_uuid, 'com.tiktok.musically', CURRENT_DATE, 5400, 8, now() - interval '1 hour'),
    (tenant1_uuid, device1_uuid, 'com.tiktok.musically', CURRENT_DATE - 1, 4200, 6, now() - interval '1 day 2 hours'),
    (tenant1_uuid, device1_uuid, 'com.duolingo', CURRENT_DATE, 1800, 3, now() - interval '4 hours'),
    -- Liam's usage (device2)
    (tenant1_uuid, device2_uuid, 'com.minecraft.education', CURRENT_DATE, 7200, 4, now() - interval '3 hours'),
    (tenant1_uuid, device2_uuid, 'com.minecraft.education', CURRENT_DATE - 1, 6300, 3, now() - interval '1 day 5 hours'),
    (tenant1_uuid, device2_uuid, 'com.youtube.android', CURRENT_DATE, 2400, 10, now() - interval '2 hours'),
    -- Olivia's usage (device3)
    (tenant2_uuid, device3_uuid, 'com.khan.academy.app', CURRENT_DATE, 3000, 5, now() - interval '6 hours'),
    (tenant2_uuid, device3_uuid, 'com.apple.mobilesafari', CURRENT_DATE, 1200, 8, now() - interval '1 hour');
    
    -- Insert notifications
    INSERT INTO "notifications" ("tenant_id", "user_id", "device_id", "type", "title", "message", "delivered_at", "read_at") VALUES
    (tenant1_uuid, user1_uuid, device1_uuid, 'usage_limit', 'Daily limit reached', '{"app": "TikTok", "limit": "2 hours", "actual": "90 minutes"}', now() - interval '2 hours', now() - interval '1 hour'),
    (tenant1_uuid, user2_uuid, device2_uuid, 'app_install', 'New app installed', '{"app": "Minecraft Education", "category": "education"}', now() - interval '1 day', now() - interval '20 hours'),
    (tenant2_uuid, user3_uuid, device3_uuid, 'device_blocked', 'Device blocked', '{"reason": "bedtime_rule", "until": "tomorrow 7 AM"}', now() - interval '12 hours', NULL),
    (tenant2_uuid, user4_uuid, NULL, 'system_alert', 'Subscription renewal', '{"type": "payment_success", "amount": "$29.99", "next_billing": "2025-01-21"}', now() - interval '5 days', now() - interval '4 days'),
    (tenant3_uuid, user5_uuid, device4_uuid, 'usage_limit', 'Weekly limit warning', '{"app": "WhatsApp", "used": "8 hours", "limit": "10 hours"}', now() - interval '3 hours', NULL);
    
    -- Insert subscription events
    INSERT INTO "subscription_events" ("subscription_id", "stripe_event_id", "event_type", "amount", "currency", "event_time", "details") VALUES
    (subscription1_uuid, 'evt_smith_payment_001', 'payment_succeeded', 19.99, 'usd', now() - interval '15 days', '{"invoice_id": "in_smith_001", "payment_method": "card_ending_4242"}'),
    (subscription1_uuid, 'evt_smith_invoice_001', 'invoice_created', 19.99, 'usd', now() - interval '16 days', '{"period_start": "2025-01-06", "period_end": "2025-02-06"}'),
    (subscription2_uuid, 'evt_johnson_payment_001', 'payment_succeeded', 29.99, 'usd', now() - interval '25 days', '{"invoice_id": "in_johnson_001", "payment_method": "card_ending_1234"}'),
    (subscription2_uuid, 'evt_johnson_upgrade_001', 'customer_subscription_updated', 29.99, 'usd', now() - interval '30 days', '{"old_plan": "Basic", "new_plan": "Family", "proration": 15.00}');
    
    RAISE NOTICE 'Test data inserted successfully!';
    RAISE NOTICE 'Tenant 1 (Smith Family): %', tenant1_uuid;
    RAISE NOTICE 'Tenant 2 (Johnson Family): %', tenant2_uuid;
    RAISE NOTICE 'Created % users, % children, % devices', 6, 5, 5;
END $$;

-- =====================================================
-- UTILITY FUNCTIONS FOR AUDIT MANAGEMENT
-- =====================================================

-- Function to set current user for audit logging
CREATE OR REPLACE FUNCTION set_current_user_for_audit(user_uuid UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', user_uuid::text, false);
END;
$$ LANGUAGE plpgsql;

-- Function to clear current user
CREATE OR REPLACE FUNCTION clear_current_user_for_audit()
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', '', false);
END;
$$ LANGUAGE plpgsql;

-- Function to get audit trail for a specific record
CREATE OR REPLACE FUNCTION get_audit_trail(
  p_table_name text,
  p_record_id UUID,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  audit_id UUID,
  event_type text,
  user_name text,
  user_email text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamp,
  event_details jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.event_type,
    u.name,
    u.email,
    a.old_values,
    a.new_values,
    a.created_at,
    a.event_details
  FROM audit_logs a
  LEFT JOIN users u ON a.user_id = u.id
  WHERE a.table_name = p_table_name 
    AND a.record_id = p_record_id
  ORDER BY a.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SAMPLE QUERIES TO TEST THE DATABASE
-- =====================================================

-- Test audit logging by updating a device
DO $$
DECLARE
  test_device_id UUID;
BEGIN
  -- Get a test device
  SELECT id INTO test_device_id FROM devices WHERE device_uid = 'DEVICE_SMITH_001';
  
  -- Set current user for audit
  PERFORM set_current_user_for_audit((SELECT id FROM users WHERE email = 'john.smith@email.com'));
  
  -- Update device status (this should trigger audit log)
  UPDATE devices 
  SET status = 'blocked', device_name = 'Emma''s iPhone (Updated)' 
  WHERE id = test_device_id;
  
  -- Clear current user
  PERFORM clear_current_user_for_audit();
  
  RAISE NOTICE 'Updated device %, audit log should be created', test_device_id;
END $$;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Query to check all tables have data
SELECT 
  schemaname,
  relname as tablename,
  n_live_tup as total_rows
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Query to verify audit logs are working
SELECT 
  table_name,
  event_type,
  COUNT(*) as event_count
FROM audit_logs 
GROUP BY table_name, event_type
ORDER BY table_name, event_type;

-- Query to show recent audit activity
SELECT 
  al.table_name,
  al.event_type,
  u.name as user_name,
  u.email as user_email,
  al.created_at,
  al.event_details->>'operation' as operation
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC
LIMIT 10;

-- =====================================================
-- SAMPLE BUSINESS QUERIES
-- =====================================================

-- Get family overview with device count and usage
WITH family_stats AS (
  SELECT 
    t.name as family_name,
    COUNT(DISTINCT u.id) as total_users,
    COUNT(DISTINCT cp.id) as total_children,
    COUNT(DISTINCT d.id) as total_devices,
    COUNT(DISTINCT CASE WHEN d.status = 'active' THEN d.id END) as active_devices
  FROM tenants t
  LEFT JOIN users u ON t.id = u.tenant_id AND u.deleted_at IS NULL
  LEFT JOIN child_profiles cp ON t.id = cp.tenant_id AND cp.deleted_at IS NULL
  LEFT JOIN devices d ON t.id = d.tenant_id AND d.deleted_at IS NULL
  WHERE t.deleted_at IS NULL
  GROUP BY t.id, t.name
)
SELECT * FROM family_stats ORDER BY family_name;

-- Get daily app usage summary for the Smith family
SELECT 
  cp.name as child_name,
  d.device_name,
  ia.app_name,
  aus.usage_date,
  ROUND(aus.seconds_used / 60.0, 1) as minutes_used,
  aus.opens_count
FROM app_usage_summary aus
JOIN devices d ON aus.device_id = d.id
JOIN child_profiles cp ON d.child_id = cp.id
JOIN installed_apps ia ON aus.device_id = ia.device_id AND aus.app_package = ia.app_package
JOIN tenants t ON aus.tenant_id = t.id
WHERE t.name = 'Smith Family'
  AND aus.usage_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY aus.usage_date DESC, cp.name, aus.seconds_used DESC;

-- Get subscription status for all families
SELECT 
  t.name as family_name,
  p.name as plan_name,
  s.status,
  s.current_period_end,
  s.next_billing_date,
  CASE 
    WHEN s.current_period_end < now() THEN 'Expired'
    WHEN s.current_period_end < now() + INTERVAL '7 days' THEN 'Expiring Soon'
    ELSE 'Active'
  END as subscription_health
FROM tenants t
LEFT JOIN subscriptions s ON t.id = s.tenant_id
LEFT JOIN plans p ON s.plan_id = p.id
WHERE t.deleted_at IS NULL
ORDER BY t.name;

-- Get unread notifications count by user
SELECT 
  t.name as family_name,
  u.name as user_name,
  u.email,
  COUNT(n.id) as unread_notifications
FROM users u
JOIN tenants t ON u.tenant_id = t.id
LEFT JOIN notifications n ON u.id = n.user_id AND n.read_at IS NULL
WHERE u.deleted_at IS NULL
GROUP BY t.name, u.name, u.email
HAVING COUNT(n.id) > 0
ORDER BY unread_notifications DESC;

-- =====================================================
-- EXECUTION INSTRUCTIONS
-- =====================================================

/*
HOW TO EXECUTE THIS SCRIPT:

1. FOR NEW DATABASE:
   - Save this entire script as 'complete_schema.sql'
   - Run: psql -d your_database_name -f complete_schema.sql

2. FOR EXISTING DATABASE:
   - BACKUP YOUR DATA FIRST!
   - This script will DROP existing types and recreate everything
   - Run: psql -d your_database_name -f complete_schema.sql

3. TESTING AUDIT FUNCTIONALITY:
   - The script includes test updates that will generate audit logs
   - Check audit_logs table after running
   - Use the utility functions provided

4. SETTING USER CONTEXT FOR AUDITING:
   In your application, before making changes:
   SELECT set_current_user_for_audit('user-uuid-here');
   -- Make your changes
   SELECT clear_current_user_for_audit();

5. QUERYING AUDIT TRAILS:
   SELECT * FROM get_audit_trail('devices', 'device-uuid-here');

6. MONITORING:
   - Use the verification queries at the end
   - Check pg_stat_user_tables for row counts
   - Monitor audit_logs table for activity

FEATURES INCLUDED:
- ✅ Complete schema with all tables
- ✅ Audit triggers on all major tables
- ✅ Comprehensive test data for all tables
- ✅ Utility functions for audit management
- ✅ Sample business queries
- ✅ Verification queries
- ✅ Foreign key constraints
- ✅ Indexes for performance
- ✅ Data validation constraints
- ✅ ENUM types for data consistency

The audit system will automatically log:
- INSERT operations (new_values populated)
- UPDATE operations (old_values and new_values populated)
- DELETE operations (old_values populated)
- User who made the change (if set via set_current_user_for_audit)
- Timestamp of change
- Table and record affected
*/
