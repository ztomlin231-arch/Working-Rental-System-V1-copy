import type {
  DashboardResponse,
  DashboardStats,
  DuplicateSerialWarning,
  EquipmentLookupResult,
  IntakeQueueItem,
  IntakeQueuePayload,
  RentalAgreementPayload,
  RentalAgreementRecord,
  AgreementSummary,
  CustomerProfile
} from "../shared/types";

const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(body?.message ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchDashboard(seasonYear?: number) {
  const query = new URLSearchParams();
  if (seasonYear) {
    query.set("seasonYear", String(seasonYear));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<DashboardResponse>(`/dashboard${suffix}`);
}

export async function fetchAgreements(
  search = "",
  filters?: {
    name?: string;
    phone?: string;
    email?: string;
    seasonYear?: string | number;
  }
) {
  const query = new URLSearchParams({ search });
  if (filters?.name) {
    query.set("name", filters.name);
  }
  if (filters?.phone) {
    query.set("phone", filters.phone);
  }
  if (filters?.email) {
    query.set("email", filters.email);
  }
  if (filters?.seasonYear) {
    query.set("seasonYear", String(filters.seasonYear));
  }
  return request<{ agreements: AgreementSummary[] }>(`/rentals?${query.toString()}`);
}

export async function fetchQueueItems(seasonYear?: number, includeFinished = false) {
  const query = new URLSearchParams();
  if (seasonYear) {
    query.set("seasonYear", String(seasonYear));
  }
  if (includeFinished) {
    query.set("includeFinished", "true");
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ queueItems: IntakeQueueItem[] }>(`/queue${suffix}`);
}

export async function saveQueueItem(payload: IntakeQueuePayload, id?: number) {
  return request<{ queueItem: IntakeQueueItem }>(id ? `/queue/${id}` : "/queue", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchAgreement(id: number) {
  return request<{ agreement: RentalAgreementRecord }>(`/rentals/${id}`);
}

export async function fetchRenewalTemplate(id: number, seasonYear?: number) {
  const query = new URLSearchParams();
  if (seasonYear) {
    query.set("seasonYear", String(seasonYear));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ template: RentalAgreementPayload }>(
    `/rentals/${id}/renewal-template${suffix}`
  );
}

export async function saveAgreement(
  payload: RentalAgreementPayload,
  id?: number
) {
  return request<{
    agreement: RentalAgreementRecord;
    duplicateSerials: DuplicateSerialWarning[];
  }>(id ? `/rentals/${id}` : "/rentals", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
}

export async function lookupEquipment(serial: string) {
  const query = new URLSearchParams({ serial });
  return request<EquipmentLookupResult>(`/equipment/search?${query.toString()}`);
}

export async function fetchCustomer(customerId: number) {
  return request<{ customer: CustomerProfile }>(`/customers/${customerId}`);
}

export async function deleteCustomer(customerId: number) {
  await request<void>(`/customers/${customerId}`, {
    method: "DELETE"
  });
}

export const exportCsvUrl = `${API_BASE}/export/rentals.csv`;
