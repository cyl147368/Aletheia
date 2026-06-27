export interface Station {
  id: number;
  name: string;
  base_url: string;
  official_url: string | null;
  api_key: string;
  api_key_masked: string;
  schedule_enabled: boolean;
  schedule_interval_hours: number;
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  last_probe_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchSummary {
  id: number;
  probed_at: string;
  total_models: number;
  available_models: number;
  unavailable_models: number;
  duration_ms: number;
}

export interface ModelResult {
  id: number;
  model_id: string;
  available: boolean;
  ttft_ms: number;
  response_preview: string | null;
  error_message: string | null;
  request_body: string | null;
  response_body: string | null;
  authenticity_score: number | null;
  degradation_flags: string | null;
}

export interface ProbeAttempt {
  provider: string;
  endpoint: string;
  url: string;
  available: boolean;
  ttft_ms: number;
  response_preview: string | null;
  error_message: string | null;
  response_body: unknown;
  diagnostic_id?: string | null;
}

export interface ProbeRequestRecord {
  provider: string;
  endpoint: string;
  url: string;
  headers?: Record<string, string> | null;
  body: unknown;
}

export interface ProbeResult {
  batch: BatchSummary | null;
  models: ModelResult[];
}

export interface Overview {
  total: number;
  ok: number;
  degraded: number;
  down: number;
  unknown: number;
}
