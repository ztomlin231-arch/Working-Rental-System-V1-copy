import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRenewalTemplate,
  deleteCustomer,
  exportRows,
  getAgreement,
  getCustomerProfile,
  getDashboardData,
  getEquipmentBySerial,
  listQueueItems,
  initializeDatabase,
  saveQueueItem,
  listAgreements,
  saveAgreement
} from "./db.js";
import type { IntakeQueuePayload, RentalAgreementPayload } from "../shared/types.js";

initializeDatabase();

const app = express();
const port = Number(process.env.PORT) || 3001;
const host = "0.0.0.0";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/dashboard", (_req, res) => {
  const seasonYear =
    typeof _req.query.seasonYear === "string" ? Number(_req.query.seasonYear) : undefined;
  res.json(getDashboardData(seasonYear));
});

app.get("/api/rentals", (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : "";
  const filters = {
    name: typeof req.query.name === "string" ? req.query.name : "",
    phone: typeof req.query.phone === "string" ? req.query.phone : "",
    email: typeof req.query.email === "string" ? req.query.email : "",
    seasonYear:
      typeof req.query.seasonYear === "string" ? Number(req.query.seasonYear) : undefined
  };
  res.json({ agreements: listAgreements(search, filters) });
});

app.get("/api/queue", (req, res) => {
  const seasonYear =
    typeof req.query.seasonYear === "string" ? Number(req.query.seasonYear) : undefined;
  const includeFinished = req.query.includeFinished === "true";
  res.json({ queueItems: listQueueItems(seasonYear, includeFinished) });
});

app.post("/api/queue", (req, res) => {
  try {
    const payload = req.body as IntakeQueuePayload;
    const queueItem = saveQueueItem(payload);
    res.status(201).json({ queueItem });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.put("/api/queue/:id", (req, res) => {
  try {
    const payload = req.body as IntakeQueuePayload;
    const queueItem = saveQueueItem(payload, Number(req.params.id));
    res.json({ queueItem });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get("/api/rentals/:id", (req, res) => {
  try {
    const agreement = getAgreement(Number(req.params.id));
    res.json({ agreement });
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.get("/api/rentals/:id/renewal-template", (req, res) => {
  try {
    const seasonYear =
      typeof req.query.seasonYear === "string" ? Number(req.query.seasonYear) : undefined;
    const template = buildRenewalTemplate(Number(req.params.id), seasonYear);
    res.json({ template });
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.post("/api/rentals", (req, res) => {
  try {
    const payload = req.body as RentalAgreementPayload;
    const result = saveAgreement(payload);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.put("/api/rentals/:id", (req, res) => {
  try {
    const payload = req.body as RentalAgreementPayload;
    const result = saveAgreement(payload, Number(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get("/api/customers/:id", (req, res) => {
  try {
    const customer = getCustomerProfile(Number(req.params.id));
    res.json({ customer });
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.delete("/api/customers/:id", (req, res) => {
  try {
    deleteCustomer(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.get("/api/equipment/search", (req, res) => {
  const serial = typeof req.query.serial === "string" ? req.query.serial : "";
  if (!serial.trim()) {
    return res.status(400).json({ message: "Serial number is required." });
  }

  res.json(getEquipmentBySerial(serial));
});

app.get("/api/export/rentals.csv", (_req, res) => {
  const rows = exportRows();
  const headers = [
    "agreementId",
    "parentName",
    "address",
    "city",
    "state",
    "zip",
    "homePhone",
    "cellPhone",
    "email",
    "salesperson",
    "seasonYear",
    "agreementDate",
    "returnDueDate",
    "status",
    "equipmentResponsibilityAmount",
    "notes",
    "skierName",
    "skierType",
    "skiModel",
    "skiSize",
    "skiSerialNumber",
    "skiBO",
    "poleIncluded",
    "poleSize",
    "poleBO",
    "bootModel",
    "bootColor",
    "bootSize",
    "bootBO"
  ];

  const escapeCsv = (value: unknown) => {
    const stringValue = value == null ? "" : String(value);
    return `"${stringValue.replaceAll("\"", "\"\"")}"`;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsv((row as Record<string, unknown>)[header])).join(",")
    )
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="high-adventure-rentals-export.csv"'
  );
  res.send(csv);
});

function resolveClientDistPath() {
  const productionDistPath = path.resolve(__dirname, "../../dist");
  const sourceDistPath = path.resolve(__dirname, "../dist");

  if (fs.existsSync(path.join(productionDistPath, "index.html"))) {
    return productionDistPath;
  }

  return sourceDistPath;
}

const clientDistPath = resolveClientDistPath();
const clientIndexPath = path.join(clientDistPath, "index.html");

if (fs.existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(clientIndexPath);
  });
}

app.listen(port, host, () => {
  console.log(`High Adventure Rentals running at http://${host}:${port}`);
});
