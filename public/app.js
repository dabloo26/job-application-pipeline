const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");
const tableEl = document.getElementById("dataTable");
const viewDataLink = document.getElementById("viewDataLink");
const titlesInput = document.getElementById("titlesInput");
const countriesInput = document.getElementById("countriesInput");
const companyIncludeInput = document.getElementById("companyIncludeInput");
const companyExcludeInput = document.getElementById("companyExcludeInput");
const maxResultsInput = document.getElementById("maxResultsInput");
const perPageInput = document.getElementById("perPageInput");
const maxPagesInput = document.getElementById("maxPagesInput");
const delayMsInput = document.getElementById("delayMsInput");
const maxApolloMatchesInput = document.getElementById("maxApolloMatchesInput");

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent = `[${ts}] ${msg}\n\n` + logEl.textContent;
}

async function callApi(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

function renderStatus(s) {
  statusEl.innerHTML = `
    <div><b>Sent:</b> ${s.sentCount ?? "-"} | <b>Pending:</b> ${s.pendingCount ?? "-"}</div>
    <div><b>Master file:</b> ${s.masterPath ?? "-"}</div>
  `;
}

function setFiltersForm(filters) {
  titlesInput.value = (filters.titles || []).join(", ");
  countriesInput.value = (filters.countries || []).join(", ");
  companyIncludeInput.value = (filters.companyIncludeKeywords || []).join(", ");
  companyExcludeInput.value = (filters.companyExcludeKeywords || []).join(", ");
  maxResultsInput.value = filters.maxResults ?? 120;
  perPageInput.value = filters.perPage ?? 50;
  maxPagesInput.value = filters.maxPages ?? 6;
  delayMsInput.value = filters.delayMs ?? 1500;
  maxApolloMatchesInput.value = filters.maxApolloMatches ?? 120;
}

function getFiltersForm() {
  return {
    titles: titlesInput.value,
    countries: countriesInput.value,
    companyIncludeKeywords: companyIncludeInput.value,
    companyExcludeKeywords: companyExcludeInput.value,
    maxResults: Number(maxResultsInput.value || 120),
    perPage: Number(perPageInput.value || 50),
    maxPages: Number(maxPagesInput.value || 6),
    delayMs: Number(delayMsInput.value || 1500),
    maxApolloMatches: Number(maxApolloMatchesInput.value || 120)
  };
}

function renderTable(rows) {
  if (!rows || !rows.length) {
    tableEl.innerHTML = "<tr><td>No data</td></tr>";
    return;
  }
  const headers = Object.keys(rows[0]);
  const thead = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const tbody = rows
    .map(
      (r) =>
        `<tr>${headers
          .map((h) => `<td>${String(r[h] ?? "").replaceAll("<", "&lt;")}</td>`)
          .join("")}</tr>`
    )
    .join("");
  tableEl.innerHTML = thead + tbody;
}

async function refreshStatus() {
  try {
    const s = await callApi("/api/status");
    renderStatus(s);
    if (s.filters) setFiltersForm(s.filters);
    log("Status refreshed.");
  } catch (e) {
    log(`Status error: ${e.message}`);
  }
}

async function loadData() {
  try {
    const d = await callApi("/api/fetched-data");
    renderTable(d.rows || []);
    log(`Loaded fetched data from ${d.path}`);
  } catch (e) {
    log(`Data load error: ${e.message}`);
  }
}

document.getElementById("refreshStatusBtn").addEventListener("click", refreshStatus);
document.getElementById("saveFiltersBtn").addEventListener("click", async () => {
  try {
    const next = getFiltersForm();
    const r = await callApi("/api/filters", "POST", next);
    setFiltersForm(r.filters || {});
    log("Filters saved.");
  } catch (e) {
    log(`Saving filters failed: ${e.message}`);
  }
});
document.getElementById("fetchBtn").addEventListener("click", async () => {
  log("Running email fetch...");
  try {
    const r = await callApi("/api/fetch-emails", "POST");
    log(
      `Fetch complete. exit=${r.code}, kept=${r.filteredCount ?? "-"} of ${r.unfilteredCount ?? "-"}\n${(r.stdout || "").slice(0, 5000)}\n${(r.stderr || "").slice(0, 2000)}`
    );
    await refreshStatus();
    await loadData();
  } catch (e) {
    log(`Fetch failed: ${e.message}`);
  }
});

document.getElementById("sendBtn").addEventListener("click", async () => {
  if (!confirm("Send outreach emails now?")) return;
  log("Sending outreach...");
  try {
    const r = await callApi("/api/send-emails", "POST");
    log(`Send complete. exit=${r.code}, phrase=${r.confirmationUsed}\n${(r.stdout || "").slice(0, 5000)}\n${(r.stderr || "").slice(0, 2000)}`);
    await refreshStatus();
  } catch (e) {
    log(`Send failed: ${e.message}`);
  }
});

document.getElementById("syncBtn").addEventListener("click", async () => {
  log("Running job tracker sync...");
  try {
    const r = await callApi("/api/job-tracker-sync", "POST");
    log(`Sync complete. exit=${r.code}\n${(r.stdout || "").slice(0, 6000)}\n${(r.stderr || "").slice(0, 2000)}`);
  } catch (e) {
    log(`Sync failed: ${e.message}`);
  }
});

viewDataLink.addEventListener("click", async (e) => {
  e.preventDefault();
  await loadData();
});

refreshStatus();
loadData();
