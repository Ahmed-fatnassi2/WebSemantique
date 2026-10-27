import type { BaseEntity, EntityKey, EntityPayload, ListParams, Paginated, TypeOption } from "../types";
import { demoGet, demoList, demoTypes } from "../utils/demoData";
import { api, assertLive, cleanParams, demoState } from "./api";

export interface EntityService<T extends BaseEntity> {
  key: EntityKey;
  list(params?: ListParams): Promise<Paginated<T>>;
  all(): Promise<T[]>;
  get(id: string): Promise<T>;
  types(): Promise<TypeOption[]>;
  create(payload: EntityPayload): Promise<T>;
  update(id: string, payload: EntityPayload): Promise<T>;
  remove(id: string): Promise<void>;
}

/** CRUD service for one entity family, backed by /api/{key}. */
export function createEntityService<T extends BaseEntity>(key: EntityKey): EntityService<T> {
  const service: EntityService<T> = {
    key,
    async list(params = {}) {
      if (demoState.get()) return demoList(key, params) as unknown as Paginated<T>;
      const { data } = await api.get<Paginated<T>>(`/${key}`, { params: cleanParams(params) });
      return data;
    },
    async all() {
      return (await service.list({ page: 1, page_size: 500, sort: "nom" })).items;
    },
    async get(id) {
      if (demoState.get()) return demoGet(key, id) as unknown as T;
      const { data } = await api.get<T>(`/${key}/${encodeURIComponent(id)}`);
      return data;
    },
    async types() {
      if (demoState.get()) return demoTypes(key);
      const { data } = await api.get<TypeOption[]>(`/${key}/types`);
      return data;
    },
    async create(payload) {
      assertLive();
      const { data } = await api.post<T>(`/${key}`, payload);
      return data;
    },
    async update(id, payload) {
      assertLive();
      const { data } = await api.put<T>(`/${key}/${encodeURIComponent(id)}`, payload);
      return data;
    },
    async remove(id) {
      assertLive();
      await api.delete(`/${key}/${encodeURIComponent(id)}`);
    },
  };
  return service;
}
