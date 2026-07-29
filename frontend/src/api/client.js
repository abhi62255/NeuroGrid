import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000/api";

const client = axios.create({ baseURL: API_BASE_URL });

export const DashboardAPI = {
  summary: (tenantId) => client.get("/dashboard/summary", { params: { tenant_id: tenantId } }),
};

export const TenantAPI = {
  list: () => client.get("/tenants"),
  create: (data) => client.post("/tenants", data),
};

export const DeviceAPI = {
  list: (params) => client.get("/devices", { params }),
  get: (id) => client.get(`/devices/${id}`),
};

export const TelemetryAPI = {
  query: (params) => client.get("/telemetry", { params }),
};

export const RecommendationAPI = {
  list: (params) => client.get("/recommendations", { params }),
  get: (id) => client.get(`/recommendations/${id}`),
  accept: (id, userId) => client.post(`/recommendations/${id}/accept`, { user_id: userId }),
  reject: (id, userId) => client.post(`/recommendations/${id}/reject`, { user_id: userId }),
  generate: (tenantId) => client.post(`/recommendations/generate/${tenantId}`),
};

export const EventAPI = {
  list: (params) => client.get("/events", { params }),
  get: (id) => client.get(`/events/${id}`),
  activate: (id) => client.post(`/events/${id}/activate`),
  complete: (id) => client.post(`/events/${id}/complete`),
  cancel: (id) => client.post(`/events/${id}/cancel`),
};

export const TariffAPI = {
  current: (tenantId) => client.get(`/tariffs/current/${tenantId}`),
  calendar: (tenantId) => client.get(`/tariffs/calendar/${tenantId}`),
};

export default client;
