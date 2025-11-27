const BUNDLE_KEY = "paperCitationBundles";
const SAVED_PAPERS_KEY = "paperCitationSavedPapers";

const listEl = document.getElementById("saved-list");
const setsEl = document.getElementById("saved-sets");
const clearAllBtn = document.getElementById("clear-all-btn");
const clearSetsBtn = document.getElementById("clear-sets-btn");

function getBundles() {
  const raw = localStorage.getItem(BUNDLE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function getSavedPapers() {
  const raw = localStorage.getItem(SAVED_PAPERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveBundles(bundles) {
  localStorage.setItem(BUNDLE_KEY, JSON.stringify(bundles));
}

function savePapers(papers) {
  localStorage.setItem(SAVED_PAPERS_KEY, JSON.stringify(papers));
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function renderSaved() {
  renderSavedPapers();
  renderSavedSets();
}

function renderSavedPapers() {
  const papers = getSavedPapers();
  listEl.innerHTML = "";
  if (!papers.length) {
    listEl.innerHTML = `<div class="saved-empty">No individual citations yet. Click “Save citation” next to a paper to add it here.</div>`;
    return;
  }

  papers.forEach((entry, index) => {
    const paper = entry.paper || {};
    const date = formatDate(entry.savedAt);
    const card = document.createElement("div");
    card.className = "saved-card";
    card.innerHTML = `
      <div class="saved-meta">
        <div class="saved-claim">${escapeHtml(paper.title || "Untitled")}</div>
        <div class="saved-detail">${escapeHtml(entry.claim || "")}${date ? " · " + date : ""}</div>
      </div>
      <div class="saved-actions">
        <button class="bundle-btn" data-type="paper" data-action="copy" data-index="${index}">Copy citation</button>
        <button class="bundle-btn" data-type="paper" data-action="delete" data-index="${index}">Delete</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.querySelectorAll(".bundle-btn").forEach((btn) => {
    btn.addEventListener("click", () => handlePaperAction(btn));
  });
}

function renderSavedSets() {
  const bundles = getBundles();
  setsEl.innerHTML = "";
  if (!bundles.length) {
    setsEl.innerHTML = `<div class="saved-empty">No saved sets yet. Use “Save these results” after a search.</div>`;
    return;
  }

  bundles.forEach((bundle, index) => {
    const card = document.createElement("div");
    card.className = "saved-card";
    const date = formatDate(bundle.savedAt);
    const count = bundle.results ? bundle.results.length : 0;
    card.innerHTML = `
      <div class="saved-meta">
        <div class="saved-claim">${escapeHtml(bundle.claim)}</div>
        <div class="saved-detail">Terms: ${escapeHtml(bundle.searchTerms || "n/a")} · ${count} citations ${date ? "· " + date : ""}</div>
      </div>
      <div class="saved-actions">
        <button class="bundle-btn" data-action="open" data-index="${index}">Open in search</button>
        <button class="bundle-btn" data-action="copy" data-index="${index}">Copy citations</button>
        <button class="bundle-btn" data-action="delete" data-index="${index}">Delete</button>
      </div>
    `;
    setsEl.appendChild(card);
  });

  setsEl.querySelectorAll(".bundle-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleSetAction(btn));
  });
}

function handlePaperAction(btn) {
  const action = btn.dataset.action;
  const index = Number(btn.dataset.index);
  const papers = getSavedPapers();
  const entry = papers[index];
  if (!entry) return;

  if (action === "delete") {
    papers.splice(index, 1);
    savePapers(papers);
    renderSaved();
    return;
  }

  if (action === "copy") {
    const apa = entry.paper?.citations?.apa || "Citation unavailable";
    navigator.clipboard
      .writeText(apa)
      .then(() => showCopiedState(btn))
      .catch(() => {
        window.prompt("Copy citation", apa);
        showCopiedState(btn);
      });
  }
}

function handleSetAction(btn) {
  const action = btn.dataset.action;
  const index = Number(btn.dataset.index);
  const bundles = getBundles();
  const bundle = bundles[index];
  if (!bundle) return;

  if (action === "delete") {
    bundles.splice(index, 1);
    saveBundles(bundles);
    renderSaved();
    return;
  }

  if (action === "open") {
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/saved\.html$/, "index.html");
    url.search = "";
    url.searchParams.set("claim", bundle.claim);
    window.location.href = url.toString();
    return;
  }

  if (action === "copy") {
    const citations = (bundle.results || [])
      .map((r, idx) => `${idx + 1}. ${r.title || "Untitled"} — ${r.citations?.apa || "Citation unavailable"}`)
      .join("\n");
    navigator.clipboard
      .writeText(citations || "No citations available")
      .then(() => showCopiedState(btn))
      .catch(() => {
        window.prompt("Copy citations", citations);
        showCopiedState(btn);
      });
  }
}

clearAllBtn?.addEventListener("click", () => {
  localStorage.removeItem(BUNDLE_KEY);
  localStorage.removeItem(SAVED_PAPERS_KEY);
  renderSaved();
});

clearSetsBtn?.addEventListener("click", () => {
  localStorage.removeItem(BUNDLE_KEY);
  renderSaved();
});

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showCopiedState(btn) {
  const original = btn.textContent;
  btn.textContent = "Copied";
  btn.classList.add("copied");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("copied");
  }, 1400);
}

renderSaved();
