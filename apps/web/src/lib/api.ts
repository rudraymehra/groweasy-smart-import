import type {
  ApiErrorBody,
  CreateImportResponse,
  HeaderMapping,
  JobStatusResponse,
  PreviewMappingResponse,
} from '@smart-import/shared';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body?.error?.message) message = body.error.message;
  } catch {
    // non-JSON error body — keep the generic message
  }
  throw new Error(message);
}

export async function previewMapping(file: File): Promise<PreviewMappingResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/imports/preview-mapping`, {
    method: 'POST',
    body: form,
  });
  return parseResponse<PreviewMappingResponse>(res);
}

export async function createImport(input: {
  file?: File;
  fileToken?: string;
  mapping?: HeaderMapping;
}): Promise<CreateImportResponse> {
  const form = new FormData();
  if (input.file) form.append('file', input.file);
  if (input.fileToken) form.append('file_token', input.fileToken);
  if (input.mapping) form.append('mapping', JSON.stringify(input.mapping));
  const res = await fetch(`${API_BASE}/api/imports`, { method: 'POST', body: form });
  return parseResponse<CreateImportResponse>(res);
}

export async function getJob(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/api/imports/${jobId}`);
  return parseResponse<JobStatusResponse>(res);
}

export const jobEventsUrl = (jobId: string) => `${API_BASE}/api/imports/${jobId}/events`;
export const resultCsvUrl = (jobId: string) => `${API_BASE}/api/imports/${jobId}/result.csv`;
