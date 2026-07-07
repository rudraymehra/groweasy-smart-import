import multer from 'multer';
import path from 'node:path';
import { loadEnv } from '../config/env.js';

/**
 * Memory storage is deliberate: CSVs are capped at MAX_FILE_SIZE_MB and parsed
 * immediately, so buffering avoids temp-file lifecycle management entirely.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: loadEnv().MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || ext === '.txt' || ext === '.tsv') {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only CSV files are supported'));
    }
  },
});
