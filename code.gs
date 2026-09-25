<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Q3 FY27 Roadmap</title>
    <?!= include('styles'); ?>
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <img
          class="brand-logo"
          src="data:image/png;base64,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"
          alt="Exotel"
        />
        <div class="brand-name">Q3 FY27 Roadmap</div>
      </div>
      <div class="search-wrap">
        <svg
          class="search-icon"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          id="q"
          type="search"
          placeholder="Search items, pods or Jira key…"
          autocomplete="off"
        />
      </div>
      <div class="topright">
        <button
          class="sync-badge reload-btn"
          id="reloadBtn"
          title="Click to refresh roadmap data"
        >
          <span class="dot live" id="syncDot"></span>
          <span id="syncTxt">Loading…</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            style="margin-left: 4px; flex-shrink: 0"
          >
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </button>
      </div>
    </header>

    <div class="rail">
      <span class="lbl">Pod</span>
      <div class="chip-row" id="podChips"></div>
      <select id="statusSel" class="sel">
        <option value="">All statuses</option>
      </select>
      <select id="priSel" class="sel">
        <option value="">All priorities</option>
        <option>P0</option>
        <option>P1</option>
        <option>P2</option>
        <option>P3</option>
        <option>P4</option>
      </select>
      <button class="aha-toggle" id="ahaToggle" aria-pressed="false">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
        >
          <path d="M9 12l2 2 4-4" />
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
        Picked from Aha!
      </button>
      <div class="rail-space"></div>
      <button class="reset-btn" id="resetBtn">Reset</button>
    </div>

    <div class="viewbar-wrap">
      <nav class="viewbar" role="tablist" id="viewbar">
        <button class="vtab" role="tab" aria-selected="true" data-v="table">
          Roadmap
        </button>
        <button class="vtab" role="tab" aria-selected="false" data-v="timeline">
          Timeline
        </button>
        <button class="vtab" role="tab" aria-selected="false" data-v="bypod">
          By Pod
        </button>
      </nav>
    </div>

    <main class="canvas">
      <div id="resultLine" class="result-line"></div>
      <div id="view"></div>
    </main>

    <div class="scrim" id="scrim"></div>
    <aside
      class="drawer"
      id="drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Item detail"
    ></aside>

    <script>
      var ROADMAP_DATA = <?!= roadmapJSON ?>;
    </script>
    <?!= include('scripts'); ?>
  </body>
</html>
