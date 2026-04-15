import express from "express";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";
import fs from "node:fs";

const app = express();
app.use(express.json({ limit: "1mb" }));

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvLocal();

const PORT = Number(process.env.PORT || 3100);
const ROOT = path.resolve("/Users/anand/Desktop");
const LEADGEN_DIR = process.env.LEADGEN_DIR || path.join(ROOT, "h1b-email-leadgen");
const PORTFOLIO_DIR = process.env.PORTFOLIO_DIR || path.join(ROOT, "Portfolio");
const JOB_TRACKER_DIR = process.env.JOB_TRACKER_DIR || path.join(ROOT, "job-tracker");
const OUTREACH_DATA = path.join(PORTFOLIO_DIR, "scripts", "outreach", "data", "technical-recruiter-combined.json");
const MASTER_CSV = path.join(LEADGEN_DIR, "output", "combined-master.csv");
const FILTERS_PATH = path.join(process.cwd(), "filters.json");
const COMPOSE_PATH = path.join(process.cwd(), "outreach-compose.json");
const COMPOSE_TEMPLATE_PATH = path.join(process.cwd(), ".runtime-outreach-template.txt");

const DEFAULT_FILTERS = {
  titles: [
    "technical recruiter",
    "engineering recruiter",
    "software recruiter",
    "technical sourcer",
    "talent acquisition partner"
  ],
  countries: ["United States"],
  companyIncludeKeywords: [],
  companyExcludeKeywords: [],
  maxResults: 120,
  perPage: 50,
  maxPages: 6,
  delayMs: 1500,
  maxApolloMatches: 120
};

const DEFAULT_COMPOSE = {
  subject: process.env.OUTREACH_SUBJECT || "Quick note - engineering opportunities (UMD)",
  bodyTemplate: "",
  coverLetterPath: process.env.OUTREACH_COVER_LETTER_PATH || "",
  extraAttachments: []
};

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

async function readCsvRows(csvPath, limit = 300) {
  const text = await readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  const out = [];
  for (let i = 1; i < lines.length && out.length < limit; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    out.push(row);
  }
  return out;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

async function readFilters() {
  try {
    const text = await readFile(FILTERS_PATH, "utf8");
    const parsed = JSON.parse(text);
    return { ...DEFAULT_FILTERS, ...parsed };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

async function saveFilters(filters) {
  const next = { ...DEFAULT_FILTERS, ...filters };
  await writeFile(FILTERS_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

async function readCompose() {
  try {
    const text = await readFile(COMPOSE_PATH, "utf8");
    const parsed = JSON.parse(text);
    return { ...DEFAULT_COMPOSE, ...parsed };
  } catch {
    return { ...DEFAULT_COMPOSE };
  }
}

async function saveCompose(compose) {
  const next = {
    ...DEFAULT_COMPOSE,
    ...compose,
    subject: String(compose.subject || DEFAULT_COMPOSE.subject),
    bodyTemplate: String(compose.bodyTemplate || ""),
    coverLetterPath: String(compose.coverLetterPath || "").trim(),
    extraAttachments: parseCsvList(compose.extraAttachments)
  };
  await writeFile(COMPOSE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function parseCsvList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function applyCompanyFilters(rows, filters) {
  const includes = parseCsvList(filters.companyIncludeKeywords).map(normalizeText);
  const excludes = parseCsvList(filters.companyExcludeKeywords).map(normalizeText);
  if (!includes.length && !excludes.length) return rows;
  return rows.filter((r) => {
    const blob = normalizeText([r.company, r.companyDomain].filter(Boolean).join(" "));
    if (includes.length && !includes.some((k) => blob.includes(k))) return false;
    if (excludes.length && excludes.some((k) => blob.includes(k))) return false;
    return true;
  });
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function computeSendPhrase() {
  const text = await readFile(OUTREACH_DATA, "utf8");
  const rows = JSON.parse(text);
  const batchSize = Number(process.env.OUTREACH_BATCH_SIZE || 20);
  const pending = rows
    .filter((r) => (r.outreachStatus || "pending") === "pending")
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, batchSize);
  return `SEND ${pending.length} EMAILS`;
}

app.use(express.static(path.join(process.cwd(), "public")));

app.get("/api/status", async (_req, res) => {
  try {
    const outreach = JSON.parse(await readFile(OUTREACH_DATA, "utf8"));
    const pending = outreach.filter((r) => (r.outreachStatus || "pending") !== "sent");
    const sent = outreach.filter((r) => (r.outreachStatus || "pending") === "sent");
    const rows = await readCsvRows(MASTER_CSV, 10).catch(() => []);
    const filters = await readFilters();
    res.json({
      ok: true,
      sentCount: sent.length,
      pendingCount: pending.length,
      masterPreviewCount: rows.length,
      masterPath: MASTER_CSV,
      filters
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/filters", async (_req, res) => {
  try {
    const filters = await readFilters();
    res.json({ ok: true, filters });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/outreach-compose", async (_req, res) => {
  try {
    const compose = await readCompose();
    if (!compose.bodyTemplate) {
      const defaultTemplatePath = path.join(
        PORTFOLIO_DIR,
        "scripts",
        "outreach",
        "templates",
        "body.txt"
      );
      compose.bodyTemplate = await readFile(defaultTemplatePath, "utf8").catch(() => "");
    }
    res.json({ ok: true, compose });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/outreach-compose", async (req, res) => {
  try {
    const body = req.body || {};
    const compose = await saveCompose(body);
    res.json({ ok: true, compose });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/filters", async (req, res) => {
  try {
    const body = req.body || {};
    const next = {
      ...body,
      titles: parseCsvList(body.titles),
      countries: parseCsvList(body.countries),
      companyIncludeKeywords: parseCsvList(body.companyIncludeKeywords),
      companyExcludeKeywords: parseCsvList(body.companyExcludeKeywords),
      maxResults: Number(body.maxResults || DEFAULT_FILTERS.maxResults),
      perPage: Number(body.perPage || DEFAULT_FILTERS.perPage),
      maxPages: Number(body.maxPages || DEFAULT_FILTERS.maxPages),
      delayMs: Number(body.delayMs || DEFAULT_FILTERS.delayMs),
      maxApolloMatches: Number(body.maxApolloMatches || DEFAULT_FILTERS.maxApolloMatches)
    };
    const filters = await saveFilters(next);
    res.json({ ok: true, filters });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/fetch-emails", async (_req, res) => {
  const filters = await readFilters();
  const env = {
    ...process.env,
    OUTPUT_BASENAME: `tech-recruiters-us-broad-${new Date().toISOString().slice(0, 10)}`,
    APOLLO_TITLE_FILTERS: parseCsvList(filters.titles).join(","),
    APOLLO_PERSON_LOCATIONS: parseCsvList(filters.countries).join(","),
    LEADS_TARGET: String(filters.maxResults),
    APOLLO_SEARCH_PER_PAGE: String(filters.perPage),
    APOLLO_SEARCH_PAGES: String(filters.maxPages),
    APOLLO_DELAY_MS: String(filters.delayMs),
    APOLLO_MAX_MATCHES_GLOBAL: String(filters.maxApolloMatches)
  };
  const result = await runCommand("npm", ["run", "leads:apollo-broad"], {
    cwd: LEADGEN_DIR,
    env
  });
  let filteredCount = 0;
  let unfilteredCount = 0;
  if (result.code === 0) {
    try {
      const outName = env.OUTPUT_BASENAME;
      const jsonPath = path.join(LEADGEN_DIR, "output", `${outName}.json`);
      const csvPath = path.join(LEADGEN_DIR, "output", `${outName}.csv`);
      const rows = JSON.parse(await readFile(jsonPath, "utf8"));
      unfilteredCount = rows.length;
      const filteredRows = applyCompanyFilters(rows, filters);
      filteredCount = filteredRows.length;
      await writeFile(jsonPath, `${JSON.stringify(filteredRows, null, 2)}\n`, "utf8");
      const csvRows = filteredRows;
      if (csvRows.length) {
        const headers = Object.keys(csvRows[0]);
        const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
        const body = csvRows.map((r) => headers.map((h) => esc(r[h])).join(","));
        await writeFile(csvPath, `${[headers.join(","), ...body].join("\n")}\n`, "utf8");
      } else {
        await writeFile(csvPath, "", "utf8");
      }
    } catch {
      // Keep command success even if post-filtering fails.
    }
  }
  res.json({ ok: result.code === 0, ...result, filteredCount, unfilteredCount, appliedFilters: filters });
});

app.post("/api/send-emails", async (_req, res) => {
  try {
    const compose = await readCompose();
    if ((compose.bodyTemplate || "").trim()) {
      await writeFile(COMPOSE_TEMPLATE_PATH, compose.bodyTemplate, "utf8");
    }
    const phrase = await computeSendPhrase();
    const extraEnv = {
      OUTREACH_SUBJECT: compose.subject || DEFAULT_COMPOSE.subject,
      OUTREACH_COVER_LETTER_PATH: compose.coverLetterPath || "",
      OUTREACH_EXTRA_ATTACHMENTS: parseCsvList(compose.extraAttachments).join(",")
    };
    if ((compose.bodyTemplate || "").trim()) {
      extraEnv.OUTREACH_TEMPLATE_PATH = COMPOSE_TEMPLATE_PATH;
    }
    const child = spawn("npm", ["run", "outreach:send", "--", "--send", "--i-approve-message"], {
      cwd: PORTFOLIO_DIR,
      env: { ...process.env, ...extraEnv }
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      if (s.includes("Type exactly:")) {
        child.stdin.write(`${phrase}\n`);
      }
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      res.json({
        ok: (code ?? 1) === 0,
        code,
        stdout,
        stderr,
        confirmationUsed: phrase,
        composeApplied: extraEnv
      });
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/job-tracker-sync", async (_req, res) => {
  const cmd =
    "source .venv/bin/activate && python sync.py --source gmail --out output/applications.xlsx --ics output/reminders.ics";
  const result = await runCommand("bash", ["-lc", cmd], {
    cwd: JOB_TRACKER_DIR,
    env: process.env
  });
  res.json({ ok: result.code === 0, ...result });
});

app.get("/api/fetched-data", async (_req, res) => {
  try {
    const rows = await readCsvRows(MASTER_CSV, 500);
    res.json({ ok: true, path: MASTER_CSV, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`Job Hunt Control Center running: http://localhost:${PORT}`);
});
