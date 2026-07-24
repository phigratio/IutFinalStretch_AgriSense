/**
 * Cloudinary image upload for KB illustrations. Signed server-side upload (the API secret never
 * leaves the backend). Returns the hosted secure_url, which is stored as a chunk's imageUrl and
 * surfaced with retrieval hits. Disabled cleanly when credentials are absent.
 */

import { createHash } from "node:crypto";
import { config } from "../config.js";

export function cloudinaryConfigured(): boolean {
  return Boolean(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret);
}

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super("Cloudinary is not configured (set CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET)");
    this.name = "CloudinaryNotConfiguredError";
  }
}

export interface UploadedImage {
  imageUrl: string;
  publicId: string;
  width?: number;
  height?: number;
}

/** Upload an image buffer to Cloudinary and return its hosted URL. */
export async function uploadImageToCloudinary(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<UploadedImage> {
  if (!cloudinaryConfigured()) throw new CloudinaryNotConfiguredError();

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "agrisense-kb";
  // Params to sign, sorted alphabetically (folder < timestamp), joined, then + api_secret.
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(toSign + config.cloudinaryApiSecret).digest("hex");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype || "application/octet-stream" }), filename);
  form.append("api_key", config.cloudinaryApiKey as string);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/image/upload`,
    { method: "POST", body: form },
  );
  const json = (await res.json()) as {
    secure_url?: string;
    public_id?: string;
    width?: number;
    height?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.secure_url) {
    throw new Error(`Cloudinary upload failed: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return { imageUrl: json.secure_url, publicId: json.public_id ?? "", width: json.width, height: json.height };
}
