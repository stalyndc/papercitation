const API_URL = "https://papercitation-api.stalyn.workers.dev";

const form = document.getElementById("search-form");
const claimInput = document.getElementById("claim-input");
const searchBtn = document.getElementById("search-btn");
const btnText = searchBtn.querySelector(".btn-text");
const btnLoading = searchBtn.querySelector(".btn-loading");
const resultsSection = document.getElementById("results-section");
const resultsList = document.getElementById("results-list");
const termsUsed = document.getElementById("terms-used");
const errorMessage = document.getElementById("error-message");
const emptyState = document.getElementById("empty-state");
const retrySimpleBtn = document.getElementById("retry-simple-btn");
const utilityBar = document.getElementById("utility-bar");
const shareLinkBtn = document.getElementById("share-link-btn");
const shareHint = document.getElementById("share-hint");
const saveBundleBtn = document.getElementById("save-bundle-btn");
const saveHint = document.getElementById("save-hint");
const toastEl = document.getElementById("toast");
const liveRegion = document.getElementById("live-region");

let latestClaim = "";
let latestSearchTerms = "";
let latestResults = [];
const BUNDLE_KEY = "paperCitationBundles";
const SAVED_PAPERS_KEY = "paperCitationSavedPapers";
const CITATION_STYLE_KEY = "paperCitationStyle";

if (utilityBar) {
  utilityBar.hidden = true;
  utilityBar.classList.remove("is-active");
}

// Popular claims functionality
const claimChips = document.querySelectorAll(".claim-chip");
claimChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    claimInput.value = chip.textContent;
    claimInput.focus();
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const claim = claimInput.value.trim();
  if (!claim) return;
  performSearch(claim);
});

retrySimpleBtn?.addEventListener("click", () => {
  if (!latestClaim) return;
  const simplified = simplifyClaimText(latestClaim);
  claimInput.value = simplified;
  performSearch(simplified, { simplified: true });
});

shareLinkBtn?.addEventListener("click", async () => {
  if (!latestClaim) return;
  const url = new URL(window.location.href);
  url.searchParams.set("claim", latestClaim);
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("Shareable link copied");
  } catch (err) {
    window.prompt("Copy this link", url.toString());
    showToast("Copy this link manually");
  }
});

saveBundleBtn?.addEventListener("click", () => {
  if (!latestClaim || !latestResults.length) return;
  saveBundle({
    claim: latestClaim,
    searchTerms: latestSearchTerms,
    results: latestResults.slice(0, 5),
    savedAt: Date.now(),
  });
  showToast("Results saved locally");
});

function showHint(el) {
  if (!el) return;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 1800);
}

async function performSearch(claim) {
  latestClaim = claim;
  utilityBar.hidden = true;
  utilityBar.classList.remove("is-active");
  resultsSection.hidden = true;
  errorMessage.hidden = true;
  emptyState.hidden = true;
  resultsList.innerHTML = "";

  searchBtn.disabled = true;
  btnText.hidden = true;
  btnLoading.hidden = false;
  btnLoading.textContent = "Analyzing claim...";

  setTimeout(() => {
    if (!btnLoading.hidden) {
      btnLoading.textContent = "Searching papers...";
    }
  }, 1000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong");
    }

    if (!data.results || data.results.length === 0) {
      emptyState.hidden = false;
      return;
    }

    latestResults = data.results;
    latestSearchTerms = data.searchTerms;
    renderResults(latestResults, latestSearchTerms);
    utilityBar.hidden = false;
    utilityBar.classList.add("is-active");
    updateUrlWithClaim(claim);
  } catch (error) {
    errorMessage.textContent = `${error.message}. If this persists, email info@papercitation.com.`;
    errorMessage.hidden = false;
    announce(errorMessage.textContent);
  } finally {
    searchBtn.disabled = false;
    btnText.hidden = false;
    btnLoading.hidden = true;
    btnLoading.textContent = "Analyzing claim...";
  }
}

function renderResults(results, searchTermsText) {
  resultsList.innerHTML = "";
  termsUsed.textContent = searchTermsText || "";
  results.forEach((paper, index) => {
    const card = createResultCard(paper, index);
    resultsList.appendChild(card);
  });
  resultsSection.hidden = false;
}

function createResultCard(paper, index) {
  const card = document.createElement("div");
  card.className = "result-card";
  if (paper.is_oa) {
    card.classList.add("is-oa");
  }
  if (paper.cited_by_count && paper.cited_by_count >= 100) {
    card.classList.add("is-cited");
  }

  const authors =
    paper.authors.map((a) => a.name).join(", ") || "Unknown Author";
  const meta = `${authors} • ${paper.year || "Year n/a"} • ${
    paper.journal || "Journal not provided"
  }`;
  const qualityHtml = buildQualityBadges(paper);
  const citations = paper.citations || {
    apa: "Citation unavailable",
    mla: "Citation unavailable",
    chicago: "Citation unavailable",
    harvard: "Citation unavailable",
  };
  const lastStyle = getLastStyle();

  // Generate badges HTML
  let badgesHtml = '<div class="result-badges">';
  if (paper.cited_by_count) {
    badgesHtml += `<span class="badge badge-citation">Cited by ${paper.cited_by_count}</span>`;
  }
  if (paper.is_oa) {
    badgesHtml += `<span class="badge badge-oa">Open Access</span>`;
  }
  badgesHtml += '</div>';

  card.innerHTML = `
    ${badgesHtml}
    <h3 class="result-title">${escapeHtml(paper.title)}</h3>
    <p class="result-meta">${escapeHtml(meta)}</p>
    ${qualityHtml}

    <div class="citation-tabs" role="tablist" aria-label="Citation format options">
      <button class="tab-btn active" role="tab" aria-selected="true" data-style="apa">APA</button>
      <button class="tab-btn" role="tab" aria-selected="false" data-style="mla">MLA</button>
      <button class="tab-btn" role="tab" aria-selected="false" data-style="chicago">Chicago</button>
      <button class="tab-btn" role="tab" aria-selected="false" data-style="harvard">Harvard</button>
    </div>

    <div class="citation-box">
      <button class="copy-btn" aria-label="Copy citation to clipboard">Copy</button>
      <div class="citation-text">${citations[lastStyle] || citations.apa}</div>
    </div>

    <div class="result-actions">
      ${
        paper.url
          ? `<a href="${escapeHtml(
              paper.url
            )}" target="_blank" rel="noopener" class="result-link">View Paper →</a>`
          : ""
      }
      <button class="save-btn" type="button">Save citation</button>
    </div>
  `;

  // Tab switching
  const tabs = card.querySelectorAll(".tab-btn");
  const citationText = card.querySelector(".citation-text");

  // set initial active style
  tabs.forEach((tab) => {
    if (tab.dataset.style === lastStyle) {
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
    } else {
      tab.setAttribute("aria-selected", "false");
      tab.classList.remove("active");
    }
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const style = tab.dataset.style;
      setLastStyle(style);
      citationText.innerHTML = citations[style] || citations.apa;
    });
  });

  // Copy functionality
  const copyBtn = card.querySelector(".copy-btn");
  copyBtn.addEventListener("click", async () => {
    const text = citationText.textContent || citations.apa;
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    announce("Citation copied");
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("copied");
    }, 2000);
  });

  const saveBtn = card.querySelector(".save-btn");
  const alreadySaved = isPaperSaved(paper);
  if (alreadySaved) {
    saveBtn.textContent = "Saved";
    saveBtn.classList.add("saved");
    saveBtn.setAttribute("aria-pressed", "true");
  }
  saveBtn.addEventListener("click", () => {
    if (isPaperSaved(paper)) {
      showToast("Already saved");
      return;
    }
    savePaper({ paper, claim: latestClaim });
    saveBtn.textContent = "Saved";
    saveBtn.classList.add("saved");
    saveBtn.setAttribute("aria-pressed", "true");
    showToast("Citation saved");
  });

  return card;
}

function buildQualityBadges(paper) {
  const badges = [];
  const currentYear = new Date().getFullYear();

  if (paper.year && currentYear - paper.year <= 5) {
    badges.push(`<span class="quality-badge"><span class="dot"></span>Recent (&lt;5y)</span>`);
  }

  if (paper.cited_by_count) {
    if (paper.cited_by_count >= 500) {
      badges.push(`<span class="quality-badge"><span class="dot"></span>Highly cited</span>`);
    } else if (paper.cited_by_count >= 100) {
      badges.push(`<span class="quality-badge"><span class="dot"></span>Cited 100+ times</span>`);
    }
  }

  if (!badges.length) return "";
  return `<div class="result-quality">${badges.join("")}</div>`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateUrlWithClaim(claim) {
  const url = new URL(window.location.href);
  url.searchParams.set("claim", claim);
  window.history.replaceState({}, "", url);
}

function simplifyClaimText(claim) {
  return claim.replace(/[,;:]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function getBundles() {
  const raw = localStorage.getItem(BUNDLE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveBundle(bundle) {
  const existing = getBundles();
  const filtered = existing.filter((b) => b.claim !== bundle.claim);
  filtered.unshift(bundle);
  const trimmed = filtered.slice(0, 5);
  localStorage.setItem(BUNDLE_KEY, JSON.stringify(trimmed));
}

function savePaper({ paper, claim }) {
  if (!paper) return;
  const existing = getSavedPapers();
  const filtered = existing.filter(
    (p) => !isSamePaper(p.paper, paper)
  );
  filtered.unshift({
    paper,
    claim,
    savedAt: Date.now(),
  });
  const trimmed = filtered.slice(0, 20);
  localStorage.setItem(SAVED_PAPERS_KEY, JSON.stringify(trimmed));
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

function isSamePaper(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  return a.title && b.title && a.title === b.title;
}

function isPaperSaved(paper) {
  const saved = getSavedPapers();
  return saved.some((p) => isSamePaper(p.paper, paper));
}

function hydrateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const claim = params.get("claim");
  if (claim) {
    claimInput.value = claim;
    performSearch(claim);
  }
}

hydrateFromQuery();

function setLastStyle(style) {
  if (!style) return;
  sessionStorage.setItem(CITATION_STYLE_KEY, style);
}

function getLastStyle() {
  return sessionStorage.getItem(CITATION_STYLE_KEY) || "apa";
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  announce(message);
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toastEl.hidden = true;
  }, 1800);
}

function announce(message) {
  if (!liveRegion) return;
  liveRegion.textContent = "";
  setTimeout(() => {
    liveRegion.textContent = message;
  }, 50);
}
