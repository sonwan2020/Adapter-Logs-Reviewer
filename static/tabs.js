/**
 * Adapter Logs Reviewer — Tab rendering functions (split from app.js).
 */

/**
 * Parse SSE stream from copilotResponse and render it.
 * Extracts delta.content, delta.reasoning_text, and delta.tool_calls.
 */
function renderCopilotResponse(entry, tabContent, escapeHtml) {
    const container = document.createElement("div");
    container.className = "copilot-response-tab";

    const data = entry.data || entry;
    const sseRaw = data.copilotResponse || "";

    // Parse SSE lines
    let contentFragments = [];
    let reasoningFragments = [];
    let toolCallsMap = {}; // indexed by tool call index

    const lines = sseRaw.split("\n");
    for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;

        let parsed;
        try {
            parsed = JSON.parse(payload);
        } catch (e) {
            continue;
        }

        if (!parsed.choices || !parsed.choices.length) continue;

        for (const choice of parsed.choices) {
            const delta = choice.delta;
            if (!delta) continue;

            if (delta.content) {
                contentFragments.push(delta.content);
            }
            if (delta.reasoning_text) {
                reasoningFragments.push(delta.reasoning_text);
            }
            if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index != null ? tc.index : 0;
                    if (!toolCallsMap[idx]) {
                        toolCallsMap[idx] = { id: "", type: "", function: { name: "", arguments: "" } };
                    }
                    if (tc.id) toolCallsMap[idx].id = tc.id;
                    if (tc.type) toolCallsMap[idx].type = tc.type;
                    if (tc.function) {
                        if (tc.function.name) toolCallsMap[idx].function.name += tc.function.name;
                        if (tc.function.arguments) toolCallsMap[idx].function.arguments += tc.function.arguments;
                    }
                }
            }
        }
    }

    const contentText = contentFragments.join("");
    const reasoningText = reasoningFragments.join("");
    const toolCalls = Object.values(toolCallsMap);

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn-secondary raw-json-toggle";
    toggleBtn.textContent = "Show Raw JSON";
    let showingRaw = false;
    container.appendChild(toggleBtn);

    // Formatted view
    const formattedView = document.createElement("div");
    formattedView.className = "copilot-response-formatted";

    // Reasoning section (collapsible)
    if (reasoningText) {
        const reasoningEl = document.createElement("div");
        reasoningEl.className = "message-bubble role-thinking";
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Reasoning / Thinking";
        details.appendChild(summary);
        const thinkingContent = document.createElement("div");
        thinkingContent.className = "thinking-content";
        thinkingContent.textContent = reasoningText;
        details.appendChild(thinkingContent);
        reasoningEl.appendChild(details);
        formattedView.appendChild(reasoningEl);
    }

    // Content section
    if (contentText) {
        const contentEl = document.createElement("div");
        contentEl.className = "copilot-content-section";
        const label = document.createElement("div");
        label.className = "section-label";
        label.textContent = "Response";
        contentEl.appendChild(label);
        const body = document.createElement("div");
        body.className = "content-block block-text";
        body.textContent = contentText;
        contentEl.appendChild(body);
        formattedView.appendChild(contentEl);
    }

    // Tool calls section
    if (toolCalls.length > 0) {
        const toolsEl = document.createElement("div");
        toolsEl.className = "copilot-tool-calls-section";
        const label = document.createElement("div");
        label.className = "section-label";
        label.textContent = `Tool Calls (${toolCalls.length})`;
        toolsEl.appendChild(label);

        for (const tc of toolCalls) {
            const block = document.createElement("div");
            block.className = "block-tool-use";
            block.innerHTML = `<div class="block-label">Function: <strong>${escapeHtml(tc.function.name)}</strong> <code>${escapeHtml(tc.id)}</code></div>`;
            const argsPre = document.createElement("pre");
            argsPre.className = "tool-input";
            try {
                argsPre.textContent = JSON.stringify(JSON.parse(tc.function.arguments), null, 2);
            } catch (e) {
                argsPre.textContent = tc.function.arguments;
            }
            block.appendChild(argsPre);
            toolsEl.appendChild(block);
        }
        formattedView.appendChild(toolsEl);
    }

    if (!contentText && !reasoningText && toolCalls.length === 0) {
        const empty = document.createElement("p");
        empty.className = "placeholder";
        empty.textContent = "No copilot response data available.";
        formattedView.appendChild(empty);
    }

    container.appendChild(formattedView);

    // Raw JSON view
    const rawView = document.createElement("div");
    rawView.className = "raw-json-view";
    rawView.style.display = "none";
    const pre = document.createElement("pre");
    pre.className = "raw-json";
    pre.textContent = sseRaw;
    rawView.appendChild(pre);
    container.appendChild(rawView);

    toggleBtn.addEventListener("click", () => {
        showingRaw = !showingRaw;
        formattedView.style.display = showingRaw ? "none" : "block";
        rawView.style.display = showingRaw ? "block" : "none";
        toggleBtn.textContent = showingRaw ? "Show Formatted" : "Show Raw JSON";
    });

    tabContent.replaceChildren(container);
}

/**
 * Render the Tools tab — deduplicated tool definitions as collapsible blocks.
 */
function renderToolsTab(entry, tabContent, escapeHtml) {
    const container = document.createElement("div");
    container.className = "tools-tab";

    const data = entry.data || entry;
    const tools = (data.anthropicRequest && data.anthropicRequest.tools) || [];

    // Deduplicate by tool name (keep first occurrence)
    const seen = new Set();
    const uniqueTools = [];
    for (const tool of tools) {
        const key = tool.name || "";
        if (!seen.has(key)) {
            seen.add(key);
            uniqueTools.push(tool);
        }
    }

    // Header with count
    const header = document.createElement("div");
    header.className = "tools-tab-header";
    header.innerHTML = `<span class="tools-count">${uniqueTools.length} tool${uniqueTools.length !== 1 ? "s" : ""}</span>`;
    container.appendChild(header);

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn-secondary raw-json-toggle";
    toggleBtn.textContent = "Show Raw JSON";
    let showingRaw = false;
    header.appendChild(toggleBtn);

    // Formatted view
    const formattedView = document.createElement("div");
    formattedView.className = "tools-formatted";

    if (uniqueTools.length === 0) {
        const empty = document.createElement("p");
        empty.className = "placeholder";
        empty.textContent = "No tools defined for this entry.";
        formattedView.appendChild(empty);
    } else {
        for (const tool of uniqueTools) {
            const details = document.createElement("details");
            details.className = "tool-block";

            const summary = document.createElement("summary");
            summary.className = "tool-block-summary";
            summary.textContent = tool.name || "(unnamed)";
            details.appendChild(summary);

            const body = document.createElement("div");
            body.className = "tool-block-body";

            if (tool.description) {
                const desc = document.createElement("div");
                desc.className = "tool-description";
                desc.textContent = tool.description;
                body.appendChild(desc);
            }

            if (tool.input_schema) {
                const schemaLabel = document.createElement("div");
                schemaLabel.className = "tool-schema-label";
                schemaLabel.textContent = "Input Schema";
                body.appendChild(schemaLabel);

                const schemaPre = document.createElement("pre");
                schemaPre.className = "tool-schema";
                schemaPre.textContent = JSON.stringify(tool.input_schema, null, 2);
                body.appendChild(schemaPre);
            }

            details.appendChild(body);
            formattedView.appendChild(details);
        }
    }

    container.appendChild(formattedView);

    // Raw JSON view
    const rawView = document.createElement("div");
    rawView.className = "raw-json-view";
    rawView.style.display = "none";
    const pre = document.createElement("pre");
    pre.className = "raw-json";
    pre.textContent = JSON.stringify(tools, null, 2);
    rawView.appendChild(pre);
    container.appendChild(rawView);

    toggleBtn.addEventListener("click", () => {
        showingRaw = !showingRaw;
        formattedView.style.display = showingRaw ? "none" : "block";
        rawView.style.display = showingRaw ? "block" : "none";
        toggleBtn.textContent = showingRaw ? "Show Formatted" : "Show Raw JSON";
    });

    tabContent.replaceChildren(container);
}

/**
 * Render the System Prompts tab — display system array entries with cache_control badges.
 */
function renderSystemPromptsTab(entry, tabContent, escapeHtml) {
    const container = document.createElement("div");
    container.className = "system-prompts-tab";

    const data = entry.data || entry;
    const systemPrompts = (data.anthropicRequest && data.anthropicRequest.system) || [];

    // Header
    const header = document.createElement("div");
    header.className = "system-prompts-header";
    header.innerHTML = `<span class="system-prompts-count">${systemPrompts.length} system prompt${systemPrompts.length !== 1 ? "s" : ""}</span>`;
    container.appendChild(header);

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn btn-secondary raw-json-toggle";
    toggleBtn.textContent = "Show Raw JSON";
    let showingRaw = false;
    header.appendChild(toggleBtn);

    // Deduplication check
    const textContents = systemPrompts.map((p) => p.text || "");
    const uniqueTexts = new Set(textContents);
    if (uniqueTexts.size < textContents.length && textContents.length > 1) {
        const note = document.createElement("div");
        note.className = "dedup-note";
        note.textContent = `Note: ${textContents.length - uniqueTexts.size} duplicate prompt(s) detected (identical text content).`;
        container.appendChild(note);
    }

    // Formatted view
    const formattedView = document.createElement("div");
    formattedView.className = "system-prompts-formatted";

    if (systemPrompts.length === 0) {
        const empty = document.createElement("p");
        empty.className = "placeholder";
        empty.textContent = "No system prompts for this entry.";
        formattedView.appendChild(empty);
    } else {
        systemPrompts.forEach((prompt, idx) => {
            const details = document.createElement("details");
            details.className = "system-prompt-block";

            const summary = document.createElement("summary");
            summary.className = "system-prompt-summary";
            let summaryText = `System Prompt #${idx + 1}`;
            if (prompt.type) summaryText += ` (${prompt.type})`;
            summary.textContent = summaryText;

            // Cache control badge
            if (prompt.cache_control) {
                const badge = document.createElement("span");
                badge.className = "cache-control-badge";
                badge.textContent = `cache: ${prompt.cache_control.type || JSON.stringify(prompt.cache_control)}`;
                summary.appendChild(badge);
            }

            details.appendChild(summary);

            const body = document.createElement("div");
            body.className = "system-prompt-body";
            body.textContent = prompt.text || JSON.stringify(prompt, null, 2);
            details.appendChild(body);

            formattedView.appendChild(details);
        });
    }

    container.appendChild(formattedView);

    // Raw JSON view
    const rawView = document.createElement("div");
    rawView.className = "raw-json-view";
    rawView.style.display = "none";
    const pre2 = document.createElement("pre");
    pre2.className = "raw-json";
    pre2.textContent = JSON.stringify(systemPrompts, null, 2);
    rawView.appendChild(pre2);
    container.appendChild(rawView);

    toggleBtn.addEventListener("click", () => {
        showingRaw = !showingRaw;
        formattedView.style.display = showingRaw ? "none" : "block";
        rawView.style.display = showingRaw ? "block" : "none";
        toggleBtn.textContent = showingRaw ? "Show Formatted" : "Show Raw JSON";
    });

    tabContent.replaceChildren(container);
}

/**
 * Render the Raw JSON tab — complete entry as pretty-printed JSON.
 */
function renderRawJsonTab(entry, tabContent) {
    const container = document.createElement("div");
    container.className = "raw-json-tab";
    const pre = document.createElement("pre");
    pre.className = "raw-json";
    pre.textContent = JSON.stringify(entry, null, 2);
    container.appendChild(pre);
    tabContent.replaceChildren(container);
}
