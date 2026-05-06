/**
 * Adapter Logs Reviewer — Frontend application.
 */

document.addEventListener("DOMContentLoaded", () => {
    const entryList = document.querySelector(".entry-list");
    const tabContent = document.querySelector(".tab-content");
    let currentPage = 1;
    const perPage = 50;
    let totalEntries = 0;
    let selectedId = null;
    let loading = false;

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // Tab switching
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
        });
    });

    function formatSize(bytes) {
        if (bytes >= 1048576) {
            return (bytes / 1048576).toFixed(2) + " MB";
        }
        return (bytes / 1024).toFixed(2) + " KB";
    }

    function formatTimestamp(ts) {
        if (!ts) return "—";
        const d = new Date(ts);
        return d.toLocaleString();
    }

    function createEntryItem(entry) {
        const div = document.createElement("div");
        div.className = "entry-item";
        div.dataset.id = entry.id;
        div.innerHTML = `
            <div class="entry-header">
                <span class="entry-number">#${escapeHtml(String(entry.id))}</span>
                <span class="entry-size">${escapeHtml(formatSize(entry.size_bytes))}</span>
            </div>
            <div class="entry-timestamp">${escapeHtml(formatTimestamp(entry.timestamp))}</div>
            <div class="entry-meta">
                <span class="entry-model">${escapeHtml(entry.model || "unknown")}</span>
                <span class="entry-stats">${escapeHtml(String(entry.message_count))} msgs · ${escapeHtml(String(entry.tools_count))} tools</span>
            </div>
        `;
        div.addEventListener("click", () => selectEntry(entry.id));
        return div;
    }

    async function loadEntries() {
        if (loading) return;
        loading = true;
        try {
            const resp = await fetch(`/api/entries?page=${currentPage}&per_page=${perPage}`);
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            totalEntries = data.total;
            data.entries.forEach((entry) => {
                entryList.insertBefore(createEntryItem(entry), loadMoreBtn);
            });
            currentPage++;
            const loaded = entryList.querySelectorAll(".entry-item").length;
            if (loaded >= totalEntries) {
                loadMoreBtn.style.display = "none";
            }
        } catch (err) {
            console.error("Failed to load entries:", err);
            loadMoreBtn.textContent = "Failed to load — click to retry";
        } finally {
            loading = false;
        }
    }

    async function selectEntry(id) {
        selectedId = id;
        document.querySelectorAll(".entry-item").forEach((el) => {
            el.classList.toggle("selected", el.dataset.id == id);
        });
        tabContent.innerHTML = '<p class="placeholder">Loading...</p>';
        try {
            const resp = await fetch(`/api/entries/${id}`);
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            const pre = document.createElement("pre");
            pre.className = "raw-json";
            pre.textContent = JSON.stringify(data, null, 2);
            tabContent.replaceChildren(pre);
        } catch (err) {
            tabContent.innerHTML = '<p class="placeholder">Failed to load entry.</p>';
        }
    }

    // Load More button
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = "Load More";
    loadMoreBtn.addEventListener("click", loadEntries);
    entryList.appendChild(loadMoreBtn);

    // Initial load
    loadEntries();
});
