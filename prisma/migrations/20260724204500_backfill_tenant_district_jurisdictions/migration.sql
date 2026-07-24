-- District knowledge bases must resolve for existing tenants that were
-- originally approved with only an upazila-specific jurisdiction.
INSERT INTO "tenant_jurisdictions" ("id", "tenant_id", "district", "upazila")
SELECT gen_random_uuid(), source."tenant_id", source."district", NULL
FROM "tenant_jurisdictions" AS source
WHERE source."upazila" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "tenant_jurisdictions" AS district_scope
    WHERE district_scope."tenant_id" = source."tenant_id"
      AND lower(district_scope."district") = lower(source."district")
      AND district_scope."upazila" IS NULL
  )
GROUP BY source."tenant_id", source."district";
