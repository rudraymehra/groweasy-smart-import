import type {
  CrmField,
  HeaderMapping,
  ImportResult,
  JobProgress,
  JobStatus,
  PreviewMappingResponse,
} from '@smart-import/shared';
import { create } from 'zustand';
import { createImport, previewMapping } from '@/lib/api';
import { parseClientPreview, type ClientPreview } from '@/lib/clientCsv';

export type WizardStep = 'upload' | 'preview' | 'mapping' | 'processing' | 'results';

export interface LogLine {
  id: number;
  text: string;
  tone: 'info' | 'ok' | 'warn' | 'error';
}

interface ImportState {
  step: WizardStep;
  file: File | null;
  preview: ClientPreview | null;
  parsingPreview: boolean;
  mappingData: PreviewMappingResponse | null;
  requestingMapping: boolean;
  /** User-editable copy of the AI-proposed mapping. */
  mapping: HeaderMapping | null;
  jobId: string | null;
  jobStatus: JobStatus;
  progress: JobProgress | null;
  log: LogLine[];
  result: ImportResult | null;
  error: string | null;
  mappingAnnounced: boolean;

  selectFile: (file: File) => Promise<void>;
  requestMapping: () => Promise<void>;
  overrideMapping: (columnIndex: number, field: CrmField | null) => void;
  startImport: () => Promise<void>;
  applyJobStatus: (status: JobStatus) => void;
  applyMapping: (mapping: HeaderMapping) => void;
  applyProgress: (progress: JobProgress, retried: boolean) => void;
  applyResult: (result: ImportResult) => void;
  applyJobError: (message: string) => void;
  pushLog: (text: string, tone?: LogLine['tone']) => void;
  reset: () => void;
}

let logId = 0;

const initial = {
  step: 'upload' as WizardStep,
  file: null,
  preview: null,
  parsingPreview: false,
  mappingData: null,
  requestingMapping: false,
  mapping: null,
  jobId: null,
  jobStatus: 'queued' as JobStatus,
  progress: null,
  log: [] as LogLine[],
  result: null,
  error: null,
  mappingAnnounced: false,
};

export const useImportStore = create<ImportState>((set, get) => ({
  ...initial,

  async selectFile(file) {
    set({ ...initial, file, parsingPreview: true });
    try {
      const preview = await parseClientPreview(file);
      set({ preview, step: 'preview', parsingPreview: false });
    } catch (err) {
      set({ parsingPreview: false, file: null });
      throw err;
    }
  },

  async requestMapping() {
    const { file } = get();
    if (!file) return;
    set({ requestingMapping: true, error: null });
    try {
      const mappingData = await previewMapping(file);
      set({
        mappingData,
        mapping: mappingData.mapping,
        step: 'mapping',
        requestingMapping: false,
      });
    } catch (err) {
      set({ requestingMapping: false });
      throw err;
    }
  },

  overrideMapping(columnIndex, field) {
    const { mapping } = get();
    if (!mapping) return;
    set({
      mapping: {
        ...mapping,
        mappings: mapping.mappings.map((m) =>
          m.source_column_index === columnIndex
            ? { ...m, crm_field: field, confidence: 'high', notes: 'Set manually' }
            : // A CRM field can only come from one column (crm_note excepted):
              // claiming it here releases it anywhere else.
              field !== null && field !== 'crm_note' && m.crm_field === field
              ? { ...m, crm_field: null, notes: 'Reassigned manually' }
              : m,
        ),
      },
    });
  },

  async startImport() {
    const { file, mappingData, mapping } = get();
    if (!file) return;
    set({ error: null, log: [], progress: null });
    const response = await createImport({
      // Prefer the cached parse from the mapping step; fall back to re-upload.
      ...(mappingData ? { fileToken: mappingData.file_token } : { file }),
      ...(mapping ? { mapping } : {}),
    }).catch(async (err: Error) => {
      if (mappingData && /expired/i.test(err.message)) {
        return createImport({ file, ...(mapping ? { mapping } : {}) });
      }
      throw err;
    });
    set({ jobId: response.job_id, step: 'processing', jobStatus: 'queued' });
    get().pushLog(`Job ${response.job_id} accepted · ${response.total_rows} rows`, 'info');
  },

  applyJobStatus(status) {
    // SSE reconnects replay a status snapshot and the polling fallback
    // re-reports every 2s — only log genuine transitions.
    if (get().jobStatus === status) return;
    const labels: Partial<Record<JobStatus, string>> = {
      mapping: 'AI is reading the column headers…',
      extracting: 'Extracting records in batches…',
      validating: 'Validating phones, dates and enums…',
      done: 'Import complete',
    };
    set({ jobStatus: status });
    const label = labels[status];
    if (label) get().pushLog(label, status === 'done' ? 'ok' : 'info');
  },

  applyMapping(mapping) {
    const first = !get().mappingAnnounced;
    if (!get().mapping) set({ mapping });
    if (!first) return;
    set({ mappingAnnounced: true });
    const mapped = mapping.mappings.filter((m) => m.crm_field !== null).length;
    get().pushLog(`Column mapping ready · ${mapped}/${mapping.mappings.length} columns mapped`, 'ok');
  },

  applyProgress(progress, retried) {
    const prev = get().progress;
    const advanced =
      !prev ||
      progress.rows_processed > prev.rows_processed ||
      progress.batches_done > prev.batches_done;
    if (!advanced) return; // snapshot replays and idle polling ticks
    set({ progress });
    get().pushLog(
      `Batch ${progress.batches_done}/${progress.batches_total} · ${progress.rows_processed}/${progress.rows_total} rows · ${progress.parsed_so_far} parsed`,
      retried ? 'warn' : 'info',
    );
    if (retried) get().pushLog('A batch needed a retry — recovered automatically', 'warn');
  },

  applyResult(result) {
    set({ result, step: 'results', jobStatus: 'done' });
  },

  applyJobError(message) {
    set({ error: message, jobStatus: 'failed' });
    get().pushLog(message, 'error');
  },

  pushLog(text, tone = 'info') {
    set((state) => ({ log: [...state.log.slice(-199), { id: logId++, text, tone }] }));
  },

  reset() {
    set({ ...initial });
  },
}));
