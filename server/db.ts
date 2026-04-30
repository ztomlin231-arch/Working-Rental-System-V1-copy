import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type {
  AgreementSummary,
  CustomerProfile,
  CustomerSeasonRecord,
  DashboardResponse,
  DashboardStats,
  DuplicateSerialWarning,
  EquipmentLookupResult,
  IntakeQueueItem,
  IntakeQueuePayload,
  QueueCustomerType,
  QueueStatus,
  RentalAgreementPayload,
  RentalAgreementRecord,
  RentalStatus,
  SkierFormData
} from "../shared/types.js";

const dataDir = path.resolve(process.cwd(), "data");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "rentals.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const timestamp = () => new Date().toISOString();

function getCurrentRentalSeasonYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month >= 8) {
    return year;
  }

  if (month <= 5) {
    return year - 1;
  }

  return year;
}

function getDefaultRentalSeasonYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month <= 5) {
    return year;
  }

  return getCurrentRentalSeasonYear(date);
}

function getDefaultReturnDueDate(seasonYear: number) {
  return `${seasonYear + 1}-04-30`;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      zip TEXT NOT NULL DEFAULT '',
      home_phone TEXT NOT NULL DEFAULT '',
      cell_phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rental_agreements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      salesperson TEXT NOT NULL DEFAULT '',
      season_year INTEGER NOT NULL DEFAULT 2026,
      agreement_date TEXT NOT NULL,
      customer_signature_placeholder TEXT NOT NULL DEFAULT '',
      employee_signature_placeholder TEXT NOT NULL DEFAULT '',
      equipment_responsibility_amount REAL NOT NULL DEFAULT 0,
      customer_acceptance INTEGER NOT NULL DEFAULT 0,
      return_due_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'returned', 'closed')) DEFAULT 'active',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agreement_id INTEGER NOT NULL,
      skier_name TEXT NOT NULL,
      skier_type TEXT NOT NULL CHECK (skier_type IN ('I', 'II', 'III')) DEFAULT 'I',
      ski_model TEXT NOT NULL DEFAULT '',
      ski_size TEXT NOT NULL DEFAULT '',
      ski_serial_number TEXT NOT NULL DEFAULT '',
      ski_bo TEXT NOT NULL DEFAULT '',
      pole_included INTEGER NOT NULL DEFAULT 0,
      pole_size TEXT NOT NULL DEFAULT '',
      pole_bo TEXT NOT NULL DEFAULT '',
      boot_model TEXT NOT NULL DEFAULT '',
      boot_color TEXT NOT NULL DEFAULT '',
      boot_size TEXT NOT NULL DEFAULT '',
      boot_bo TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agreement_id) REFERENCES rental_agreements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS intake_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      source_agreement_id INTEGER,
      agreement_id INTEGER,
      season_year INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      zip TEXT NOT NULL DEFAULT '',
      home_phone TEXT NOT NULL DEFAULT '',
      cell_phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      skier_count INTEGER NOT NULL DEFAULT 1,
      customer_type TEXT NOT NULL CHECK (customer_type IN ('new', 'returning', 'unknown')) DEFAULT 'unknown',
      status TEXT NOT NULL CHECK (status IN ('waiting', 'being_helped', 'agreement_started', 'completed', 'cancelled')) DEFAULT 'waiting',
      salesperson TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      checked_in_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (source_agreement_id) REFERENCES rental_agreements(id) ON DELETE SET NULL,
      FOREIGN KEY (agreement_id) REFERENCES rental_agreements(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_parent_name ON customers(parent_name);
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_customers_home_phone ON customers(home_phone);
    CREATE INDEX IF NOT EXISTS idx_customers_cell_phone ON customers(cell_phone);
    CREATE INDEX IF NOT EXISTS idx_skiers_serial ON skiers(ski_serial_number);
    CREATE INDEX IF NOT EXISTS idx_skiers_agreement_id ON skiers(agreement_id);
    CREATE INDEX IF NOT EXISTS idx_intake_queue_status ON intake_queue(status);
    CREATE INDEX IF NOT EXISTS idx_intake_queue_season_year ON intake_queue(season_year);
  `);

  const columns = db.prepare("PRAGMA table_info(rental_agreements)").all() as Array<{
    name: string;
  }>;

  if (!columns.some((column) => column.name === "season_year")) {
    db.exec(
      "ALTER TABLE rental_agreements ADD COLUMN season_year INTEGER NOT NULL DEFAULT 2026"
    );
  }

  const queueColumns = db.prepare("PRAGMA table_info(intake_queue)").all() as Array<{
    name: string;
  }>;
  const addQueueColumn = (name: string, definition: string) => {
    if (!queueColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE intake_queue ADD COLUMN ${name} ${definition}`);
    }
  };

  addQueueColumn("address", "TEXT NOT NULL DEFAULT ''");
  addQueueColumn("city", "TEXT NOT NULL DEFAULT ''");
  addQueueColumn("state", "TEXT NOT NULL DEFAULT ''");
  addQueueColumn("zip", "TEXT NOT NULL DEFAULT ''");
  addQueueColumn("home_phone", "TEXT NOT NULL DEFAULT ''");
  addQueueColumn("cell_phone", "TEXT NOT NULL DEFAULT ''");
  addQueueColumn("email", "TEXT NOT NULL DEFAULT ''");
}

export function initializeDatabase() {
  createTables();
  seedDemoDataIfEmpty();
}

function seedDemoDataIfEmpty() {
  const existing = db
    .prepare("SELECT COUNT(*) as count FROM rental_agreements")
    .get() as { count: number };

  if (existing.count > 0) {
    return;
  }

  const now = timestamp();
  const seasonYear = getDefaultRentalSeasonYear();
  const priorSeasonYear = seasonYear - 1;

  db.transaction(() => {
    const insertCustomer = db.prepare(`
      INSERT INTO customers (
        parent_name, address, city, state, zip, home_phone, cell_phone, email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAgreement = db.prepare(`
      INSERT INTO rental_agreements (
        customer_id,
        salesperson,
        season_year,
        agreement_date,
        customer_signature_placeholder,
        employee_signature_placeholder,
        equipment_responsibility_amount,
        customer_acceptance,
        return_due_date,
        status,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSkier = db.prepare(`
      INSERT INTO skiers (
        agreement_id,
        skier_name,
        skier_type,
        ski_model,
        ski_size,
        ski_serial_number,
        ski_bo,
        pole_included,
        pole_size,
        pole_bo,
        boot_model,
        boot_color,
        boot_size,
        boot_bo,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertQueueItem = db.prepare(`
      INSERT INTO intake_queue (
        customer_id,
        source_agreement_id,
        agreement_id,
        season_year,
        customer_name,
        address,
        city,
        state,
        zip,
        home_phone,
        cell_phone,
        email,
        phone,
        skier_count,
        customer_type,
        status,
        salesperson,
        notes,
        checked_in_at,
        started_at,
        completed_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const parkerCustomerId = Number(
      insertCustomer.run(
        "Sarah Parker",
        "18 Maple Ridge Road",
        "Saratoga Springs",
        "NY",
        "12866",
        "518-555-0134",
        "518-555-0198",
        "sarah.parker@example.com",
        now,
        now
      ).lastInsertRowid
    );
    const parkerAgreementId = Number(
      insertAgreement.run(
        parkerCustomerId,
        "Mia",
        seasonYear,
        `${seasonYear}-10-12`,
        "",
        "",
        650,
        1,
        getDefaultReturnDueDate(seasonYear),
        "active",
        "Demo active family rental.",
        now,
        now
      ).lastInsertRowid
    );
    insertSkier.run(
      parkerAgreementId,
      "Avery Parker",
      "II",
      "Rossignol Experience",
      "130",
      "HA-130-204",
      "",
      1,
      "95",
      "",
      "Nordica Speedmachine",
      "Black",
      "24.5",
      "",
      now,
      now
    );
    insertSkier.run(
      parkerAgreementId,
      "Liam Parker",
      "I",
      "K2 Indy",
      "110",
      "HA-110-118",
      "",
      1,
      "85",
      "",
      "Tecnica JT",
      "Blue",
      "22.5",
      "",
      now,
      now
    );

    const chenCustomerId = Number(
      insertCustomer.run(
        "David Chen",
        "42 Pine Street",
        "Albany",
        "NY",
        "12207",
        "518-555-0177",
        "",
        "david.chen@example.com",
        now,
        now
      ).lastInsertRowid
    );
    const chenAgreementId = Number(
      insertAgreement.run(
        chenCustomerId,
        "Chris",
        priorSeasonYear,
        `${priorSeasonYear}-11-03`,
        "",
        "",
        375,
        1,
        getDefaultReturnDueDate(priorSeasonYear),
        "returned",
        "Prior season demo rental for renewal flow.",
        now,
        now
      ).lastInsertRowid
    );
    insertSkier.run(
      chenAgreementId,
      "Noah Chen",
      "III",
      "Volkl Deacon",
      "146",
      "HA-146-332",
      "",
      1,
      "105",
      "",
      "Lange RSJ",
      "Orange",
      "25.5",
      "",
      now,
      now
    );

    insertQueueItem.run(
      null,
      null,
      null,
      seasonYear,
      "Morgan Lee",
      "7 Cedar Lane",
      "Troy",
      "NY",
      "12180",
      "",
      "518-555-0148",
      "morgan.lee@example.com",
      "518-555-0148",
      1,
      "new",
      "waiting",
      "",
      "Walk-in demo queue item.",
      now,
      null,
      null,
      now,
      now
    );
  })();
}

function normalizeAgreementPayload(payload: RentalAgreementPayload): RentalAgreementPayload {
  return {
    ...payload,
    seasonYear: Number(payload.seasonYear),
    notes: payload.notes.trim(),
    skiers: payload.skiers
      .map((skier) => normalizeSkier(skier))
      .filter((skier) => skier.skierName.length > 0)
  };
}

function normalizeSkier(skier: SkierFormData): SkierFormData {
  return {
    ...skier,
    skierName: skier.skierName.trim(),
    skiModel: skier.skiModel.trim(),
    skiSize: skier.skiSize.trim(),
    skiSerialNumber: skier.skiSerialNumber.trim().toUpperCase(),
    skiBO: skier.skiBO.trim(),
    poleSize: skier.poleSize.trim(),
    poleBO: skier.poleBO.trim(),
    bootModel: skier.bootModel.trim(),
    bootColor: skier.bootColor.trim(),
    bootSize: skier.bootSize.trim(),
    bootBO: skier.bootBO.trim()
  };
}

function buildAgreementRecord(id: number): RentalAgreementRecord {
  const agreement = db
    .prepare(
      `
      SELECT
        ra.id,
        ra.customer_id as customerId,
        ra.salesperson,
        ra.season_year as seasonYear,
        c.parent_name as parentName,
        c.address,
        c.city,
        c.state,
        c.zip,
        c.home_phone as homePhone,
        c.cell_phone as cellPhone,
        c.email,
        ra.agreement_date as agreementDate,
        ra.customer_signature_placeholder as customerSignaturePlaceholder,
        ra.employee_signature_placeholder as employeeSignaturePlaceholder,
        ra.equipment_responsibility_amount as equipmentResponsibilityAmount,
        ra.customer_acceptance as customerAcceptance,
        ra.return_due_date as returnDueDate,
        ra.status,
        ra.notes,
        ra.created_at as createdAt,
        ra.updated_at as updatedAt
      FROM rental_agreements ra
      JOIN customers c ON c.id = ra.customer_id
      WHERE ra.id = ?
      `
    )
    .get(id) as
    | (Omit<RentalAgreementRecord, "customerAcceptance" | "skiers"> & {
        customerAcceptance: 0 | 1;
      })
    | undefined;

  if (!agreement) {
    throw new Error(`Agreement ${id} not found`);
  }

  const skiers = db
    .prepare(
      `
      SELECT
        id,
        skier_name as skierName,
        skier_type as skierType,
        ski_model as skiModel,
        ski_size as skiSize,
        ski_serial_number as skiSerialNumber,
        ski_bo as skiBO,
        pole_included as poleIncluded,
        pole_size as poleSize,
        pole_bo as poleBO,
        boot_model as bootModel,
        boot_color as bootColor,
        boot_size as bootSize,
        boot_bo as bootBO
      FROM skiers
      WHERE agreement_id = ?
      ORDER BY id ASC
      `
    )
    .all(id) as Array<{
    id?: number;
    skierName: string;
    skierType: "I" | "II" | "III";
    skiModel: string;
    skiSize: string;
    skiSerialNumber: string;
    skiBO: string;
    poleIncluded: 0 | 1;
    poleSize: string;
    poleBO: string;
    bootModel: string;
    bootColor: string;
    bootSize: string;
    bootBO: string;
  }>;

  return {
    ...agreement,
    customerAcceptance: Boolean(agreement.customerAcceptance),
    skiers: skiers.map((skier) => ({
      ...skier,
      poleIncluded: Boolean(skier.poleIncluded)
    }))
  };
}

export function getDashboardStats(): DashboardStats {
  const agreementCounts = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeRentals,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returnedRentals,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closedRentals
      FROM rental_agreements
      `
    )
    .get() as DashboardStats;

  const customerCount = db
    .prepare("SELECT COUNT(*) as totalCustomers FROM customers")
    .get() as { totalCustomers: number };
  const skierCount = db
    .prepare("SELECT COUNT(*) as totalSkiers FROM skiers")
    .get() as { totalSkiers: number };

  return {
    activeRentals: agreementCounts.activeRentals ?? 0,
    returnedRentals: agreementCounts.returnedRentals ?? 0,
    closedRentals: agreementCounts.closedRentals ?? 0,
    totalCustomers: customerCount.totalCustomers,
    totalSkiers: skierCount.totalSkiers
  };
}

export function getAvailableSeasonYears(): number[] {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT season_year as seasonYear
      FROM rental_agreements
      ORDER BY season_year DESC
      `
    )
    .all() as Array<{ seasonYear: number }>;

  const currentSeasonYear = getCurrentRentalSeasonYear();
  const upcomingSeasonYear = currentSeasonYear + 1;

  return Array.from(
    new Set([
      ...rows.map((row) => row.seasonYear),
      currentSeasonYear,
      upcomingSeasonYear,
      getDefaultRentalSeasonYear()
    ])
  ).sort((a, b) => b - a);
}

const queueStatuses: QueueStatus[] = [
  "waiting",
  "being_helped",
  "agreement_started",
  "completed",
  "cancelled"
];

const queueCustomerTypes: QueueCustomerType[] = ["new", "returning", "unknown"];

function normalizeQueuePayload(payload: IntakeQueuePayload): IntakeQueuePayload {
  const status = queueStatuses.includes(payload.status) ? payload.status : "waiting";
  const customerType = queueCustomerTypes.includes(payload.customerType)
    ? payload.customerType
    : "unknown";
  const skierCount = Math.max(1, Number(payload.skierCount) || 1);

  return {
    customerId: payload.customerId ?? null,
    sourceAgreementId: payload.sourceAgreementId ?? null,
    agreementId: payload.agreementId ?? null,
    seasonYear: Number(payload.seasonYear) || getDefaultRentalSeasonYear(),
    customerName: (payload.customerName ?? "").trim(),
    address: (payload.address ?? "").trim(),
    city: (payload.city ?? "").trim(),
    state: (payload.state ?? "").trim(),
    zip: (payload.zip ?? "").trim(),
    homePhone: (payload.homePhone ?? "").trim(),
    cellPhone: (payload.cellPhone ?? "").trim(),
    email: (payload.email ?? "").trim(),
    phone:
      (payload.phone ?? "").trim() ||
      (payload.cellPhone ?? "").trim() ||
      (payload.homePhone ?? "").trim(),
    skierCount,
    customerType,
    status,
    salesperson: (payload.salesperson ?? "").trim(),
    notes: (payload.notes ?? "").trim()
  };
}

function mapQueueRows(rows: IntakeQueueItem[]) {
  return rows;
}

export function listQueueItems(
  seasonYear?: number,
  includeFinished = false
): IntakeQueueItem[] {
  const statusWhere = includeFinished
    ? ""
    : "AND status NOT IN ('completed', 'cancelled')";
  const seasonWhere = seasonYear ? "AND season_year = ?" : "";
  const args = seasonYear ? [seasonYear] : [];

  const rows = db
    .prepare(
      `
      SELECT
        id,
        customer_id as customerId,
        source_agreement_id as sourceAgreementId,
        agreement_id as agreementId,
        season_year as seasonYear,
        customer_name as customerName,
        address,
        city,
        state,
        zip,
        home_phone as homePhone,
        cell_phone as cellPhone,
        email,
        phone,
        skier_count as skierCount,
        customer_type as customerType,
        status,
        salesperson,
        notes,
        checked_in_at as checkedInAt,
        started_at as startedAt,
        completed_at as completedAt,
        created_at as createdAt,
        updated_at as updatedAt
      FROM intake_queue
      WHERE 1 = 1
        ${seasonWhere}
        ${statusWhere}
      ORDER BY
        CASE status
          WHEN 'being_helped' THEN 0
          WHEN 'agreement_started' THEN 1
          WHEN 'waiting' THEN 2
          ELSE 3
        END,
        checked_in_at ASC
      `
    )
    .all(...args) as IntakeQueueItem[];

  return mapQueueRows(rows);
}

export function getQueueItem(id: number): IntakeQueueItem {
  const item = db
    .prepare(
      `
      SELECT
        id,
        customer_id as customerId,
        source_agreement_id as sourceAgreementId,
        agreement_id as agreementId,
        season_year as seasonYear,
        customer_name as customerName,
        address,
        city,
        state,
        zip,
        home_phone as homePhone,
        cell_phone as cellPhone,
        email,
        phone,
        skier_count as skierCount,
        customer_type as customerType,
        status,
        salesperson,
        notes,
        checked_in_at as checkedInAt,
        started_at as startedAt,
        completed_at as completedAt,
        created_at as createdAt,
        updated_at as updatedAt
      FROM intake_queue
      WHERE id = ?
      `
    )
    .get(id) as IntakeQueueItem | undefined;

  if (!item) {
    throw new Error("Queue item not found.");
  }

  return item;
}

export function saveQueueItem(payload: IntakeQueuePayload, queueItemId?: number) {
  const normalized = normalizeQueuePayload(payload);

  if (!normalized.customerName) {
    throw new Error("Customer name is required for queue intake.");
  }

  const now = timestamp();
  const existing = queueItemId ? getQueueItem(queueItemId) : null;
  const startedAt =
    normalized.status === "being_helped" || normalized.status === "agreement_started"
      ? existing?.startedAt ?? now
      : existing?.startedAt ?? null;
  const completedAt =
    normalized.status === "completed" || normalized.status === "cancelled"
      ? existing?.completedAt ?? now
      : existing?.completedAt ?? null;

  if (queueItemId) {
    db.prepare(
      `
      UPDATE intake_queue
      SET
        customer_id = ?,
        source_agreement_id = ?,
        agreement_id = ?,
        season_year = ?,
        customer_name = ?,
        address = ?,
        city = ?,
        state = ?,
        zip = ?,
        home_phone = ?,
        cell_phone = ?,
        email = ?,
        phone = ?,
        skier_count = ?,
        customer_type = ?,
        status = ?,
        salesperson = ?,
        notes = ?,
        started_at = ?,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
      `
    ).run(
      normalized.customerId,
      normalized.sourceAgreementId,
      normalized.agreementId,
      normalized.seasonYear,
      normalized.customerName,
      normalized.address,
      normalized.city,
      normalized.state,
      normalized.zip,
      normalized.homePhone,
      normalized.cellPhone,
      normalized.email,
      normalized.phone,
      normalized.skierCount,
      normalized.customerType,
      normalized.status,
      normalized.salesperson,
      normalized.notes,
      startedAt,
      completedAt,
      now,
      queueItemId
    );

    return getQueueItem(queueItemId);
  }

  const result = db
    .prepare(
      `
      INSERT INTO intake_queue (
        customer_id,
        source_agreement_id,
        agreement_id,
        season_year,
        customer_name,
        address,
        city,
        state,
        zip,
        home_phone,
        cell_phone,
        email,
        phone,
        skier_count,
        customer_type,
        status,
        salesperson,
        notes,
        checked_in_at,
        started_at,
        completed_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      normalized.customerId,
      normalized.sourceAgreementId,
      normalized.agreementId,
      normalized.seasonYear,
      normalized.customerName,
      normalized.address,
      normalized.city,
      normalized.state,
      normalized.zip,
      normalized.homePhone,
      normalized.cellPhone,
      normalized.email,
      normalized.phone,
      normalized.skierCount,
      normalized.customerType,
      normalized.status,
      normalized.salesperson,
      normalized.notes,
      now,
      startedAt,
      completedAt,
      now,
      now
    );

  return getQueueItem(Number(result.lastInsertRowid));
}

export function getDashboardData(seasonYear?: number): DashboardResponse {
  const availableSeasonYears = getAvailableSeasonYears();
  const fallbackSeasonYear = getDefaultRentalSeasonYear();
  const selectedSeasonYear =
    seasonYear && availableSeasonYears.includes(seasonYear)
      ? seasonYear
      : fallbackSeasonYear;

  const agreementCounts = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeRentals,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returnedRentals,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closedRentals
      FROM rental_agreements
      WHERE season_year = ?
      `
    )
    .get(selectedSeasonYear) as DashboardStats;

  const customerCount = db
    .prepare(
      `
      SELECT COUNT(DISTINCT customer_id) as totalCustomers
      FROM rental_agreements
      WHERE season_year = ?
      `
    )
    .get(selectedSeasonYear) as { totalCustomers: number };

  const skierCount = db
    .prepare(
      `
      SELECT COUNT(s.id) as totalSkiers
      FROM skiers s
      JOIN rental_agreements ra ON ra.id = s.agreement_id
      WHERE ra.season_year = ?
      `
    )
    .get(selectedSeasonYear) as { totalSkiers: number };

  return {
    selectedSeasonYear,
    availableSeasonYears,
    stats: {
      activeRentals: agreementCounts.activeRentals ?? 0,
      returnedRentals: agreementCounts.returnedRentals ?? 0,
      closedRentals: agreementCounts.closedRentals ?? 0,
      totalCustomers: customerCount.totalCustomers ?? 0,
      totalSkiers: skierCount.totalSkiers ?? 0
    },
    queueItems: listQueueItems(selectedSeasonYear)
  };
}

export function listAgreements(
  search = "",
  filters: {
    name?: string;
    phone?: string;
    email?: string;
    seasonYear?: number;
  } = {}
): AgreementSummary[] {
  const term = `%${search.trim().toLowerCase()}%`;
  const nameTerm = `%${(filters.name ?? "").trim().toLowerCase()}%`;
  const phoneTerm = `%${(filters.phone ?? "").trim().toLowerCase()}%`;
  const emailTerm = `%${(filters.email ?? "").trim().toLowerCase()}%`;
  const hasName = Boolean(filters.name?.trim());
  const hasPhone = Boolean(filters.phone?.trim());
  const hasEmail = Boolean(filters.email?.trim());
  const hasSeasonYear = Boolean(filters.seasonYear);
  const rows = db
    .prepare(
      `
      SELECT
        ra.id,
        ra.customer_id as customerId,
        ra.season_year as seasonYear,
        c.parent_name as parentName,
        ra.salesperson,
        ra.agreement_date as agreementDate,
        ra.return_due_date as returnDueDate,
        ra.status,
        c.email,
        c.home_phone as homePhone,
        c.cell_phone as cellPhone,
        ra.updated_at as updatedAt,
        COUNT(s.id) as skierCount,
        SUM(
          CASE
            WHEN TRIM(s.ski_model) != ''
              OR TRIM(s.ski_size) != ''
              OR TRIM(s.ski_serial_number) != ''
              OR TRIM(s.ski_bo) != ''
            THEN 1
            ELSE 0
          END
        ) as skiCount,
        SUM(
          CASE
            WHEN TRIM(s.boot_model) != ''
              OR TRIM(s.boot_color) != ''
              OR TRIM(s.boot_size) != ''
              OR TRIM(s.boot_bo) != ''
            THEN 1
            ELSE 0
          END
        ) as bootCount,
        GROUP_CONCAT(s.skier_name, '||') as skierNames
      FROM rental_agreements ra
      JOIN customers c ON c.id = ra.customer_id
      LEFT JOIN skiers s ON s.agreement_id = ra.id
      WHERE (
        ? = '%%'
        OR LOWER(c.parent_name) LIKE ?
        OR LOWER(c.email) LIKE ?
        OR LOWER(c.home_phone) LIKE ?
        OR LOWER(c.cell_phone) LIKE ?
        OR EXISTS (
          SELECT 1 FROM skiers s2
          WHERE s2.agreement_id = ra.id
          AND LOWER(s2.skier_name) LIKE ?
        )
      )
      AND (? = 0 OR LOWER(c.parent_name) LIKE ? OR EXISTS (
        SELECT 1 FROM skiers s3
        WHERE s3.agreement_id = ra.id
        AND LOWER(s3.skier_name) LIKE ?
      ))
      AND (? = 0 OR LOWER(c.home_phone) LIKE ? OR LOWER(c.cell_phone) LIKE ?)
      AND (? = 0 OR LOWER(c.email) LIKE ?)
      AND (? = 0 OR ra.season_year = ?)
      GROUP BY ra.id
      ORDER BY
        CASE ra.status
          WHEN 'active' THEN 0
          WHEN 'returned' THEN 1
          ELSE 2
        END,
        ra.season_year DESC,
        ra.updated_at DESC
      `
    )
    .all(
      term,
      term,
      term,
      term,
      term,
      term,
      hasName ? 1 : 0,
      nameTerm,
      nameTerm,
      hasPhone ? 1 : 0,
      phoneTerm,
      phoneTerm,
      hasEmail ? 1 : 0,
      emailTerm,
      hasSeasonYear ? 1 : 0,
      filters.seasonYear ?? 0
    ) as Array<
    Omit<AgreementSummary, "skierNames"> & {
      skierNames: string | null;
    }
  >;

  return rows.map((row) => ({
    ...row,
    skierCount: row.skierCount ?? 0,
    skiCount: row.skiCount ?? 0,
    bootCount: row.bootCount ?? 0,
    skierNames: row.skierNames ? row.skierNames.split("||") : []
  }));
}

export function getAgreement(id: number): RentalAgreementRecord {
  return buildAgreementRecord(id);
}

export function getCustomerProfile(customerId: number): CustomerProfile {
  const customer = db
    .prepare(
      `
      SELECT
        id as customerId,
        parent_name as parentName,
        address,
        city,
        state,
        zip,
        home_phone as homePhone,
        cell_phone as cellPhone,
        email
      FROM customers
      WHERE id = ?
      `
    )
    .get(customerId) as CustomerProfile | undefined;

  if (!customer) {
    throw new Error("Customer not found.");
  }

  const seasons = db
    .prepare(
      `
      SELECT
        ra.id as agreementId,
        ra.season_year as seasonYear,
        ra.agreement_date as agreementDate,
        ra.return_due_date as returnDueDate,
        ra.status,
        ra.salesperson,
        COUNT(s.id) as skierCount,
        GROUP_CONCAT(s.skier_name, '||') as skierNames
      FROM rental_agreements ra
      LEFT JOIN skiers s ON s.agreement_id = ra.id
      WHERE ra.customer_id = ?
      GROUP BY ra.id
      ORDER BY ra.season_year DESC, ra.agreement_date DESC
      `
    )
    .all(customerId) as Array<
    Omit<CustomerSeasonRecord, "skierNames"> & {
      skierNames: string | null;
    }
  >;

  return {
    ...customer,
    seasons: seasons.map((season) => ({
      ...season,
      skierNames: season.skierNames ? season.skierNames.split("||") : []
    }))
  };
}

export function buildRenewalTemplate(agreementId: number, seasonYear?: number) {
  const existing = buildAgreementRecord(agreementId);
  const templateYear = seasonYear ?? existing.seasonYear + 1;

  return {
    customerId: existing.customerId,
    salesperson: "",
    seasonYear: templateYear,
    parentName: existing.parentName,
    address: existing.address,
    city: existing.city,
    state: existing.state,
    zip: existing.zip,
    homePhone: existing.homePhone,
    cellPhone: existing.cellPhone,
    email: existing.email,
    agreementDate: new Date().toISOString().slice(0, 10),
    customerSignaturePlaceholder: "",
    employeeSignaturePlaceholder: "",
    equipmentResponsibilityAmount: existing.equipmentResponsibilityAmount,
    customerAcceptance: false,
    returnDueDate: getDefaultReturnDueDate(templateYear),
    status: "active" as RentalStatus,
    notes: "",
    skiers: existing.skiers.map((skier) => ({
      skierName: skier.skierName,
      skierType: skier.skierType,
      skiModel: "",
      skiSize: "",
      skiSerialNumber: "",
      skiBO: "",
      poleIncluded: skier.poleIncluded,
      poleSize: "",
      poleBO: "",
      bootModel: "",
      bootColor: "",
      bootSize: "",
      bootBO: ""
    }))
  };
}

function querySerialConflicts(
  skiers: SkierFormData[],
  status: RentalStatus,
  currentAgreementId?: number
): DuplicateSerialWarning[] {
  if (status !== "active") {
    return [];
  }

  const serials = skiers
    .map((skier) => skier.skiSerialNumber.trim().toUpperCase())
    .filter(Boolean);

  if (serials.length === 0) {
    return [];
  }

  const placeholders = serials.map(() => "?").join(", ");
  const args: Array<string | number> = [...serials, ...(currentAgreementId ? [currentAgreementId] : [])];
  const whereCurrent = currentAgreementId ? "AND ra.id != ?" : "";

  const matches = db
    .prepare(
      `
      SELECT
        s.ski_serial_number as serialNumber,
        ra.id as conflictingAgreementId,
        c.parent_name as conflictingParentName,
        s.skier_name as conflictingSkierName
      FROM skiers s
      JOIN rental_agreements ra ON ra.id = s.agreement_id
      JOIN customers c ON c.id = ra.customer_id
      WHERE s.ski_serial_number IN (${placeholders})
        AND ra.status = 'active'
        ${whereCurrent}
      `
    )
    .all(...args) as DuplicateSerialWarning[];

  return matches;
}

export function saveAgreement(payload: RentalAgreementPayload, agreementId?: number) {
  const normalized = normalizeAgreementPayload(payload);

  if (!normalized.parentName.trim()) {
    throw new Error("Parent/customer name is required.");
  }

  if (!normalized.seasonYear || Number.isNaN(normalized.seasonYear)) {
    throw new Error("Season year is required.");
  }

  const duplicateSerials = querySerialConflicts(
    normalized.skiers,
    normalized.status,
    agreementId
  );

  const now = timestamp();

  const result = db.transaction(() => {
    let customerId: number;
    let savedAgreementId = agreementId;

    if (agreementId) {
      const existing = db
        .prepare("SELECT customer_id as customerId FROM rental_agreements WHERE id = ?")
        .get(agreementId) as { customerId: number } | undefined;

      if (!existing) {
        throw new Error("Agreement not found.");
      }

      customerId = existing.customerId;

      db.prepare(
        `
        UPDATE customers
        SET
          parent_name = ?,
          address = ?,
          city = ?,
          state = ?,
          zip = ?,
          home_phone = ?,
          cell_phone = ?,
          email = ?,
          updated_at = ?
        WHERE id = ?
        `
      ).run(
        normalized.parentName.trim(),
        normalized.address.trim(),
        normalized.city.trim(),
        normalized.state.trim(),
        normalized.zip.trim(),
        normalized.homePhone.trim(),
        normalized.cellPhone.trim(),
        normalized.email.trim(),
        now,
        customerId
      );

      db.prepare(
        `
        UPDATE rental_agreements
        SET
          salesperson = ?,
          season_year = ?,
          agreement_date = ?,
          customer_signature_placeholder = ?,
          employee_signature_placeholder = ?,
          equipment_responsibility_amount = ?,
          customer_acceptance = ?,
          return_due_date = ?,
          status = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
        `
      ).run(
        normalized.salesperson.trim(),
        normalized.seasonYear,
        normalized.agreementDate,
        normalized.customerSignaturePlaceholder.trim(),
        normalized.employeeSignaturePlaceholder.trim(),
        normalized.equipmentResponsibilityAmount,
        normalized.customerAcceptance ? 1 : 0,
        normalized.returnDueDate,
        normalized.status,
        normalized.notes,
        now,
        agreementId
      );

      db.prepare("DELETE FROM skiers WHERE agreement_id = ?").run(agreementId);
    } else {
      if (normalized.customerId) {
        const existingCustomer = db
          .prepare("SELECT id FROM customers WHERE id = ?")
          .get(normalized.customerId) as { id: number } | undefined;

        if (!existingCustomer) {
          throw new Error("Selected customer record no longer exists.");
        }

        customerId = normalized.customerId;
        db.prepare(
          `
          UPDATE customers
          SET
            parent_name = ?,
            address = ?,
            city = ?,
            state = ?,
            zip = ?,
            home_phone = ?,
            cell_phone = ?,
            email = ?,
            updated_at = ?
          WHERE id = ?
          `
        ).run(
          normalized.parentName.trim(),
          normalized.address.trim(),
          normalized.city.trim(),
          normalized.state.trim(),
          normalized.zip.trim(),
          normalized.homePhone.trim(),
          normalized.cellPhone.trim(),
          normalized.email.trim(),
          now,
          customerId
        );
      } else {
        const customerResult = db
          .prepare(
            `
            INSERT INTO customers (
              parent_name, address, city, state, zip, home_phone, cell_phone, email, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            normalized.parentName.trim(),
            normalized.address.trim(),
            normalized.city.trim(),
            normalized.state.trim(),
            normalized.zip.trim(),
            normalized.homePhone.trim(),
            normalized.cellPhone.trim(),
            normalized.email.trim(),
            now,
            now
          );

        customerId = Number(customerResult.lastInsertRowid);
      }

      const agreementResult = db
        .prepare(
          `
          INSERT INTO rental_agreements (
            customer_id,
            salesperson,
            season_year,
            agreement_date,
            customer_signature_placeholder,
            employee_signature_placeholder,
            equipment_responsibility_amount,
            customer_acceptance,
            return_due_date,
            status,
            notes,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          customerId,
          normalized.salesperson.trim(),
          normalized.seasonYear,
          normalized.agreementDate,
          normalized.customerSignaturePlaceholder.trim(),
          normalized.employeeSignaturePlaceholder.trim(),
          normalized.equipmentResponsibilityAmount,
          normalized.customerAcceptance ? 1 : 0,
          normalized.returnDueDate,
          normalized.status,
          normalized.notes,
          now,
          now
        );

      savedAgreementId = Number(agreementResult.lastInsertRowid);
    }

    const insertSkier = db.prepare(
      `
      INSERT INTO skiers (
        agreement_id,
        skier_name,
        skier_type,
        ski_model,
        ski_size,
        ski_serial_number,
        ski_bo,
        pole_included,
        pole_size,
        pole_bo,
        boot_model,
        boot_color,
        boot_size,
        boot_bo,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    for (const skier of normalized.skiers) {
      insertSkier.run(
        savedAgreementId,
        skier.skierName,
        skier.skierType,
        skier.skiModel,
        skier.skiSize,
        skier.skiSerialNumber,
        skier.skiBO,
        skier.poleIncluded ? 1 : 0,
        skier.poleSize,
        skier.poleBO,
        skier.bootModel,
        skier.bootColor,
        skier.bootSize,
        skier.bootBO,
        now,
        now
      );
    }

    return savedAgreementId!;
  })();

  return {
    agreement: buildAgreementRecord(result),
    duplicateSerials
  };
}

export function deleteCustomer(customerId: number) {
  const result = db.prepare("DELETE FROM customers WHERE id = ?").run(customerId);
  if (result.changes === 0) {
    throw new Error("Customer not found.");
  }
}

export function getEquipmentBySerial(serial: string): EquipmentLookupResult {
  const normalized = serial.trim().toUpperCase();

  const activeMatch = db
    .prepare(
      `
      SELECT
        ra.id as agreementId,
        c.parent_name as parentName,
        s.skier_name as skierName,
        ra.status as status,
        ra.return_due_date as returnDueDate
      FROM skiers s
      JOIN rental_agreements ra ON ra.id = s.agreement_id
      JOIN customers c ON c.id = ra.customer_id
      WHERE s.ski_serial_number = ?
      AND ra.status = 'active'
      ORDER BY ra.updated_at DESC
      LIMIT 1
      `
    )
    .get(normalized) as EquipmentLookupResult["activeMatch"];

  const history = db
    .prepare(
      `
      SELECT
        ra.id as agreementId,
        c.parent_name as parentName,
        s.skier_name as skierName,
        ra.agreement_date as agreementDate,
        ra.status as status
      FROM skiers s
      JOIN rental_agreements ra ON ra.id = s.agreement_id
      JOIN customers c ON c.id = ra.customer_id
      WHERE s.ski_serial_number = ?
      ORDER BY ra.agreement_date DESC
      `
    )
    .all(normalized) as EquipmentLookupResult["history"];

  return {
    serialNumber: normalized,
    activeMatch: activeMatch ?? null,
    history
  };
}

export function exportRows() {
  return db
    .prepare(
      `
      SELECT
        ra.id as agreementId,
        c.parent_name as parentName,
        c.address,
        c.city,
        c.state,
        c.zip,
        c.home_phone as homePhone,
        c.cell_phone as cellPhone,
        c.email,
        ra.salesperson,
        ra.season_year as seasonYear,
        ra.agreement_date as agreementDate,
        ra.return_due_date as returnDueDate,
        ra.status,
        ra.equipment_responsibility_amount as equipmentResponsibilityAmount,
        ra.notes,
        s.skier_name as skierName,
        s.skier_type as skierType,
        s.ski_model as skiModel,
        s.ski_size as skiSize,
        s.ski_serial_number as skiSerialNumber,
        s.ski_bo as skiBO,
        s.pole_included as poleIncluded,
        s.pole_size as poleSize,
        s.pole_bo as poleBO,
        s.boot_model as bootModel,
        s.boot_color as bootColor,
        s.boot_size as bootSize,
        s.boot_bo as bootBO
      FROM rental_agreements ra
      JOIN customers c ON c.id = ra.customer_id
      LEFT JOIN skiers s ON s.agreement_id = ra.id
      ORDER BY ra.updated_at DESC, s.id ASC
      `
    )
    .all();
}
