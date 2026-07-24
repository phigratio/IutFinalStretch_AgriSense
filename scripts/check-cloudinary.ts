/**
 * Quick check that the CLOUDINARY_* credentials in .env actually work: uploads a
 * tiny test image and prints the hosted URL. Used to confirm the leaf-diagnosis
 * image hosting is wired before running the app.
 *
 *   npx tsx --env-file=.env scripts/check-cloudinary.ts
 */
import { cloudinaryConfigured, uploadImageToCloudinary } from "../src/kb/cloudinary.js";

async function main(): Promise<void> {
  if (!cloudinaryConfigured()) {
    console.error("❌ Not configured — set CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET in .env (no spaces, no quotes).");
    process.exit(1);
  }

  // A 1x1 transparent PNG so we upload something valid but tiny.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );

  try {
    const res = await uploadImageToCloudinary(png, "agrisense-cloudinary-check.png", "image/png");
    console.log("✅ Cloudinary works. Hosted URL:", res.imageUrl);
  } catch (err) {
    console.error("❌ Upload failed:", (err as Error).message);
    process.exit(1);
  }
}

void main();
