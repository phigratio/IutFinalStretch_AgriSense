import multer from "multer";
import { Router, type Request, type Response } from "express";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  voiceTranscriptionService,
  type VoiceTranscriptionService,
} from "../voice/transcriptionService.js";

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AUDIO_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_AUDIO_MIME_TYPES.has(file.mimetype)) {
      callback(new Error(`unsupported audio type: ${file.mimetype}`));
      return;
    }
    callback(null, true);
  },
}).single("audio");

export function createVoiceRouter(service: VoiceTranscriptionService = voiceTranscriptionService): Router {
  const router = Router();

  router.post("/transcribe", (req: Request, res: Response): void => {
    uploadAudio(req, res, async (uploadError): Promise<void> => {
      if (uploadError) {
        res.status(400).json({ error: uploadError.message });
        return;
      }

      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "audio file is required" });
          return;
        }

        res.json(
          await service.transcribe({
            audio: {
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
              buffer: file.buffer,
            },
            language: req.body.language,
            sessionId: req.body.sessionId,
            farmerId: req.body.farmerId,
            farmId: req.body.farmId,
          }),
        );
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });
  });

  return router;
}

export const voiceRouter = createVoiceRouter();
