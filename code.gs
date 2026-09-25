// ============================================================
// Q3 FY27 ROADMAP — Apps Script Web App
// ============================================================

const SHEET_ID = "1pWQAEoPgnSDnmYcY2fy4Tk5JExck7njBCqKHZyGaRuQ";
const SHEET_NAME = "consolidated_roadmap";
const JIRA_BASE = "https://exotel.atlassian.net";

// Custom field ID on Jira that holds the Aha! idea URL
const AHA_FIELD = "customfield_13184";

const COL_MAP = {
  title: "title",
  pod: "pod",
  theme: "theme",
  status: "status",
  priority: "priority",
  spoc: "spoc",
  jira_key: "jiraKey",
  idea_key: "ideaKey",
  summary: "summary",
  target_date: "targetDate",
  is_public: "isPublic",
};

// ── ENTRY POINT ───────────────────────────────────────────────
function doGet(e) {
  // Always clear cache so every request gets fresh sheet data
  try {
    CacheService.getScriptCache().remove("roadmap_v5");
  } catch (e) {}

  // ?page=data → return JSON for the in-page reload button
  if (e && e.parameter && e.parameter.page === "data") {
    try {
      var fresh = getRoadmapData();
      return ContentService.createTextOutput(JSON.stringify(fresh)).setMimeType(
        ContentService.MimeType.JSON
      );
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ items: [], meta: {}, error: err.message })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  var roadmapJSON = '{"items":[],"meta":{},"error":null}';
  try {
    var data = getRoadmapData();
    roadmapJSON = JSON.stringify(data);
  } catch (err) {
    roadmapJSON = JSON.stringify({ items: [], meta: {}, error: err.message });
  }
  var tmpl = HtmlService.createTemplateFromFile("index");
  tmpl.roadmapJSON = roadmapJSON;
  return tmpl
    .evaluate()
    .setTitle("Q3 FY27 Roadmap")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Called by google.script.run from the browser for in-page refresh
function getLatestData() {
  try {
    CacheService.getScriptCache().remove("roadmap_v5");
  } catch (e) {}
  return JSON.stringify(getRoadmapData());
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── CACHE + DATA ──────────────────────────────────────────────
function getRoadmapData() {
  var cache = CacheService.getScriptCache();
  var KEY = "roadmap_v5";
  var hit = cache.get(KEY);
  if (hit) {
    try {
      return JSON.parse(hit);
    } catch (e) {}
  }
  var data = fetchFromSheet();
  try {
    cache.put(KEY, JSON.stringify(data), 300);
  } catch (e) {}
  return data;
}

function fetchFromSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Tab "' + SHEET_NAME + '" not found.');

  var raw = sheet.getDataRange().getValues();
  if (raw.length < 2) return { items: [], meta: buildMeta([]) };

  var headers = raw[0].map(function (h) {
    return String(h).trim().toLowerCase().replace(/\s+/g, "_");
  });
  var idx = {};
  headers.forEach(function (h, i) {
    if (COL_MAP[h]) idx[COL_MAP[h]] = i;
  });

  // Collect all unique idea_keys (supports multiple per cell, comma/semicolon separated)
  var ideaKeys = [];
  for (var r = 1; r < raw.length; r++) {
    var row = raw[r];
    if (
      row.every(function (c) {
        return c === "" || c === null;
      })
    )
      continue;
    var rawIk =
      idx["ideaKey"] !== undefined
        ? String(row[idx["ideaKey"]] || "").trim()
        : "";
    if (rawIk) {
      rawIk.split(/[,;]/).forEach(function (k) {
        k = k.trim();
        if (k && ideaKeys.indexOf(k) === -1) ideaKeys.push(k);
      });
    }
  }

  // Batch fetch Aha! URLs from Jira for all idea keys
  var ahaUrlMap = fetchAhaUrls(ideaKeys);

  var items = [];
  for (var r = 1; r < raw.length; r++) {
    var row = raw[r];
    if (
      row.every(function (c) {
        return c === "" || c === null;
      })
    )
      continue;
    var d = {};
    Object.keys(idx).forEach(function (field) {
      d[field] =
        row[idx[field]] !== undefined ? String(row[idx[field]]).trim() : "";
    });
    d.id = r;
    d.isPublic = ["true", "yes", "1"].includes(
      (d.isPublic || "false").toLowerCase()
    );

    // Split jira_key and idea_key on comma or semicolon, trim whitespace
    d.jiraKeys = d.jiraKey
      ? d.jiraKey
          .split(/[,;]/)
          .map(function (k) {
            return k.trim();
          })
          .filter(Boolean)
      : [];
    d.ideaKeys = d.ideaKey
      ? d.ideaKey
          .split(/[,;]/)
          .map(function (k) {
            return k.trim();
          })
          .filter(Boolean)
      : [];

    // Build URL arrays
    d.jiraUrls = d.jiraKeys.map(function (k) {
      return JIRA_BASE + "/browse/" + k;
    });
    d.ideaJiraUrls = d.ideaKeys.map(function (k) {
      return JIRA_BASE + "/browse/" + k;
    });
    d.ahaUrls = d.ideaKeys.map(function (k) {
      return ahaUrlMap[k] || "";
    });

    // Keep single-value fields for backward compat
    d.jiraUrl = d.jiraUrls[0] || "";
    d.ideaJiraUrl = d.ideaJiraUrls[0] || "";
    d.ahaUrl = d.ahaUrls[0] || "";

    // Status + priority mapping
    d.status = mapStatus(d.status);
    d.priority = mapPriority(d.priority);
    d.targetMonth = parseTargetMonth(d.targetDate);
    if (d.isPublic && d.title) items.push(d);
  }

  return { items: items, meta: buildMeta(items) };
}

// ── AHA URL FETCH ─────────────────────────────────────────────
// Fetches customfield_13184 from Jira for each idea key.
// Uses batch requests to avoid N+1 — fetches one at a time but
// only for rows that actually have an idea_key.
function fetchAhaUrls(ideaKeys) {
  var result = {};
  if (!ideaKeys.length) return result;

  var props = PropertiesService.getScriptProperties();
  var email = props.getProperty("JIRA_EMAIL");
  var token = props.getProperty("JIRA_API_TOKEN");

  if (!email || !token) {
    Logger.log(
      "JIRA_EMAIL or JIRA_API_TOKEN not set in Script Properties. Skipping Aha! URL fetch."
    );
    return result;
  }

  var auth = "Basic " + Utilities.base64Encode(email + ":" + token);
  var fields = "summary," + AHA_FIELD;

  // Batch via JQL to minimise API calls: one request for all idea keys
  // Jira allows up to ~100 keys in a single search
  var chunks = chunkArray(ideaKeys, 50);
  chunks.forEach(function (chunk) {
    var jql = "key in (" + chunk.join(",") + ")";
    var url =
      JIRA_BASE +
      "/rest/api/3/search/jql?jql=" +
      encodeURIComponent(jql) +
      "&fields=" +
      encodeURIComponent(fields) +
      "&maxResults=50";
    try {
      var resp = UrlFetchApp.fetch(url, {
        method: "get",
        headers: { Authorization: auth, Accept: "application/json" },
        muteHttpExceptions: true,
      });
      if (resp.getResponseCode() !== 200) {
        Logger.log(
          "Jira search failed for chunk: " +
            resp.getResponseCode() +
            " " +
            resp.getContentText()
        );
        return;
      }
      var data = JSON.parse(resp.getContentText());
      (data.issues || []).forEach(function (issue) {
        var key = issue.key;
        var fields = issue.fields || {};
        var ahaVal = fields[AHA_FIELD];
        // customfield_13184 may be a string URL or an object with a url property
        var ahaUrl = "";
        if (typeof ahaVal === "string") {
          ahaUrl = ahaVal;
        } else if (ahaVal && typeof ahaVal === "object") {
          ahaUrl = ahaVal.url || ahaVal.value || "";
        }
        if (ahaUrl) result[key] = ahaUrl;
      });
    } catch (e) {
      Logger.log("Error fetching Aha! URLs: " + e.message);
    }
  });

  return result;
}

function chunkArray(arr, size) {
  var chunks = [];
  for (var i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── HELPERS ───────────────────────────────────────────────────

var STATUS_MAP = {
  planned: "Planned",
  "in progress": "In Progress",
  "on hold": "On Hold",
  "under code review": "In Progress",
  "under po & ux review": "In Progress",
  "under po &amp; ux review": "In Progress",
  "to do": "To Do",
  "under review": "Under Review",
  "under qa": "In Progress",
  done: "Done",
  backlog: "To Do",
  "in-progress": "In Progress",
  "in test": "In Progress",
  "won't do": "Won't do",
  "wont do": "Won't do",
  committed: "Committed",
  tbd: "TBD",
  experiment: "Experiment",
  deferred: "Deferred",
  "": "TBD",
};

function mapStatus(raw) {
  if (!raw || raw.trim() === "") return "TBD";
  var key = raw.trim().toLowerCase();
  if (STATUS_MAP.hasOwnProperty(key)) return STATUS_MAP[key];
  return raw.trim(); // unknown status — pass through as-is
}

var PRIORITY_MAP = {
  highest: "P0",
  urgent: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
  // already normalised — pass through
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
  p4: "P4",
};

function mapPriority(raw) {
  if (!raw || raw.trim() === "") return "";
  var key = raw.trim().toLowerCase();
  if (PRIORITY_MAP.hasOwnProperty(key)) return PRIORITY_MAP[key];
  return raw.trim(); // unknown — pass through
}

function parseTargetMonth(dateStr) {
  if (!dateStr) return -1;
  try {
    var m = new Date(dateStr).getMonth(); // Oct=9,Nov=10,Dec=11
    if (m === 9) return 0;
    if (m === 10) return 1;
    if (m === 11) return 2;
    return -1;
  } catch (e) {
    return -1;
  }
}

function buildMeta(items) {
  function uniq(f) {
    var seen = {},
      out = [];
    items.forEach(function (i) {
      if (i[f] && !seen[i[f]]) {
        seen[i[f]] = 1;
        out.push(i[f]);
      }
    });
    return out.sort();
  }
  return { pods: uniq("pod"), statuses: uniq("status"), total: items.length };
}

// ── ADMIN HELPERS ─────────────────────────────────────────────
function clearCache() {
  CacheService.getScriptCache().remove("roadmap_v5");
  Logger.log("Cache cleared.");
}

// Test sheet connection
function testFetch() {
  try {
    var data = fetchFromSheet();
    Logger.log("Items: " + data.items.length);
    if (data.items[0]) Logger.log("First: " + JSON.stringify(data.items[0]));
  } catch (err) {
    Logger.log("ERROR: " + err.message);
  }
}

// Test Aha! URL lookup for a single idea key
function testAhaLookup() {
  var testKey = "IDEA-101"; // ← change to a real key in your sheet
  var urls = fetchAhaUrls([testKey]);
  Logger.log("Aha! URL for " + testKey + ": " + (urls[testKey] || "NOT FOUND"));
  Logger.log("Full result: " + JSON.stringify(urls));
}

// Test credentials are set correctly
function testCredentials() {
  var props = PropertiesService.getScriptProperties();
  Logger.log("Email set: " + !!props.getProperty("JIRA_EMAIL"));
  Logger.log("Token set: " + !!props.getProperty("JIRA_API_TOKEN"));
}

// Debug: dumps ALL fields for one Jira issue so you can inspect customfield_13184
function debugJiraIssue() {
  var testKey = "IDEA-601"; // ← change to a real idea key

  var props = PropertiesService.getScriptProperties();
  var email = props.getProperty("JIRA_EMAIL");
  var token = props.getProperty("JIRA_API_TOKEN");
  var auth = "Basic " + Utilities.base64Encode(email + ":" + token);

  // Fetch with *all* fields so nothing is hidden
  var url = JIRA_BASE + "/rest/api/3/issue/" + testKey + "?fields=*all";
  var resp = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: auth, Accept: "application/json" },
    muteHttpExceptions: true,
  });

  Logger.log("HTTP status: " + resp.getResponseCode());

  if (resp.getResponseCode() !== 200) {
    Logger.log("Error body: " + resp.getContentText());
    return;
  }

  var issue = JSON.parse(resp.getContentText());
  var fields = issue.fields || {};

  // Log the specific field we care about
  Logger.log("--- customfield_13184 raw value ---");
  Logger.log(JSON.stringify(fields["customfield_13184"]));

  // Log ALL custom fields so we can find the right one if 13184 is wrong
  Logger.log("--- All customfields with non-null values ---");
  Object.keys(fields).forEach(function (k) {
    if (
      k.indexOf("customfield_") === 0 &&
      fields[k] !== null &&
      fields[k] !== ""
    ) {
      Logger.log(k + ": " + JSON.stringify(fields[k]));
    }
  });
}

// ── ONE-TIME Q3 SETUP ─────────────────────────────────────────
// Run this ONCE from the Apps Script editor after creating the
// Q3 FY27 Product Roadmap sheet as a copy of the Q2 sheet.
//
// It wipes every data row from every roadmap tab while leaving the
// header row, column widths, formatting, conditional formatting and
// data validation completely intact. Tabs with no title/pod header
// row (e.g. the README tab) are skipped untouched.
//
// Safe to re-run: on an already-empty sheet it does nothing.
function setupQ3Sheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var report = [];

  ss.getSheets().forEach(function (sh) {
    var headerRow = findHeaderRow_(sh);
    if (headerRow === -1) {
      report.push("SKIPPED (no header row): " + sh.getName());
      return;
    }

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var dataRows = lastRow - headerRow;

    if (dataRows <= 0) {
      report.push("ALREADY EMPTY: " + sh.getName());
      return;
    }

    sh.getRange(headerRow + 1, 1, dataRows, lastCol).clearContent();
    report.push(
      "CLEARED " +
        dataRows +
        " row(s): " +
        sh.getName() +
        " (header kept on row " +
        headerRow +
        ")"
    );
  });

  var msg = "setupQ3Sheet complete\n" + report.join("\n");
  Logger.log(msg);
  return msg;
}

// Finds the row number holding the roadmap header (a row containing
// both "title" and "pod"). Searches the first 15 rows. Returns -1 if
// this tab is not a roadmap tab.
function findHeaderRow_(sh) {
  var probeRows = Math.min(15, sh.getLastRow());
  if (probeRows < 1) return -1;
  var probeCols = Math.min(20, Math.max(1, sh.getLastColumn()));
  var values = sh.getRange(1, 1, probeRows, probeCols).getValues();

  for (var r = 0; r < values.length; r++) {
    var row = values[r].map(function (c) {
      return String(c || "")
        .trim()
        .toLowerCase();
    });
    if (row.indexOf("title") !== -1 && row.indexOf("pod") !== -1) {
      return r + 1;
    }
  }
  return -1;
}
