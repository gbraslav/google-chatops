/**
 * Image upload routes (card builder's image widget) — multer memory storage on
 * Express, mirroring the Hono server's POST/GET /api/uploads. Google fetches the
 * returned URL, so it must be public (PUBLIC_BASE_URL); falls back to the request
 * origin for local builder preview.
 */

import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { config } from "../config.js";

const MAX_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

mkdirSync(config.uploadDir, { recursive: true });

@Controller("api")
export class UploadsController {
  @Post("uploads")
  @UseInterceptors(FileInterceptor("file"))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException({ error: "Expected a multipart 'file' field." });
    }
    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException({ error: `Unsupported image type: ${file.mimetype || "unknown"}` });
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException({ error: "File too large (max 5 MB)." });
    }

    const id = `${randomUUID()}.${ext}`;
    await writeFile(join(config.uploadDir, id), file.buffer);

    const origin = `${req.protocol}://${req.get("host")}`;
    const base = (config.publicBaseUrl ?? origin).replace(/\/$/, "");
    return {
      ok: true,
      id,
      url: `${base}/api/uploads/${id}`,
      public: Boolean(config.publicBaseUrl),
    };
  }

  @Get("uploads/:id")
  async serve(@Param("id") id: string, @Res() res: Response): Promise<void> {
    if (!/^[A-Za-z0-9-]+\.[A-Za-z0-9]+$/.test(id)) {
      res.status(400).json({ error: "Invalid id." });
      return;
    }
    const path = join(config.uploadDir, id);
    if (!existsSync(path)) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    const mime = EXT_TO_MIME[extname(id).slice(1).toLowerCase()] ?? "application/octet-stream";
    const data = await readFile(path);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(data);
  }
}
