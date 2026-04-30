import { useEffect, useMemo, useRef, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";

import {
  deleteCustomer,
  exportCsvUrl,
  fetchCustomer,
  fetchAgreement,
  fetchAgreements,
  fetchDashboard,
  fetchRenewalTemplate,
  saveAgreement,
  saveQueueItem
} from "./api";
import type {
  AgreementSummary,
  CustomerProfile,
  DuplicateSerialWarning,
  IntakeQueueItem,
  RentalAgreementPayload,
  RentalAgreementRecord,
  RentalStatus,
  SkierFormData
} from "../shared/types";

function createEmptySkier(): SkierFormData {
  return {
    skierName: "",
    skierType: "I",
    skiModel: "",
    skiSize: "",
    skiSerialNumber: "",
    skiBO: "",
    poleIncluded: true,
    poleSize: "",
    poleBO: "",
    bootModel: "",
    bootColor: "",
    bootSize: "",
    bootBO: ""
  };
}

function createDefaultAgreement(): RentalAgreementPayload {
  const today = new Date().toISOString().slice(0, 10);
  const defaultSeasonYear = getDefaultRentalSeasonYear();

  return {
    seasonYear: defaultSeasonYear,
    salesperson: "",
    parentName: "",
    address: "",
    city: "",
    state: "NY",
    zip: "",
    homePhone: "",
    cellPhone: "",
    email: "",
    agreementDate: today,
    customerSignaturePlaceholder: "",
    employeeSignaturePlaceholder: "",
    equipmentResponsibilityAmount: 0,
    customerAcceptance: false,
    returnDueDate: getDefaultReturnDueDate(defaultSeasonYear),
    status: "active",
    notes: "",
    skiers: [createEmptySkier()]
  };
}

function formatDate(value: string) {
  if (!value) {
    return "—";
  }

  return new Date(`${value}T12:00:00`).toLocaleDateString();
}

function getNextSeasonYear(seasonYear: number) {
  return seasonYear + 1;
}

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

function isSignatureImage(value: string) {
  return value.startsWith("data:image/");
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Internal Demo</p>
          <h1>High Adventure Rentals</h1>
          <p className="sidebar-copy">
            Local-first seasonal rental management proof of concept for front
            counter staff.
          </p>
        </div>

        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/search">Search Rentals</NavLink>
          <NavLink to="/reports">Reports</NavLink>
        </nav>

        <div className="sidebar-card">
          <strong>Demo notes</strong>
          <p>
            Runs entirely on this computer with SQLite. Customer and rental
            records stay local to this machine.
          </p>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/search" element={<SearchRentalsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/rentals/start" element={<RentalStartPage />} />
        <Route path="/rentals/returning" element={<ReturningCustomerRentalPage />} />
        <Route path="/rentals/new" element={<AgreementEditorPage />} />
        <Route path="/rentals/:id" element={<AgreementEditorPage />} />
        <Route path="/rentals/:id/print" element={<PrintAgreementPage />} />
      </Routes>
    </Layout>
  );
}

function DashboardPage() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flashMessage, setFlashMessage] = useState(
    (location.state as { flash?: string } | null)?.flash ?? ""
  );
  const [selectedSeasonYear, setSelectedSeasonYear] = useState<number | undefined>(
    undefined
  );
  const [availableSeasonYears, setAvailableSeasonYears] = useState<number[]>([]);
  const [stats, setStats] = useState({
    activeRentals: 0,
    returnedRentals: 0,
    closedRentals: 0,
    totalCustomers: 0,
    totalSkiers: 0
  });
  const [queueItems, setQueueItems] = useState<IntakeQueueItem[]>([]);

  async function reloadDashboard(seasonYear = selectedSeasonYear) {
    setLoading(true);
    try {
      const data = await fetchDashboard(seasonYear);
      setSelectedSeasonYear(data.selectedSeasonYear);
      setAvailableSeasonYears(data.availableSeasonYears);
      setStats(data.stats);
      setQueueItems(data.queueItems);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadDashboard(selectedSeasonYear);
  }, [selectedSeasonYear]);

  useEffect(() => {
    const stateFlash = (location.state as { flash?: string } | null)?.flash ?? "";
    if (stateFlash) {
      setFlashMessage(stateFlash);
    }
  }, [location.state]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Rental activity at a glance</h2>
          <p className="muted">
            Quick visibility for the selected season's active rentals, returns,
            and customer volume.
          </p>
        </div>

        <div className="header-actions">
          <label className="season-filter">
            <span>Season</span>
            <select
              value={selectedSeasonYear ?? ""}
              onChange={(event) => setSelectedSeasonYear(Number(event.target.value))}
            >
              {availableSeasonYears.map((seasonYear) => (
                <option key={seasonYear} value={seasonYear}>
                  {seasonYear}
                </option>
              ))}
            </select>
          </label>
          <NavLink
            className="button primary"
            to={`/rentals/start?seasonYear=${
              selectedSeasonYear ?? getDefaultRentalSeasonYear()
            }`}
          >
            Start New Rental
          </NavLink>
          <NavLink
            className="button secondary"
            to={`/rentals/returning?seasonYear=${
              selectedSeasonYear ?? getDefaultRentalSeasonYear()
            }`}
          >
            Start Returning Customer Rental
          </NavLink>
        </div>
      </header>

      {loading ? <p className="card">Loading dashboard…</p> : null}
      {flashMessage ? <p className="card success">{flashMessage}</p> : null}
      {error ? <p className="card error">{error}</p> : null}

      {!loading ? (
        <>
          <section className="stats-grid">
            <StatCard label="Active Rentals" value={stats.activeRentals} />
            <StatCard label="Returned Rentals" value={stats.returnedRentals} />
            <StatCard label="Closed Rentals" value={stats.closedRentals} />
            <StatCard label="Total Customers" value={stats.totalCustomers} />
            <StatCard label="Total Skiers" value={stats.totalSkiers} />
          </section>

          {queueItems.length > 0 ? (
            <section className="card">
              <div className="section-heading">
                <div>
                  <h3>Waiting rentals</h3>
                  <p className="muted">
                    Families added to the queue stay here until staff starts
                    their rental or removes them.
                  </p>
                </div>
              </div>

              <IntakeQueue
                items={queueItems}
                onChanged={() => void reloadDashboard()}
              />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function formatTime(value: string) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getQueueStatusLabel(status: IntakeQueueItem["status"]) {
  switch (status) {
    case "being_helped":
      return "Being helped";
    case "agreement_started":
      return "Agreement started";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Waiting";
  }
}

function getCustomerTypeLabel(type: IntakeQueueItem["customerType"]) {
  switch (type) {
    case "returning":
      return "Returning";
    case "new":
      return "New";
    default:
      return "Unknown";
  }
}

function buildQueueAgreementPath(item: IntakeQueueItem) {
  const params = new URLSearchParams({
    queueId: String(item.id),
    seasonYear: String(item.seasonYear),
    salesperson: item.salesperson,
    customerName: item.customerName,
    address: item.address,
    city: item.city,
    state: item.state,
    zip: item.zip,
    homePhone: item.homePhone,
    cellPhone: item.cellPhone,
    email: item.email,
    phone: item.phone,
    skierCount: String(item.skierCount)
  });

  if (item.sourceAgreementId) {
    params.set("fromAgreement", String(item.sourceAgreementId));
  }

  return `/rentals/new?${params.toString()}`;
}

function IntakeQueue({
  items,
  onChanged
}: {
  items: IntakeQueueItem[];
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function updateItem(item: IntakeQueueItem, status: IntakeQueueItem["status"]) {
    setError("");
    try {
      await saveQueueItem({ ...item, status }, item.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function startItem(item: IntakeQueueItem) {
    setError("");
    try {
      const result = await saveQueueItem(
        {
          ...item,
          status: "being_helped"
        },
        item.id
      );
      navigate(buildQueueAgreementPath(result.queueItem));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="queue-stack">
      {error ? <p className="error-text">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table queue-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Type</th>
              <th>Skiers</th>
              <th>Checked In</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.customerName}</strong>
                  <div className="muted">{item.phone || "No phone recorded"}</div>
                  {item.notes ? <div className="muted">{item.notes}</div> : null}
                </td>
                <td>{getCustomerTypeLabel(item.customerType)}</td>
                <td>{item.skierCount}</td>
                <td>{formatTime(item.checkedInAt)}</td>
                <td>
                  <span className={`status-pill queue-${item.status}`}>
                    {getQueueStatusLabel(item.status)}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="button primary compact"
                      type="button"
                      onClick={() => void startItem(item)}
                    >
                      Start Rental
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void updateItem(item, "cancelled")}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RentalStartPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [seasonYear, setSeasonYear] = useState(
    searchParams.get("seasonYear")
      ? Number(searchParams.get("seasonYear"))
      : getDefaultRentalSeasonYear()
  );
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("NY");
  const [zip, setZip] = useState("");
  const [homePhone, setHomePhone] = useState("");
  const [cellPhone, setCellPhone] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [skierCount, setSkierCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setCustomerName("");
    setAddress("");
    setCity("");
    setState("NY");
    setZip("");
    setHomePhone("");
    setCellPhone("");
    setEmail("");
    setPhone("");
    setSkierCount(1);
    setNotes("");
  }

  function buildAgreementStartPath(queueId?: number) {
    const params = new URLSearchParams({
      seasonYear: String(seasonYear),
      customerName,
      address,
      city,
      state,
      zip,
      homePhone,
      cellPhone,
      email,
      phone: phone || cellPhone || homePhone,
      skierCount: String(skierCount)
    });

    if (queueId) {
      params.set("queueId", String(queueId));
    }

    return `/rentals/new?${params.toString()}`;
  }

  async function addToQueue() {
    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await saveQueueItem({
        customerId: null,
        sourceAgreementId: null,
        agreementId: null,
        seasonYear,
        customerName,
        address,
        city,
        state,
        zip,
        homePhone,
        cellPhone,
        email,
        phone: phone || cellPhone || homePhone,
        skierCount,
        customerType: "new",
        status: "waiting",
        salesperson: "",
        notes
      });
      resetForm();
      navigate("/", { state: { flash: "Customer added to the rental queue." } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startRental() {
    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }

    navigate(buildAgreementStartPath());
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Start Rental</p>
          <h2>New customer information</h2>
          <p className="muted">
            Enter the customer details first, then start the rental now or add
            them to the queue if staff is backed up.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Customer details</h3>
            <p className="muted">No equipment is entered until the rental starts.</p>
          </div>
        </div>

        <div className="form-grid">
          <FormField label="Customer Name">
            <input
              autoFocus
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </FormField>
          <FormField label="Season Year">
            <input
              type="number"
              value={seasonYear}
              onChange={(event) => setSeasonYear(Number(event.target.value))}
            />
          </FormField>
          <FormField label="Skiers">
            <input
              min="1"
              type="number"
              value={skierCount}
              onChange={(event) => setSkierCount(Math.max(1, Number(event.target.value)))}
            />
          </FormField>
          <FormField label="Address" wide>
            <input value={address} onChange={(event) => setAddress(event.target.value)} />
          </FormField>
          <FormField label="City">
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </FormField>
          <FormField label="State">
            <input value={state} onChange={(event) => setState(event.target.value)} />
          </FormField>
          <FormField label="ZIP">
            <input value={zip} onChange={(event) => setZip(event.target.value)} />
          </FormField>
          <FormField label="Home Phone">
            <input value={homePhone} onChange={(event) => setHomePhone(event.target.value)} />
          </FormField>
          <FormField label="Cell Phone">
            <input value={cellPhone} onChange={(event) => setCellPhone(event.target.value)} />
          </FormField>
          <FormField label="Email">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FormField>
          <FormField label="Notes" wide>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Timing, fit concerns, or anything staff should see while they wait"
            />
          </FormField>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="footer-actions">
          <button className="button primary" type="button" onClick={startRental}>
            Start Rental
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={saving}
            onClick={() => void addToQueue()}
          >
            {saving ? "Adding..." : "Add to Queue"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ReturningCustomerRentalPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [nameSearch, setNameSearch] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [emailSearch, setEmailSearch] = useState("");
  const targetSeasonYear = searchParams.get("seasonYear")
    ? Number(searchParams.get("seasonYear"))
    : getDefaultRentalSeasonYear();
  const [yearSearch, setYearSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState<AgreementSummary[]>([]);
  const [error, setError] = useState("");
  const [savingQueueId, setSavingQueueId] = useState<number | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      fetchAgreements("", {
        name: nameSearch,
        phone: phoneSearch,
        email: emailSearch,
        seasonYear: yearSearch
      })
        .then((data) => {
          setAgreements(data.agreements);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 200);

    return () => clearTimeout(timeout);
  }, [nameSearch, phoneSearch, emailSearch, yearSearch]);

  async function addAgreementToQueue(agreement: AgreementSummary) {
    setSavingQueueId(agreement.id);
    setError("");
    try {
      const result = await fetchAgreement(agreement.id);
      const record = result.agreement;
      await saveQueueItem({
        customerId: record.customerId,
        sourceAgreementId: record.id,
        agreementId: null,
        seasonYear: targetSeasonYear,
        customerName: record.parentName,
        address: record.address,
        city: record.city,
        state: record.state,
        zip: record.zip,
        homePhone: record.homePhone,
        cellPhone: record.cellPhone,
        email: record.email,
        phone: record.cellPhone || record.homePhone,
        skierCount: Math.max(record.skiers.length, 1),
        customerType: "returning",
        status: "waiting",
        salesperson: "",
        notes: ""
      });
      navigate("/", { state: { flash: "Customer added to the rental queue." } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingQueueId(null);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Search</p>
          <h2>Start returning customer rental</h2>
          <p className="muted">
            Find returning customers, then start this year's rental or add them
            to the queue.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Customer lookup</h3>
            <p className="muted">
              Fill in any one field, or combine fields to narrow the results.
            </p>
          </div>
        </div>

        <div className="form-grid">
          <FormField label="Name">
            <input
              autoFocus
              placeholder="Parent or skier name"
              value={nameSearch}
              onChange={(event) => setNameSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Phone Number">
            <input
              placeholder="Home or cell"
              value={phoneSearch}
              onChange={(event) => setPhoneSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={emailSearch}
              onChange={(event) => setEmailSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Year">
            <select value={yearSearch} onChange={(event) => setYearSearch(event.target.value)}>
              <option value="">All years</option>
              {Array.from(new Set(agreements.map((agreement) => agreement.seasonYear)))
                .sort((a, b) => b - a)
                .map((seasonYear) => (
                  <option key={seasonYear} value={seasonYear}>
                    {seasonYear}
                  </option>
                ))}
            </select>
          </FormField>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Customer records</h3>
            <p className="muted">
              These rows show customer and season history only. Equipment is
              entered after the rental starts.
            </p>
          </div>
        </div>

        {loading ? (
          <p>Searching...</p>
        ) : (
          <ExistingRentalTable
            agreements={agreements}
            targetSeasonYear={targetSeasonYear}
            savingQueueId={savingQueueId}
            onAddToQueue={(agreement) => void addAgreementToQueue(agreement)}
          />
        )}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}

function ExistingRentalTable({
  agreements,
  targetSeasonYear,
  savingQueueId,
  onAddToQueue
}: {
  agreements: AgreementSummary[];
  targetSeasonYear: number;
  savingQueueId: number | null;
  onAddToQueue: (agreement: AgreementSummary) => void;
}) {
  if (agreements.length === 0) {
    return <p className="muted">No customer records found.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Previous Season</th>
            <th>Skiers</th>
            <th>Contact</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {agreements.map((agreement) => (
            <tr key={agreement.id}>
              <td>
                <strong>{agreement.parentName}</strong>
                <div className="muted">{formatDate(agreement.agreementDate)}</div>
              </td>
              <td>{agreement.seasonYear}</td>
              <td>
                <div>{agreement.skierCount} skier(s)</div>
                <div className="muted">{agreement.skierNames.join(", ")}</div>
              </td>
              <td>
                <div>{agreement.cellPhone || agreement.homePhone || "-"}</div>
                <div className="muted">{agreement.email || "-"}</div>
              </td>
              <td>
                <span className={`status-pill ${agreement.status}`}>{agreement.status}</span>
              </td>
              <td>
                <div className="table-actions">
                  <NavLink
                    className="button primary compact"
                    to={`/rentals/new?fromAgreement=${agreement.id}&seasonYear=${targetSeasonYear}`}
                  >
                    Start New Yearly Rental
                  </NavLink>
                  <button
                    className="button secondary compact"
                    type="button"
                    disabled={savingQueueId === agreement.id}
                    onClick={() => onAddToQueue(agreement)}
                  >
                    {savingQueueId === agreement.id ? "Adding..." : "Add to Queue"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SearchRentalsPage() {
  const [nameSearch, setNameSearch] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [emailSearch, setEmailSearch] = useState("");
  const [yearSearch, setYearSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RentalStatus>("all");
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState<AgreementSummary[]>([]);
  const [error, setError] = useState("");
  const [returningAgreementId, setReturningAgreementId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      fetchAgreements("", {
        name: nameSearch,
        phone: phoneSearch,
        email: emailSearch,
        seasonYear: yearSearch
      })
        .then((data) => {
          setAgreements(data.agreements);
          setError("");
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 200);

    return () => clearTimeout(timeout);
  }, [nameSearch, phoneSearch, emailSearch, yearSearch, refreshKey]);

  const availableYears = useMemo(() => {
    return Array.from(new Set(agreements.map((agreement) => agreement.seasonYear))).sort(
      (a, b) => b - a
    );
  }, [agreements]);

  const visibleAgreements = useMemo(() => {
    if (statusFilter === "all") {
      return agreements;
    }

    return agreements.filter((agreement) => agreement.status === statusFilter);
  }, [agreements, statusFilter]);

  async function returnAgreement(agreement: AgreementSummary) {
    setReturningAgreementId(agreement.id);
    setError("");

    try {
      const result = await fetchAgreement(agreement.id);
      await saveAgreement(
        {
          ...result.agreement,
          status: "returned"
        },
        agreement.id
      );
      setRefreshKey((current) => current + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReturningAgreementId(null);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Search</p>
          <h2>Search rentals</h2>
          <p className="muted">
            Find current or closed-out rentals by customer, contact info, season,
            or status.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Rental lookup</h3>
            <p className="muted">
              Use one field or combine filters when the record is harder to find.
            </p>
          </div>
        </div>

        <div className="form-grid">
          <FormField label="Name">
            <input
              autoFocus
              placeholder="Parent or skier name"
              value={nameSearch}
              onChange={(event) => setNameSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Phone Number">
            <input
              placeholder="Home or cell"
              value={phoneSearch}
              onChange={(event) => setPhoneSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={emailSearch}
              onChange={(event) => setEmailSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Year">
            <select
              value={yearSearch}
              onChange={(event) => setYearSearch(event.target.value)}
            >
              <option value="">All years</option>
              {availableYears.map((seasonYear) => (
                <option key={seasonYear} value={seasonYear}>
                  {seasonYear}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Status">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | RentalStatus)
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="returned">Returned</option>
              <option value="closed">Closed</option>
            </select>
          </FormField>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Rental records</h3>
            <p className="muted">
              Open a rental to view equipment details, customer history, or print
              the agreement.
            </p>
          </div>
        </div>

        {loading ? (
          <p>Searching...</p>
        ) : (
          <AgreementTable
            agreements={visibleAgreements}
            returningAgreementId={returningAgreementId}
            onReturnAgreement={(agreement) => void returnAgreement(agreement)}
          />
        )}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}

function hasSkiRental(skier: SkierFormData) {
  return Boolean(
    skier.skiModel.trim() ||
      skier.skiSize.trim() ||
      skier.skiSerialNumber.trim() ||
      skier.skiBO.trim()
  );
}

function hasBootRental(skier: SkierFormData) {
  return Boolean(
    skier.bootModel.trim() ||
      skier.bootColor.trim() ||
      skier.bootSize.trim() ||
      skier.bootBO.trim()
  );
}

function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [reportAgreements, setReportAgreements] = useState<RentalAgreementRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAgreements("")
      .then(async (data) => {
        const records = await Promise.all(
          data.agreements.map((agreement) =>
            fetchAgreement(agreement.id).then((result) => result.agreement)
          )
        );
        setReportAgreements(records);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const seasonBreakdown = useMemo(() => {
    const summary = new Map<
      number,
      {
        agreements: number;
        active: number;
        returned: number;
        skiers: number;
        skis: number;
        boots: number;
      }
    >();

    for (const agreement of reportAgreements) {
      const entry = summary.get(agreement.seasonYear) ?? {
        agreements: 0,
        active: 0,
        returned: 0,
        skiers: 0,
        skis: 0,
        boots: 0
      };
      entry.agreements += 1;
      entry.skiers += agreement.skiers.length;
      entry.skis += agreement.skiers.filter(hasSkiRental).length;
      entry.boots += agreement.skiers.filter(hasBootRental).length;
      if (agreement.status === "active") {
        entry.active += 1;
      }
      if (agreement.status === "returned") {
        entry.returned += 1;
      }
      summary.set(agreement.seasonYear, entry);
    }

    return Array.from(summary.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([seasonYear, value]) => ({ seasonYear, ...value }));
  }, [reportAgreements]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Simple management reporting</h2>
          <p className="muted">
            Enough reporting to show how paper-based tracking becomes visible
            and searchable.
          </p>
        </div>

        <div className="header-actions">
          <a className="button secondary" href={exportCsvUrl}>
            Export CSV
          </a>
        </div>
      </header>

      {loading ? <p className="card">Loading reports…</p> : null}
      {error ? <p className="card error">{error}</p> : null}

      {!loading ? (
        <>
          <section className="card">
            <div className="section-heading">
              <div>
                <h3>Season tracker</h3>
                <p className="muted">
                  Shows yearly agreement volume so management can see the annual
                  rental cycle.
                </p>
              </div>
            </div>

            <div className="season-grid">
              {seasonBreakdown.map((season) => (
                <article className="subcard" key={season.seasonYear}>
                  <strong>{season.seasonYear} Season</strong>
                  <p>{season.agreements} agreements</p>
                  <p>{season.active} active</p>
                  <p>{season.returned} returned</p>
                  <p>{season.skiers} skiers</p>
                  <p>{season.skis} skis rented</p>
                  <p>{season.boots} boots rented</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function AgreementEditorPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const agreementId = params.id ? Number(params.id) : undefined;
  const isNew = !agreementId;
  const renewalSourceAgreementId = searchParams.get("fromAgreement")
    ? Number(searchParams.get("fromAgreement"))
    : undefined;
  const queueId = searchParams.get("queueId")
    ? Number(searchParams.get("queueId"))
    : undefined;
  const requestedSeasonYear = searchParams.get("seasonYear")
    ? Number(searchParams.get("seasonYear"))
    : undefined;
  const queuedSalesperson = searchParams.get("salesperson") ?? "";
  const queuedCustomerName = searchParams.get("customerName") ?? "";
  const queuedAddress = searchParams.get("address") ?? "";
  const queuedCity = searchParams.get("city") ?? "";
  const queuedState = searchParams.get("state") ?? "";
  const queuedZip = searchParams.get("zip") ?? "";
  const queuedHomePhone = searchParams.get("homePhone") ?? "";
  const queuedCellPhone = searchParams.get("cellPhone") ?? "";
  const queuedEmail = searchParams.get("email") ?? "";
  const queuedPhone = searchParams.get("phone") ?? "";
  const queuedSkierCount = searchParams.get("skierCount")
    ? Math.max(1, Number(searchParams.get("skierCount")))
    : 1;
  const [form, setForm] = useState<RentalAgreementPayload>(createDefaultAgreement());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [serialWarnings, setSerialWarnings] = useState<DuplicateSerialWarning[]>([]);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [activeSignatureField, setActiveSignatureField] = useState<
    "customerSignaturePlaceholder" | "employeeSignaturePlaceholder" | null
  >(null);
  const [signatureHasInk, setSignatureHasInk] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingSignatureRef = useRef(false);

  useEffect(() => {
    if (!agreementId) {
      if (renewalSourceAgreementId) {
        setLoading(true);
        fetchRenewalTemplate(renewalSourceAgreementId, requestedSeasonYear)
          .then((data) => {
            setForm({
              ...data.template,
              salesperson: queuedSalesperson || data.template.salesperson,
              parentName: queuedCustomerName || data.template.parentName,
              address: queuedAddress || data.template.address,
              city: queuedCity || data.template.city,
              state: queuedState || data.template.state,
              zip: queuedZip || data.template.zip,
              homePhone: queuedHomePhone || data.template.homePhone,
              cellPhone: queuedCellPhone || queuedPhone || data.template.cellPhone,
              email: queuedEmail || data.template.email
            });
            setCustomerProfile(null);
          })
          .catch((err: Error) => setError(err.message))
          .finally(() => setLoading(false));
      } else {
        const defaultAgreement = createDefaultAgreement();
        const formSeasonYear = requestedSeasonYear ?? defaultAgreement.seasonYear;
        setForm({
          ...defaultAgreement,
          seasonYear: formSeasonYear,
          returnDueDate: getDefaultReturnDueDate(formSeasonYear),
          salesperson: queuedSalesperson,
          parentName: queuedCustomerName,
          address: queuedAddress,
          city: queuedCity,
          state: queuedState || defaultAgreement.state,
          zip: queuedZip,
          homePhone: queuedHomePhone,
          cellPhone: queuedCellPhone || queuedPhone,
          email: queuedEmail,
          skiers: Array.from({ length: queuedSkierCount }, () => createEmptySkier())
        });
        setCustomerProfile(null);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    fetchAgreement(agreementId)
      .then((data) => {
        const record = data.agreement;
        setForm({
          customerId: record.customerId,
          seasonYear: record.seasonYear,
          salesperson: record.salesperson,
          parentName: record.parentName,
          address: record.address,
          city: record.city,
          state: record.state,
          zip: record.zip,
          homePhone: record.homePhone,
          cellPhone: record.cellPhone,
          email: record.email,
          agreementDate: record.agreementDate,
          customerSignaturePlaceholder: record.customerSignaturePlaceholder,
          employeeSignaturePlaceholder: record.employeeSignaturePlaceholder,
          equipmentResponsibilityAmount: record.equipmentResponsibilityAmount,
          customerAcceptance: record.customerAcceptance,
          returnDueDate: record.returnDueDate,
          status: record.status,
          notes: record.notes,
          skiers: record.skiers
        });
        return fetchCustomer(record.customerId);
      })
      .then((data) => {
        if (data) {
          setCustomerProfile(data.customer);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [
    agreementId,
    renewalSourceAgreementId,
    requestedSeasonYear,
    queuedCustomerName,
    queuedAddress,
    queuedCity,
    queuedState,
    queuedZip,
    queuedHomePhone,
    queuedCellPhone,
    queuedEmail,
    queuedPhone,
    queuedSalesperson,
    queuedSkierCount
  ]);

  function setField<K extends keyof RentalAgreementPayload>(
    key: K,
    value: RentalAgreementPayload[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setSkierField<K extends keyof SkierFormData>(
    index: number,
    key: K,
    value: SkierFormData[K]
  ) {
    setForm((current) => ({
      ...current,
      skiers: current.skiers.map((skier, skierIndex) =>
        skierIndex === index ? { ...skier, [key]: value } : skier
      )
    }));
  }

  useEffect(() => {
    if (!activeSignatureField) {
      return;
    }

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = "#17323a";

    const existingValue = form[activeSignatureField];
    setSignatureHasInk(isSignatureImage(existingValue));

    if (isSignatureImage(existingValue)) {
      const image = new Image();
      image.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = existingValue;
    }
  }, [activeSignatureField, form]);

  function getSignaturePoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function startSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) {
      return;
    }

    const point = getSignaturePoint(event);
    drawingSignatureRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function drawSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingSignatureRef.current) {
      return;
    }

    const context = event.currentTarget.getContext("2d");
    if (!context) {
      return;
    }

    const point = getSignaturePoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setSignatureHasInk(true);
  }

  function endSignature() {
    drawingSignatureRef.current = false;
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureHasInk(false);
  }

  function saveSignature() {
    if (!activeSignatureField || !signatureCanvasRef.current) {
      return;
    }

    setField(activeSignatureField, signatureCanvasRef.current.toDataURL("image/png"));
    setActiveSignatureField(null);
  }

  function addSkier(count = 1) {
    setForm((current) => ({
      ...current,
      skiers: [...current.skiers, ...Array.from({ length: count }, () => createEmptySkier())]
    }));
  }

  function removeSkier(index: number) {
    setForm((current) => ({
      ...current,
      skiers:
        current.skiers.length === 1
          ? current.skiers
          : current.skiers.filter((_, skierIndex) => skierIndex !== index)
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.customerAcceptance) {
      setError("Customer must accept the seasonal rental agreement terms before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const result = await saveAgreement(form, agreementId);
      setSerialWarnings(result.duplicateSerials);
      setSuccessMessage(
        result.duplicateSerials.length > 0
          ? "Agreement saved with serial number warning."
          : "Agreement saved successfully."
      );

      if (queueId) {
        await saveQueueItem(
          {
            customerId: result.agreement.customerId,
            sourceAgreementId: renewalSourceAgreementId ?? null,
            agreementId: result.agreement.id,
            seasonYear: result.agreement.seasonYear,
            customerName: result.agreement.parentName,
            address: result.agreement.address,
            city: result.agreement.city,
            state: result.agreement.state,
            zip: result.agreement.zip,
            homePhone: result.agreement.homePhone,
            cellPhone: result.agreement.cellPhone,
            email: result.agreement.email,
            phone: result.agreement.cellPhone || result.agreement.homePhone,
            skierCount: result.agreement.skiers.length || 1,
            customerType: renewalSourceAgreementId ? "returning" : "new",
            status: "completed",
            salesperson: result.agreement.salesperson,
            notes: form.notes
          },
          queueId
        );
      }

      if (isNew) {
        navigate("/", {
          state: {
            flash:
              result.duplicateSerials.length > 0
                ? "Information saved. Agreement created with a serial number warning."
                : "Information saved."
          }
        });
      } else if (result.agreement.customerId) {
        const customer = await fetchCustomer(result.agreement.customerId);
        setCustomerProfile(customer.customer);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCustomer() {
    if (!form.customerId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this customer and all of their seasonal agreements? This cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      await deleteCustomer(form.customerId);
      navigate("/search");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="card">Loading agreement…</p>;
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{isNew ? "New Agreement" : "Edit Agreement"}</p>
          <h2>{isNew ? "Create seasonal rental agreement" : form.parentName || "Rental agreement"}</h2>
          <p className="muted">
            Built around your existing seasonal form so the workflow feels
            familiar to staff.
          </p>
        </div>

        <div className="header-actions">
          {!isNew && agreementId ? (
            <NavLink
              className="button secondary"
              to={`/rentals/new?fromAgreement=${agreementId}&seasonYear=${getNextSeasonYear(
                form.seasonYear
              )}`}
            >
              Start {getNextSeasonYear(form.seasonYear)} Renewal
            </NavLink>
          ) : null}
          {!isNew && agreementId ? (
            <NavLink className="button secondary" to={`/rentals/${agreementId}/print`}>
              Print View
            </NavLink>
          ) : null}
          {!isNew && form.customerId ? (
            <button
              className="button danger"
              type="button"
              onClick={() => void handleDeleteCustomer()}
            >
              {deleting ? "Deleting…" : "Delete Customer"}
            </button>
          ) : null}
        </div>
      </header>

      <form className="page-stack" onSubmit={handleSubmit}>
        {error ? <p className="card error">{error}</p> : null}
        {successMessage ? <p className="card success">{successMessage}</p> : null}
        {serialWarnings.length > 0 ? (
          <section className="card warning">
            <h3>Active serial number warning</h3>
            <p className="muted">
              These ski serial numbers are already assigned to another active
              agreement.
            </p>
            <ul className="warning-list">
              {serialWarnings.map((warning) => (
                <li key={`${warning.serialNumber}-${warning.conflictingAgreementId}`}>
                  {warning.serialNumber}: {warning.conflictingSkierName} under{" "}
                  {warning.conflictingParentName}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="card">
          <div className="section-heading">
            <div>
              <h3>Customer and agreement details</h3>
              <p className="muted">Top-level information from the seasonal rental form.</p>
            </div>
          </div>

          <div className="form-grid">
            <FormField label="Salesperson">
              <input
                value={form.salesperson}
                onChange={(event) => setField("salesperson", event.target.value)}
              />
            </FormField>
            <FormField label="Season Year">
              <input
                type="number"
                value={form.seasonYear}
                onChange={(event) => setField("seasonYear", Number(event.target.value))}
              />
            </FormField>
            <FormField label="Parent / Customer Name">
              <input
                required
                value={form.parentName}
                onChange={(event) => setField("parentName", event.target.value)}
              />
            </FormField>
            <FormField label="Agreement Date">
              <input
                type="date"
                value={form.agreementDate}
                onChange={(event) => setField("agreementDate", event.target.value)}
              />
            </FormField>
            <FormField label="Return Due Date">
              <input
                type="date"
                value={form.returnDueDate}
                onChange={(event) => setField("returnDueDate", event.target.value)}
              />
            </FormField>
            <FormField label="Address" wide>
              <input
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
              />
            </FormField>
            <FormField label="City">
              <input
                value={form.city}
                onChange={(event) => setField("city", event.target.value)}
              />
            </FormField>
            <FormField label="State">
              <input
                value={form.state}
                onChange={(event) => setField("state", event.target.value)}
              />
            </FormField>
            <FormField label="ZIP">
              <input
                value={form.zip}
                onChange={(event) => setField("zip", event.target.value)}
              />
            </FormField>
            <FormField label="Home Phone">
              <input
                value={form.homePhone}
                onChange={(event) => setField("homePhone", event.target.value)}
              />
            </FormField>
            <FormField label="Cell Phone">
              <input
                value={form.cellPhone}
                onChange={(event) => setField("cellPhone", event.target.value)}
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
              />
            </FormField>
            <FormField label="Status">
              <select
                value={form.status}
                onChange={(event) => setField("status", event.target.value as RentalStatus)}
              >
                <option value="active">Active</option>
                <option value="returned">Returned</option>
                <option value="closed">Closed</option>
              </select>
            </FormField>
            <FormField label="Equipment Value / Responsibility Amount">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.equipmentResponsibilityAmount || ""}
                onChange={(event) =>
                  setField(
                    "equipmentResponsibilityAmount",
                    event.target.value === "" ? 0 : Number(event.target.value)
                  )
                }
              />
            </FormField>
            <FormField label="Customer Signature">
              <button
                className="signature-trigger"
                type="button"
                onClick={() => setActiveSignatureField("customerSignaturePlaceholder")}
              >
                {isSignatureImage(form.customerSignaturePlaceholder) ? (
                  <img src={form.customerSignaturePlaceholder} alt="Customer signature" />
                ) : (
                  <span>
                    {form.customerSignaturePlaceholder || "Tap to Sign"}
                  </span>
                )}
              </button>
            </FormField>
            <FormField label="Employee Signature">
              <button
                className="signature-trigger"
                type="button"
                onClick={() => setActiveSignatureField("employeeSignaturePlaceholder")}
              >
                {isSignatureImage(form.employeeSignaturePlaceholder) ? (
                  <img src={form.employeeSignaturePlaceholder} alt="Employee signature" />
                ) : (
                  <span>
                    {form.employeeSignaturePlaceholder || "Tap to Sign"}
                  </span>
                )}
              </button>
            </FormField>
            <FormField label="Internal Staff Notes" wide>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => setField("notes", event.target.value)}
              />
            </FormField>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              required
              checked={form.customerAcceptance}
              onChange={(event) => setField("customerAcceptance", event.target.checked)}
            />
            <span>Customer accepted seasonal rental agreement terms.</span>
          </label>
        </section>

        {customerProfile && customerProfile.seasons.length > 0 ? (
          <section className="card">
            <div className="section-heading">
              <div>
                <h3>Customer yearly tracker</h3>
                <p className="muted">
                  See prior seasons and reopen last year quickly when building a
                  renewal.
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Agreement Date</th>
                    <th>Status</th>
                    <th>Skiers</th>
                    <th>Salesperson</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {customerProfile.seasons.map((season) => (
                    <tr key={season.agreementId}>
                      <td>{season.seasonYear}</td>
                      <td>{formatDate(season.agreementDate)}</td>
                      <td>
                        <span className={`status-pill ${season.status}`}>{season.status}</span>
                      </td>
                      <td>{season.skierNames.join(", ")}</td>
                      <td>{season.salesperson || "—"}</td>
                      <td>
                        <div className="table-actions">
                          <NavLink className="text-link" to={`/rentals/${season.agreementId}`}>
                            Open
                          </NavLink>
                          <NavLink
                            className="text-link"
                            to={`/rentals/new?fromAgreement=${season.agreementId}&seasonYear=${getNextSeasonYear(
                              season.seasonYear
                            )}`}
                          >
                            Renew
                          </NavLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="card">
          <div className="section-heading">
            <div>
              <h3>Skier equipment assignments</h3>
              <p className="muted">
                One customer can hold multiple skiers under a single agreement.
              </p>
            </div>

            <div className="button-group">
              <button className="button secondary" type="button" onClick={() => addSkier(1)}>
                Add Skier
              </button>
              <button className="button secondary" type="button" onClick={() => addSkier(3)}>
                Add 3 Skiers
              </button>
            </div>
          </div>

          <div className="skier-stack">
            {form.skiers.map((skier, index) => (
              <section className="skier-card" key={`skier-${index}`}>
                <div className="skier-header">
                  <h4>Skier {index + 1}</h4>
                  <button
                    className="text-button"
                    type="button"
                    disabled={form.skiers.length === 1}
                    onClick={() => removeSkier(index)}
                  >
                    Remove
                  </button>
                </div>

                <div className="form-grid">
                  <FormField label="Skier Name">
                    <input
                      value={skier.skierName}
                      onChange={(event) =>
                        setSkierField(index, "skierName", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Skier Type">
                    <select
                      value={skier.skierType}
                      onChange={(event) =>
                        setSkierField(
                          index,
                          "skierType",
                          event.target.value as SkierFormData["skierType"]
                        )
                      }
                    >
                      <option value="I">I</option>
                      <option value="II">II</option>
                      <option value="III">III</option>
                    </select>
                  </FormField>
                  <FormField label="Ski / Model">
                    <input
                      value={skier.skiModel}
                      onChange={(event) =>
                        setSkierField(index, "skiModel", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Ski Size">
                    <input
                      value={skier.skiSize}
                      onChange={(event) =>
                        setSkierField(index, "skiSize", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Ski Serial Number">
                    <input
                      value={skier.skiSerialNumber}
                      onChange={(event) =>
                        setSkierField(index, "skiSerialNumber", event.target.value.toUpperCase())
                      }
                    />
                  </FormField>
                  <FormField label="Ski B/O">
                    <input
                      value={skier.skiBO}
                      onChange={(event) => setSkierField(index, "skiBO", event.target.value)}
                    />
                  </FormField>
                  <FormField label="Pole Size">
                    <input
                      value={skier.poleSize}
                      onChange={(event) =>
                        setSkierField(index, "poleSize", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Pole B/O">
                    <input
                      value={skier.poleBO}
                      onChange={(event) => setSkierField(index, "poleBO", event.target.value)}
                    />
                  </FormField>
                  <FormField label="Boot">
                    <input
                      value={skier.bootModel}
                      onChange={(event) =>
                        setSkierField(index, "bootModel", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Boot Color">
                    <input
                      value={skier.bootColor}
                      onChange={(event) =>
                        setSkierField(index, "bootColor", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Boot Size">
                    <input
                      value={skier.bootSize}
                      onChange={(event) =>
                        setSkierField(index, "bootSize", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Boot B/O">
                    <input
                      value={skier.bootBO}
                      onChange={(event) => setSkierField(index, "bootBO", event.target.value)}
                    />
                  </FormField>
                </div>
              </section>
            ))}
          </div>
        </section>

        <div className="footer-actions">
          <button className="button primary" type="submit" disabled={!form.customerAcceptance || saving}>
            {saving ? "Saving…" : isNew ? "Create Agreement" : "Save Changes"}
          </button>
          {!isNew && agreementId ? (
            <NavLink className="button secondary" to={`/rentals/${agreementId}/print`}>
              Open Print-Friendly Version
            </NavLink>
          ) : null}
        </div>
      </form>

      {activeSignatureField ? (
        <div className="signature-modal" role="dialog" aria-modal="true">
          <div className="signature-panel">
            <div className="section-heading">
              <div>
                <h3>
                  {activeSignatureField === "customerSignaturePlaceholder"
                    ? "Customer Signature"
                    : "Employee Signature"}
                </h3>
              </div>
            </div>
            <canvas
              ref={signatureCanvasRef}
              className="signature-canvas"
              width={900}
              height={300}
              onPointerDown={startSignature}
              onPointerMove={drawSignature}
              onPointerUp={endSignature}
              onPointerCancel={endSignature}
              onPointerLeave={endSignature}
            />
            <div className="footer-actions">
              <button className="button secondary" type="button" onClick={clearSignature}>
                Clear
              </button>
              <div className="button-group">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setActiveSignatureField(null)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  type="button"
                  disabled={!signatureHasInk}
                  onClick={saveSignature}
                >
                  Use Signature
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PrintAgreementPage() {
  const params = useParams();
  const agreementId = Number(params.id);
  const [agreement, setAgreement] = useState<RentalAgreementRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAgreement(agreementId)
      .then((data) => setAgreement(data.agreement))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [agreementId]);

  if (loading) {
    return <p className="card">Loading print view…</p>;
  }

  if (error || !agreement) {
    return <p className="card error">{error || "Agreement not found."}</p>;
  }

  return (
    <div className="print-page">
      <div className="print-toolbar">
        <button className="button primary" onClick={() => window.print()}>
          Print Agreement
        </button>
        <NavLink className="button secondary" to={`/rentals/${agreement.id}`}>
          Back to Agreement
        </NavLink>
      </div>

      <article className="print-sheet">
        <header className="print-header">
          <div>
            <p className="eyebrow">Seasonal Rental Agreement</p>
            <h2>High Adventure Ski Shop</h2>
          </div>
          <div className={`status-pill ${agreement.status}`}>{agreement.status}</div>
        </header>

        <section className="print-grid">
          <PrintItem label="Season Year" value={String(agreement.seasonYear)} />
          <PrintItem label="Salesperson" value={agreement.salesperson} />
          <PrintItem label="Agreement Date" value={formatDate(agreement.agreementDate)} />
          <PrintItem label="Return Due Date" value={formatDate(agreement.returnDueDate)} />
          <PrintItem label="Parent / Customer" value={agreement.parentName} />
          <PrintItem label="Address" value={agreement.address} />
          <PrintItem
            label="City / State / ZIP"
            value={`${agreement.city}, ${agreement.state} ${agreement.zip}`}
          />
          <PrintItem label="Home Phone" value={agreement.homePhone} />
          <PrintItem label="Cell Phone" value={agreement.cellPhone} />
          <PrintItem label="Email" value={agreement.email} />
          <PrintItem
            label="Responsibility Amount"
            value={`$${agreement.equipmentResponsibilityAmount.toFixed(2)}`}
          />
          <PrintItem
            label="Customer Acceptance"
            value={agreement.customerAcceptance ? "Accepted" : "Pending"}
          />
        </section>

        <section className="print-section">
          <h3>Assigned Equipment by Skier</h3>
          <table className="print-table">
            <thead>
              <tr>
                <th>Skier</th>
                <th>Type</th>
                <th>Ski / Model</th>
                <th>Ski Size</th>
                <th>Serial</th>
                <th>Poles</th>
                <th>Boot</th>
                <th>Boot Size</th>
              </tr>
            </thead>
            <tbody>
              {agreement.skiers.map((skier, index) => (
                <tr key={`${skier.skierName}-${index}`}>
                  <td>{skier.skierName}</td>
                  <td>{skier.skierType}</td>
                  <td>{skier.skiModel}</td>
                  <td>{skier.skiSize}</td>
                  <td>{skier.skiSerialNumber}</td>
                  <td>{skier.poleIncluded ? `${skier.poleSize} (${skier.poleBO})` : "No"}</td>
                  <td>{`${skier.bootModel} ${skier.bootColor}`.trim()}</td>
                  <td>{skier.bootSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h3>Internal Notes</h3>
          <p>{agreement.notes || "No internal notes recorded."}</p>
        </section>

        <section className="signature-grid">
          <PrintSignatureItem label="Customer Signature" value={agreement.customerSignaturePlaceholder} />
          <PrintSignatureItem label="Employee Signature" value={agreement.employeeSignaturePlaceholder} />
        </section>
      </article>
    </div>
  );
}

function AgreementTable({
  agreements,
  emptyMessage = "No agreements found.",
  returningAgreementId = null,
  onReturnAgreement
}: {
  agreements: AgreementSummary[];
  emptyMessage?: string;
  returningAgreementId?: number | null;
  onReturnAgreement?: (agreement: AgreementSummary) => void;
}) {
  if (agreements.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Season</th>
            <th>Skiers</th>
            <th>Contact</th>
            <th>Salesperson</th>
            <th>Status</th>
            <th>Due Back</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {agreements.map((agreement) => (
            <tr key={agreement.id}>
              <td>
                <strong>{agreement.parentName}</strong>
                <div className="muted">{formatDate(agreement.agreementDate)}</div>
              </td>
              <td>{agreement.seasonYear}</td>
              <td>
                <div>{agreement.skierCount} skier(s)</div>
                <div className="muted">{agreement.skierNames.join(", ")}</div>
              </td>
              <td>
                <div>{agreement.cellPhone || agreement.homePhone || "—"}</div>
                <div className="muted">{agreement.email || "—"}</div>
              </td>
              <td>{agreement.salesperson || "—"}</td>
              <td>
                <span className={`status-pill ${agreement.status}`}>{agreement.status}</span>
              </td>
              <td>{formatDate(agreement.returnDueDate)}</td>
              <td>
                <div className="table-actions">
                  <NavLink className="text-link" to={`/rentals/${agreement.id}`}>
                    Open
                  </NavLink>
                  {agreement.status === "active" && onReturnAgreement ? (
                    <button
                      className="text-button"
                      type="button"
                      disabled={returningAgreementId === agreement.id}
                      onClick={() => onReturnAgreement(agreement)}
                    >
                      {returningAgreementId === agreement.id ? "Returning..." : "Return"}
                    </button>
                  ) : (
                    <NavLink
                      className="text-link"
                      to={`/rentals/new?fromAgreement=${agreement.id}&seasonYear=${getNextSeasonYear(
                        agreement.seasonYear
                      )}`}
                    >
                      Renew
                    </NavLink>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="card stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function FormField({
  label,
  children,
  wide = false
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function PrintItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="print-item">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function PrintSignatureItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="print-item">
      <span>{label}</span>
      {isSignatureImage(value) ? (
        <img className="print-signature" src={value} alt={label} />
      ) : (
        <strong>{value || "—"}</strong>
      )}
    </div>
  );
}

export default App;
