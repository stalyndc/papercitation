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

  // Reset UI
  resultsSection.hidden = true;
  errorMessage.hidden = true;
  emptyState.hidden = true;
  resultsList.innerHTML = "";

  // Show loading state
  searchBtn.disabled = true;
  btnText.hidden = true;
  btnLoading.hidden = false;

  // Progressive loading states
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

    // Display results
    termsUsed.textContent = data.searchTerms;

    data.results.forEach((paper, index) => {
      const card = createResultCard(paper, index);
      resultsList.appendChild(card);
    });

    resultsSection.hidden = false;
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  } finally {
    searchBtn.disabled = false;
    btnText.hidden = false;
    btnLoading.hidden = true;
    btnLoading.textContent = "Analyzing claim...";
  }
});

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
  const meta = `${authors} • ${paper.year} • ${paper.journal}`;

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

    <div class="citation-tabs" role="tablist" aria-label="Citation format options">
      <button class="tab-btn active" role="tab" aria-selected="true" data-style="apa">APA</button>
      <button class="tab-btn" role="tab" aria-selected="false" data-style="mla">MLA</button>
      <button class="tab-btn" role="tab" aria-selected="false" data-style="chicago">Chicago</button>
      <button class="tab-btn" role="tab" aria-selected="false" data-style="harvard">Harvard</button>
    </div>

    <div class="citation-box">
      <button class="copy-btn" aria-label="Copy citation to clipboard">Copy</button>
      <div class="citation-text">${paper.citations.apa}</div>
    </div>

    ${
      paper.url
        ? `<a href="${escapeHtml(
            paper.url
          )}" target="_blank" rel="noopener" class="result-link">View Paper →</a>`
        : ""
    }
  `;

  // Tab switching
  const tabs = card.querySelectorAll(".tab-btn");
  const citationText = card.querySelector(".citation-text");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const style = tab.dataset.style;
      citationText.innerHTML = paper.citations[style];
    });
  });

  // Copy functionality
  const copyBtn = card.querySelector(".copy-btn");
  copyBtn.addEventListener("click", async () => {
    const text = citationText.textContent;
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("copied");
    }, 2000);
  });

  return card;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
