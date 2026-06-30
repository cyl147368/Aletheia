import api from './client';
import type { Station, Overview, ProbeResult, ProbeAttempt, ProbeRequestRecord, ModelResult, ModelCatalogResult, ModelCatalogItem, ModelPricing } from './types';

// Re-export types for pages
export type { Station, Overview, ProbeResult, ProbeAttempt, ProbeRequestRecord, ModelResult, ModelCatalogResult, ModelCatalogItem, ModelPricing };

export async function login(password: string): Promise<string> {
  const { data } = await api.post('/auth/login', { password });
  return data.token;
}

export async function getOverview(): Promise<Overview> {
  const { data } = await api.get('/overview');
  return data;
}

export async function listStations(status?: string): Promise<Station[]> {
  const { data } = await api.get('/stations', { params: status ? { status } : {} });
  return data.stations;
}

export async function getStation(id: number): Promise<Station> {
  const { data } = await api.get(`/stations/${id}`);
  return data;
}

export async function createStation(body: {
  name: string;
  base_url: string;
  official_url?: string | null;
  api_key: string;
  schedule_enabled?: boolean;
  schedule_interval_hours?: number;
}): Promise<Station> {
  const { data } = await api.post('/stations', body);
  return data;
}

export async function updateStation(id: number, body: Record<string, unknown>): Promise<Station> {
  const { data } = await api.put(`/stations/${id}`, body);
  return data;
}

export async function deleteStation(id: number): Promise<void> {
  await api.delete(`/stations/${id}`);
}

export async function importStations(items: {
  name: string;
  base_url: string;
  official_url?: string | null;
  api_key: string;
  schedule_enabled?: boolean;
  schedule_interval_hours?: number;
}[]): Promise<number> {
  const { data } = await api.post('/stations/import', items);
  return data.imported;
}

export type DetectionMode = 'quick' | 'standard' | 'full';

export async function triggerProbe(stationId: number, modelIds?: string[], mode?: DetectionMode): Promise<{
  batch_id: number;
  status: string;
  total_models: number;
  available_models: number;
  unavailable_models: number;
  duration_ms: number;
  batch_type: 'probe' | 'deep';
  error?: string;
}> {
  const body = modelIds || mode ? { model_ids: modelIds, mode } : undefined;
  const { data } = await api.post(`/stations/${stationId}/probe`, body);
  return data;
}

export async function getStationModels(stationId: number): Promise<ModelCatalogResult> {
  const { data } = await api.get(`/stations/${stationId}/models`);
  return data;
}

export async function getLatestResult(stationId: number): Promise<ProbeResult> {
  const { data } = await api.get(`/stations/${stationId}/history/latest`);
  return data;
}

export async function getLatestDeepResult(stationId: number): Promise<ProbeResult> {
  const { data } = await api.get(`/stations/${stationId}/history/latest/deep`);
  return data;
}

export async function getBatchDetail(stationId: number, batchId: number): Promise<ProbeResult> {
  const { data } = await api.get(`/stations/${stationId}/history/${batchId}`);
  return data;
}
