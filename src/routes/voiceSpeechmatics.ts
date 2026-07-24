import multer from "multer";
import { Router } from "express";
import {
  transcribeSpeechmatics,
  speechmaticsConfigured,
  SpeechmaticsNotConfiguredError,
} from "../voice/speechmatics.js";

/** Accept any browser audio recording (MediaRecorder emits audio/webm). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    cb(null, file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream"),
}).single("audio");

export const voiceSpeechmaticsRouter = Router();

/** POST /api/voice/speechmatics/transcribe — Bengali (default) speech-to-text via Speechmatics. */
voiceSpeechmaticsRouter.post("/transcribe", (req, res) => {
  upload(req, res, async (uploadError) => {
    if (uploadError) {
      res.status(400).json({ error: (uploadError as Error).message });
      return;
    }
    try {
      if (!speechmaticsConfigured()) {
        res.status(501).json({ error: "Voice transcription is not configured (Speechmatics key missing)" });
        return;
      }
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "audio file is required" });
        return;
      }
      const language = typeof req.body.language === "string" && req.body.language ? req.body.language : "bn";
      const transcript = await transcribeSpeechmatics(
        file.buffer,
        file.originalname || "recording.webm",
        file.mimetype,
        { language },
      );
      res.json({ transcript, language, provider: "speechmatics" });
    } catch (error) {
      if (error instanceof SpeechmaticsNotConfiguredError) {
        res.status(501).json({ error: error.message });
        return;
      }
      res.status(400).json({ error: (error as Error).message });
    }
  });
});
