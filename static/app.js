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
    let currentEntry = null;
    let activeTab = "request-comparison";

    // Filter elements
    const filterPanel = document.querySelector(".filter-panel");
    const filterToggle = document.getElementById("filter-toggle");
    const filterModel = document.getElementById("filter-model");
    const filterTimeFrom = document.getElementById("filter-time-from");
    const filterTimeTo = document.getElementById("filter-time-to");
    const filterSearch = document.getElementById("filter-search");
    const btnUpload = document.getElementById("btn-upload");
    const btnExport = document.getElementById("btn-export");

    // Collapsible filter panel
    filterToggle.addEventListener("click", () => {
        filterPanel.classList.toggle("collapsed");
    });

    // Populate models dropdown
    async function loadModels() {
        try {
            const resp = await fetch("/api/models");
            if (!resp.ok) return;
            const models = await resp.json();
            models.forEach((m) => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                filterModel.appendChild(opt);
            });
        } catch (err) {
            console.error("Failed to load models:", err);
        }
    }

    function getFilterParams() {
        const params = new URLSearchParams();
        params.set("page", currentPage);
        params.set("per_page", perPage);
        if (filterModel.value) params.set("model", filterModel.value);
        if (filterTimeFrom.value) params.set("time_from", filterTimeFrom.value);
        if (filterTimeTo.value) params.set("time_to", filterTimeTo.value);
        if (filterSearch.value.trim()) params.set("search", filterSearch.value.trim());
        return params.toString();
    }

    function resetAndReload() {
        currentPage = 1;
        totalEntries = 0;
        entryList.querySelectorAll(".entry-item").forEach((el) => el.remove());
        loadMoreBtn.style.display = "block";
        loadMoreBtn.textContent = "Load More";
        loadEntries();
    }

    // Filter change handlers
    filterModel.addEventListener("change", resetAndReload);
    filterTimeFrom.addEventListener("change", resetAndReload);
    filterTimeTo.addEventListener("change", resetAndReload);

    // Debounced search
    let searchTimeout = null;
    filterSearch.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(resetAndReload, 300);
    });

    // Upload
    btnUpload.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".jsonl";
        input.addEventListener("change", async () => {
            if (!input.files.length) return;
            const formData = new FormData();
            formData.append("file", input.files[0]);
            try {
                const resp = await fetch("/api/upload", { method: "POST", body: formData });
                if (!resp.ok) throw new Error(resp.statusText);
                // Reload models and entries
                filterModel.innerHTML = '<option value="">All Models</option>';
                await loadModels();
                resetAndReload();
            } catch (err) {
                console.error("Upload failed:", err);
                alert("Upload failed: " + err.message);
            }
        });
        input.click();
    });

    // Export
    btnExport.addEventListener("click", () => {
        const params = new URLSearchParams();
        if (filterModel.value) params.set("model", filterModel.value);
        if (filterTimeFrom.value) params.set("time_from", filterTimeFrom.value);
        if (filterTimeTo.value) params.set("time_to", filterTimeTo.value);
        if (filterSearch.value.trim()) params.set("search", filterSearch.value.trim());
        window.location.href = "/api/export?" + params.toString();
    });

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
            activeTab = tab.dataset.tab;
            if (currentEntry) renderActiveTab();
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
            const resp = await fetch(`/api/entries?${getFilterParams()}`);
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
            currentEntry = await resp.json();
            renderActiveTab();
        } catch (err) {
            tabContent.innerHTML = '<p class="placeholder">Failed to load entry.</p>';
        }
    }

    function renderActiveTab() {
        if (!currentEntry) return;
        if (activeTab === "request-comparison") {
            renderRequestComparison(currentEntry);
        } else if (activeTab === "copilot-response") {
            renderCopilotResponse(currentEntry, tabContent, escapeHtml);
        } else if (activeTab === "tools") {
            renderToolsTab(currentEntry, tabContent, escapeHtml);
        } else if (activeTab === "system-prompts") {
            renderSystemPromptsTab(currentEntry, tabContent, escapeHtml);
        } else if (activeTab === "raw-json") {
            renderRawJsonTab(currentEntry, tabContent);
        } else {
            const pre = document.createElement("pre");
            pre.className = "raw-json";
            pre.textContent = JSON.stringify(currentEntry, null, 2);
            tabContent.replaceChildren(pre);
        }
    }

    // ===== Request Comparison Tab =====

    function renderRequestComparison(entry) {
        const container = document.createElement("div");
        container.className = "request-comparison";

        // Toggle button
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "btn btn-secondary raw-json-toggle";
        toggleBtn.textContent = "Show Raw JSON";
        let showingRaw = false;
        container.appendChild(toggleBtn);

        // Split view
        const splitView = document.createElement("div");
        splitView.className = "split-view";

        const leftPanel = document.createElement("div");
        leftPanel.className = "split-panel";
        leftPanel.innerHTML = '<h3 class="panel-title">Anthropic Request</h3>';
        leftPanel.appendChild(renderAnthropicMessages(entry.anthropicRequest));

        const rightPanel = document.createElement("div");
        rightPanel.className = "split-panel";
        rightPanel.innerHTML = '<h3 class="panel-title">OpenAI Request</h3>';
        rightPanel.appendChild(renderOpenAIMessages(entry.openaiRequest));

        splitView.appendChild(leftPanel);
        splitView.appendChild(rightPanel);
        container.appendChild(splitView);

        // Raw JSON view (hidden initially)
        const rawView = document.createElement("div");
        rawView.className = "raw-json-view";
        rawView.style.display = "none";
        const rawSplit = document.createElement("div");
        rawSplit.className = "split-view";
        const rawLeft = document.createElement("div");
        rawLeft.className = "split-panel";
        rawLeft.innerHTML = '<h3 class="panel-title">Anthropic Request (Raw)</h3>';
        const preLeft = document.createElement("pre");
        preLeft.className = "raw-json";
        preLeft.textContent = JSON.stringify(entry.anthropicRequest, null, 2);
        rawLeft.appendChild(preLeft);
        const rawRight = document.createElement("div");
        rawRight.className = "split-panel";
        rawRight.innerHTML = '<h3 class="panel-title">OpenAI Request (Raw)</h3>';
        const preRight = document.createElement("pre");
        preRight.className = "raw-json";
        preRight.textContent = JSON.stringify(entry.openaiRequest, null, 2);
        rawRight.appendChild(preRight);
        rawSplit.appendChild(rawLeft);
        rawSplit.appendChild(rawRight);
        rawView.appendChild(rawSplit);
        container.appendChild(rawView);

        toggleBtn.addEventListener("click", () => {
            showingRaw = !showingRaw;
            splitView.style.display = showingRaw ? "none" : "flex";
            rawView.style.display = showingRaw ? "block" : "none";
            toggleBtn.textContent = showingRaw ? "Show Formatted" : "Show Raw JSON";
        });

        tabContent.replaceChildren(container);
    }

    function renderAnthropicMessages(req) {
        const thread = document.createElement("div");
        thread.className = "message-thread";
        if (!req || !req.messages) return thread;

        req.messages.forEach((msg) => {
            const content = msg.content;
            // Separate thinking blocks from other content
            let thinkingBlocks = [];
            let otherBlocks = [];

            if (Array.isArray(content)) {
                content.forEach((block) => {
                    if (block.type === "thinking") {
                        thinkingBlocks.push(block);
                    } else {
                        otherBlocks.push(block);
                    }
                });
            } else {
                otherBlocks.push({ type: "text", text: content || "" });
            }

            // Render thinking blocks merged and collapsible
            if (thinkingBlocks.length > 0) {
                const thinkingEl = document.createElement("div");
                thinkingEl.className = "message-bubble role-thinking";
                const details = document.createElement("details");
                const summary = document.createElement("summary");
                summary.textContent = `Thinking (${thinkingBlocks.length} block${thinkingBlocks.length > 1 ? "s" : ""})`;
                details.appendChild(summary);
                const thinkingContent = document.createElement("div");
                thinkingContent.className = "thinking-content";
                thinkingContent.textContent = thinkingBlocks.map((b) => b.thinking || b.text || "").join("\n\n");
                details.appendChild(thinkingContent);
                thinkingEl.appendChild(details);
                thread.appendChild(thinkingEl);
            }

            // Render main message
            if (otherBlocks.length > 0) {
                const bubble = document.createElement("div");
                bubble.className = `message-bubble role-${msg.role}`;
                const label = document.createElement("div");
                label.className = "role-label";
                label.textContent = msg.role;
                bubble.appendChild(label);

                otherBlocks.forEach((block) => {
                    bubble.appendChild(renderAnthropicBlock(block));
                });
                thread.appendChild(bubble);
            }
        });
        return thread;
    }

    function renderAnthropicBlock(block) {
        const el = document.createElement("div");
        el.className = "content-block";

        if (block.type === "text") {
            el.className += " block-text";
            el.textContent = block.text || "";
        } else if (block.type === "tool_use") {
            el.className += " block-tool-use";
            el.innerHTML = `<div class="block-label">Tool Use: <strong>${escapeHtml(block.name || "")}</strong> <code>${escapeHtml(block.id || "")}</code></div>`;
            const inputPre = document.createElement("pre");
            inputPre.className = "tool-input";
            inputPre.textContent = JSON.stringify(block.input, null, 2);
            el.appendChild(inputPre);
        } else if (block.type === "tool_result") {
            el.className += " block-tool-result";
            el.innerHTML = `<div class="block-label">Tool Result <code>${escapeHtml(block.tool_use_id || "")}</code></div>`;
            const resultContent = document.createElement("div");
            resultContent.className = "tool-result-content";
            if (Array.isArray(block.content)) {
                block.content.forEach((sub) => {
                    const subEl = document.createElement("div");
                    subEl.textContent = sub.text || JSON.stringify(sub);
                    resultContent.appendChild(subEl);
                });
            } else {
                resultContent.textContent = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
            }
            el.appendChild(resultContent);
        } else {
            el.textContent = JSON.stringify(block, null, 2);
        }
        return el;
    }

    function renderOpenAIMessages(req) {
        const thread = document.createElement("div");
        thread.className = "message-thread";
        if (!req || !req.messages) return thread;

        req.messages.forEach((msg) => {
            const bubble = document.createElement("div");
            bubble.className = `message-bubble role-${msg.role}`;
            const label = document.createElement("div");
            label.className = "role-label";
            label.textContent = msg.role;
            bubble.appendChild(label);

            const contentEl = document.createElement("div");
            contentEl.className = "content-block block-text";
            if (typeof msg.content === "string") {
                contentEl.textContent = msg.content;
            } else if (Array.isArray(msg.content)) {
                contentEl.textContent = msg.content.map((c) => c.text || JSON.stringify(c)).join("\n");
            } else {
                contentEl.textContent = JSON.stringify(msg.content, null, 2);
            }
            bubble.appendChild(contentEl);
            thread.appendChild(bubble);
        });
        return thread;
    }

    // Load More button
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = "Load More";
    loadMoreBtn.addEventListener("click", loadEntries);
    entryList.appendChild(loadMoreBtn);

    // Initial load
    loadModels();
    loadEntries();
});
