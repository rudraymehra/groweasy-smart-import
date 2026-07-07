import { Router } from 'express';
import {
  createImport,
  downloadResultCsv,
  getJob,
  previewMapping,
  streamJobEvents,
} from '../controllers/imports.controller.js';
import { upload } from '../middleware/upload.js';

export const importsRouter = Router();

importsRouter.post('/preview-mapping', upload.single('file'), previewMapping);
importsRouter.post('/', upload.single('file'), createImport);
importsRouter.get('/:jobId', getJob);
importsRouter.get('/:jobId/events', streamJobEvents);
importsRouter.get('/:jobId/result.csv', downloadResultCsv);
