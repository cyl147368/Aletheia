import api from './client';
import type { Station, Overview, ProbeResult, ModelResult } from './types';

// Re-export types for pages
export type { Station, Overview, ProbeResult, ModelResult };

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
  api_key: string;
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

export async function importStations(items: { name: string; base_url: string; api_key: string }[]): Promise<number> {
  const { data } = await api.post('/stations/import', items);
  return data.imported;
}

export async function triggerProbe(stationId: number): Promise<{
  batch_id: number;
  status: string;
  total_models: number;
  available_models: number;
  unavailable_models: number;
  duration_ms: number;
  error?: string;
}> {
  const { data } = await api.post(`/stations/${stationId}/probe`);
  return data;
}

export async function getLatestResult(stationId: number): Promise<ProbeResult> {
  const { data } = await api.get(`/stations/${stationId}/history/latest`);
  return data;
}

export async function getBatchDetail(stationId: number, batchId: number): Promise<ProbeResult> {
  const { data } = await api.get(`/stations/${stationId}/history/${batchId}`);
  return data;
}