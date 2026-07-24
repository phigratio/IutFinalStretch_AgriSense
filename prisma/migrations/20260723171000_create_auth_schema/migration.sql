CREATE TABLE IF NOT EXISTS "app_users" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "password_hash" TEXT,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_users_email_key" UNIQUE ("email")
);

CREATE TABLE IF NOT EXISTS "auth_identities" (
  "provider" TEXT NOT NULL,
  "provider_user_id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("provider", "provider_user_id"),
  CONSTRAINT "auth_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "auth_identities_user_id_idx" ON "auth_identities"("user_id");
