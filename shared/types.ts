export type RentalStatus = "active" | "returned" | "closed";

export type SkierLevel = "I" | "II" | "III";

export type QueueStatus =
  | "waiting"
  | "being_helped"
  | "agreement_started"
  | "completed"
  | "cancelled";

export type QueueCustomerType = "new" | "returning" | "unknown";

export interface SkierFormData {
  id?: number;
  skierName: string;
  skierType: SkierLevel;
  skiModel: string;
  skiSize: string;
  skiSerialNumber: string;
  skiBO: string;
  poleIncluded: boolean;
  poleSize: string;
  poleBO: string;
  bootModel: string;
  bootColor: string;
  bootSize: string;
  bootBO: string;
}

export interface RentalAgreementPayload {
  customerId?: number;
  salesperson: string;
  seasonYear: number;
  parentName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  homePhone: string;
  cellPhone: string;
  email: string;
  agreementDate: string;
  customerSignaturePlaceholder: string;
  employeeSignaturePlaceholder: string;
  equipmentResponsibilityAmount: number;
  customerAcceptance: boolean;
  returnDueDate: string;
  status: RentalStatus;
  notes: string;
  skiers: SkierFormData[];
}

export interface AgreementSummary {
  id: number;
  customerId: number;
  seasonYear: number;
  parentName: string;
  salesperson: string;
  agreementDate: string;
  returnDueDate: string;
  status: RentalStatus;
  email: string;
  homePhone: string;
  cellPhone: string;
  skierCount: number;
  skiCount: number;
  bootCount: number;
  skierNames: string[];
  updatedAt: string;
}

export interface RentalAgreementRecord extends RentalAgreementPayload {
  id: number;
  customerId: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  activeRentals: number;
  returnedRentals: number;
  closedRentals: number;
  totalCustomers: number;
  totalSkiers: number;
}

export interface DashboardResponse {
  selectedSeasonYear: number;
  availableSeasonYears: number[];
  stats: DashboardStats;
  queueItems: IntakeQueueItem[];
}

export interface IntakeQueuePayload {
  customerId?: number | null;
  sourceAgreementId?: number | null;
  agreementId?: number | null;
  seasonYear: number;
  customerName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  homePhone: string;
  cellPhone: string;
  email: string;
  phone: string;
  skierCount: number;
  customerType: QueueCustomerType;
  status: QueueStatus;
  salesperson: string;
  notes: string;
}

export interface IntakeQueueItem extends IntakeQueuePayload {
  id: number;
  customerId: number | null;
  sourceAgreementId: number | null;
  agreementId: number | null;
  checkedInAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentLookupResult {
  serialNumber: string;
  activeMatch: null | {
    agreementId: number;
    parentName: string;
    skierName: string;
    status: RentalStatus;
    returnDueDate: string;
  };
  history: Array<{
    agreementId: number;
    parentName: string;
    skierName: string;
    agreementDate: string;
    status: RentalStatus;
  }>;
}

export interface DuplicateSerialWarning {
  serialNumber: string;
  conflictingAgreementId: number;
  conflictingParentName: string;
  conflictingSkierName: string;
}

export interface CustomerSeasonRecord {
  agreementId: number;
  seasonYear: number;
  agreementDate: string;
  returnDueDate: string;
  status: RentalStatus;
  salesperson: string;
  skierCount: number;
  skierNames: string[];
}

export interface CustomerProfile {
  customerId: number;
  parentName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  homePhone: string;
  cellPhone: string;
  email: string;
  seasons: CustomerSeasonRecord[];
}
