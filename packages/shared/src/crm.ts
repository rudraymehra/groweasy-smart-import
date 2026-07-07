import { z } from 'zod';

/**
 * The GrowEasy CRM lead schema. Field order matches the sample CRM export
 * from the assignment and is reused for CSV export column ordering.
 */
export const CRM_STATUS_VALUES = [
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE',
] as const;

export const DATA_SOURCE_VALUES = [
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots',
] as const;

export const CrmStatusSchema = z.enum(CRM_STATUS_VALUES);
export const DataSourceSchema = z.enum(DATA_SOURCE_VALUES);

export type CrmStatus = z.infer<typeof CrmStatusSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;

/** Field metadata drives the AI prompts, the mapping-review UI, and CSV export. */
export const CRM_FIELD_DEFINITIONS = [
  { key: 'created_at', label: 'Created at', description: 'Lead creation date/time' },
  { key: 'name', label: 'Name', description: 'Lead full name' },
  { key: 'email', label: 'Email', description: 'Primary email address' },
  { key: 'country_code', label: 'Country code', description: 'Phone country code, e.g. +91' },
  {
    key: 'mobile_without_country_code',
    label: 'Mobile',
    description: 'Mobile number without country code',
  },
  { key: 'company', label: 'Company', description: 'Company / organisation name' },
  { key: 'city', label: 'City', description: 'City' },
  { key: 'state', label: 'State', description: 'State / province' },
  { key: 'country', label: 'Country', description: 'Country' },
  { key: 'lead_owner', label: 'Lead owner', description: 'Salesperson / agent the lead is assigned to' },
  { key: 'crm_status', label: 'Status', description: 'Lead status (fixed enum)' },
  { key: 'crm_note', label: 'Note', description: 'Remarks, follow-up notes, extra contact info' },
  { key: 'data_source', label: 'Data source', description: 'Campaign / project source (fixed enum)' },
  { key: 'possession_time', label: 'Possession time', description: 'Property possession timeline' },
  { key: 'description', label: 'Description', description: 'Additional description' },
] as const;

export const CRM_FIELDS = CRM_FIELD_DEFINITIONS.map((f) => f.key) as [
  (typeof CRM_FIELD_DEFINITIONS)[number]['key'],
  ...(typeof CRM_FIELD_DEFINITIONS)[number]['key'][],
];

export const CrmFieldSchema = z.enum(CRM_FIELDS);
export type CrmField = z.infer<typeof CrmFieldSchema>;

/** A fully validated CRM record, ready for import / CSV export. */
export const CrmRecordSchema = z.strictObject({
  created_at: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  country_code: z.string().nullable(),
  mobile_without_country_code: z.string().nullable(),
  company: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  lead_owner: z.string().nullable(),
  crm_status: CrmStatusSchema.nullable(),
  crm_note: z.string().nullable(),
  data_source: DataSourceSchema.nullable(),
  possession_time: z.string().nullable(),
  description: z.string().nullable(),
});

export type CrmRecord = z.infer<typeof CrmRecordSchema>;

/** CRM record annotated with its source row for traceability in the UI. */
export const ImportedRecordSchema = CrmRecordSchema.extend({
  row_index: z.number().int(),
});

export type ImportedRecord = z.infer<typeof ImportedRecordSchema>;
