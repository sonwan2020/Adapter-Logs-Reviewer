# Adapter Logs Reviewer — Implementation Plan

## Overview

Build a Flask-based web viewer for Adapter JSONL logs with a two-panel UI (sidebar + detail view), server-side pagination, filtering, search, export, and file upload.

---

## Agent Definitions

Agents are invoked via Claude Code's `Agent` tool using built-in subagent types.
Prompt templates are stored under `.claude/agents/` and included in the agent's prompt.

| Agent | Subagent Type | Prompt Template |
|-------|---------------|-----------------|
| Editor | `oh-my-claudecode:executor` | `.claude/agents/editor.md` |
| Reviewer | `oh-my-claudecode:code-reviewer` | `.claude/agents/reviewer.md` |

### Orchestration Model

- **Orchestrator**: This conversation (fully automatic, no manual approval between tasks)
- **Editor**: `Agent(subagent_type: "oh-my-claudecode:executor", prompt: <editor.md instructions + task requirements + feedback>)`
- **Reviewer**: `Agent(subagent_type: "oh-my-claudecode:code-reviewer", prompt: <reviewer.md instructions + task requirements + files to review>)`
- After each approved task: git commit automatically, proceed to next task

### Editor Agent (`.claude/agents/editor.md`)

**Role:** Implements code based on task requirements and reviewer feedback.

**Responsibilities:**

- Read the task requirements and any prior reviewer feedback
- Write/modify Python (Flask backend) and HTML/JS/CSS (frontend) code
- Follow existing project conventions and the architecture in requirements.txt
- Produce minimal, focused changes per task
- Address all reviewer feedback items before marking a task complete

**Output:**

- Modified/new source files
- A brief summary of what was implemented and any decisions made

**Behavior:**

- On first pass: implement the task from scratch based on requirements
- On subsequent passes: read reviewer feedback, fix issues, improve code
- Signal "DONE" when all feedback is addressed

---

### Reviewer Agent (`.claude/agents/reviewer.md`)

**Role:** Reviews editor output against requirements, provides structured feedback.

**Responsibilities:**

- Verify implementation matches the specific task requirements
- Check code quality (error handling, edge cases, readability)
- Verify integration with previously completed tasks
- Check for security issues (no eval, proper input validation)
- Ensure HTML/CSS/JS follows accessibility basics

**Output:**

- Structured feedback with severity levels:
  - `BLOCKER` — must fix before proceeding
  - `SUGGESTION` — improvement recommended but not blocking
  - `PASS` — requirement met, no issues
- Final verdict: `APPROVED` or `NEEDS_CHANGES`

**Behavior:**

- Read the task requirements and the editor's code changes
- Compare against the requirements.txt spec
- Produce actionable feedback (file, line, what's wrong, how to fix)
- When satisfied, output `APPROVED`

---

## Implementation Loop

```txt
For each task:
  1. Editor Agent: implement task (reads requirements + prior feedback)
  2. Reviewer Agent: review changes (reads requirements + editor output)
  3. If verdict == NEEDS_CHANGES:
       → Feed reviewer feedback back to Editor Agent
       → Go to step 1 (max 3 iterations)
  4. If verdict == APPROVED or max iterations reached:
       → Git: stage, commit with summary
       → Proceed to next task
```

### Orchestration — How to Invoke

**Step 1: Call Editor Agent**

```
Agent(
  subagent_type: "oh-my-claudecode:executor",
  description: "Implement Task N - <Task Name>",
  prompt: """
    <include contents of .claude/agents/editor.md>

    ---

    ## Task: <Task Name>

    ### Requirements
    <paste task requirements from PLAN.md>

    ### Acceptance Criteria
    <paste acceptance criteria>

    ### Reviewer Feedback (if any)
    <paste previous reviewer feedback, or "N/A - first pass">

    ### Instructions
    Implement this task. Read `resources/requirements.txt` for full context.
    Read `PLAN.md` for architecture decisions.
    When done, provide your Changes Made summary.
  """
)
```

**Step 2: Call Reviewer Agent**

```
Agent(
  subagent_type: "oh-my-claudecode:code-reviewer",
  description: "Review Task N - <Task Name>",
  prompt: """
    <include contents of .claude/agents/reviewer.md>

    ---

    ## Review Task: <Task Name>

    ### Requirements
    <paste task requirements from PLAN.md>

    ### Acceptance Criteria
    <paste acceptance criteria>

    ### Files to Review
    <list files modified by editor>

    ### Instructions
    Review the implementation against requirements.
    Read `resources/requirements.txt` for full project spec.
    Read the modified files and provide your structured review.
    Output your verdict: APPROVED or NEEDS_CHANGES.
  """
)
```

**Step 3: Git Commit (after APPROVED)**

```bash
git add -A
git commit -m "feat(task-N): <short description>

Implemented:
- <bullet points of what was done>

TODO:
- <any deferred items or known limitations>

Co-Authored-By: Claude Opus 4 <noreply@anthropic.com>"
```

### Loop Termination

The loop stops when:

- Reviewer outputs `APPROVED`, OR
- 3 iterations reached (commit with reviewer's remaining suggestions as TODOs)

Both agents agree implementation meets requirements → commit and move to next task.

---

## Task Breakdown

### Task 1: Project Scaffolding & Flask App Setup

**Files:** `app.py`, `requirements-pip.txt`, `templates/index.html`, `static/style.css`, `static/app.js`

**Requirements:**

- Flask app with basic route serving index.html
- Project structure: `app.py`, `templates/`, `static/`, `resources/`
- `requirements-pip.txt` with Flask dependency
- Basic HTML skeleton with two-panel layout (left sidebar, right detail)
- CSS for the two-panel responsive layout

**Acceptance Criteria:**

- `python app.py` starts server on localhost:5000
- Browser shows empty two-panel layout

---

### Task 2: JSONL Parsing & In-Memory Indexing

**Files:** `log_parser.py`

**Requirements:**

- Load JSONL file with lazy line-by-line reading
- Build an index: `[{line_offset, timestamp, model, message_count, tools_count, size_bytes}]`
- Content deduplication using hash maps (tools, messages, system prompts)
- Error handling: skip malformed lines, flag them, continue loading
- Support re-loading when a new file is uploaded

**Acceptance Criteria:**

- Can parse `resources/logs.jsonl` without loading all content into memory
- Malformed entries are flagged, not crashed on
- Index provides summary info for each entry

---

### Task 3: Server-Side Pagination API

**Files:** `app.py` (routes), `log_parser.py` (pagination logic)

**Requirements:**

- `GET /api/entries?page=1&per_page=50` — returns paginated entry summaries
- `GET /api/entries/<id>` — returns full detail for a single entry
- Response includes: total count, current page, entries with summary fields
- Lazy loading: only read full entry content when requested by ID

**Acceptance Criteria:**

- API returns paginated results with correct metadata
- Single entry endpoint returns complete parsed data
- Large file doesn't cause memory issues

---

### Task 4: Filtering & Search API

**Files:** `app.py` (routes), `log_parser.py` (filter logic)

**Requirements:**

- `GET /api/entries?model=<name>` — filter by model
- `GET /api/entries?time_from=<iso>&time_to=<iso>` — filter by time range
- `GET /api/entries?search=<text>` — full-text search across messages, system prompts, tool names, response content
- Filters are combinable (AND logic)
- Pagination works with filters applied

**Acceptance Criteria:**

- Each filter correctly narrows results
- Combined filters work
- Search finds text in message content, tool names, system prompts

---

### Task 5: File Upload & Export Endpoints

**Files:** `app.py` (routes), `log_parser.py` (reload logic)

**Requirements:**

- `POST /api/upload` — accepts JSONL file upload, replaces active dataset
- `GET /api/export` — downloads filtered entries as JSONL file
- Validate uploaded file is valid JSONL (partial validity OK)
- Return error messages for invalid files

**Acceptance Criteria:**

- Upload replaces active log file and re-indexes
- Export downloads only the currently filtered entries
- Invalid file upload returns clear error message

---

### Task 6: Frontend — Sidebar & Entry List

**Files:** `static/app.js`, `static/style.css`, `templates/index.html`

**Requirements:**

- Scrollable sidebar with lazy-loaded entry list (infinite scroll or pagination buttons)
- Each entry shows: log number, timestamp, model, message count, tools count, size (KB/MB, 2 decimal places)
- Clicking entry loads detail in right panel
- Selected entry is highlighted
- AJAX-based loading (no page reloads)

**Acceptance Criteria:**

- Sidebar loads entries on scroll/page
- Entry click triggers detail load
- Summary info displays correctly

---

### Task 7: Frontend — Filter Panel

**Files:** `static/app.js`, `static/style.css`, `templates/index.html`

**Requirements:**

- Collapsible filter panel above sidebar
- Model dropdown (populated from loaded data)
- Timestamp range picker (from/to)
- Full-text search box (debounced, triggers on typing)
- File upload button (triggers file picker + upload)
- Export button (downloads filtered JSONL)
- All filters trigger AJAX reload of sidebar list

**Acceptance Criteria:**

- Filters update sidebar results without page reload
- File upload works and reloads the viewer
- Export downloads correct filtered data

---

### Task 8: Frontend — Request Comparison Tab

**Files:** `static/app.js`, `static/style.css`

**Requirements:**

- Side-by-side split view: Anthropic Request (left) vs OpenAI Request (right)
- Render as conversation thread: role labels + content blocks
- Distinct background colors per role (light blue=user, light green=assistant, light gray=system/tool)
- Handle structured content blocks (text, tool_use, tool_result) in Anthropic format
- Handle simpler string content in OpenAI format
- Thinking content: merge interleaved `thinking` blocks, display separately (collapsible, muted)
- "Show Raw JSON" toggle button for this tab

**Acceptance Criteria:**

- Messages render with correct role styling
- Thinking content is merged and collapsible
- Tool use/result shown as structured blocks
- Raw JSON toggle works

---

### Task 9: Frontend — Copilot Response Tab

**Files:** `static/app.js`, `static/style.css`

**Requirements:**

- Parse SSE stream: extract `choices[].delta.content` and `choices[].delta.reasoning_text`
- Merge fragmented deltas into complete text
- Display reasoning/thinking separately from content (visually distinct)
- Handle `tool_calls` in the response stream
- "Show Raw JSON" toggle for this tab

**Acceptance Criteria:**

- SSE stream is correctly parsed and merged
- Reasoning text shown separately from content
- Tool calls rendered as structured blocks

---

### Task 10: Frontend — Tools Tab

**Files:** `static/app.js`, `static/style.css`

**Requirements:**

- Display deduplicated tool definitions for the selected entry
- Tools collapsible by default (can be 60+ tools)
- Show tool name, description, input schema
- Highlight differences from shared/common tool set (if any)
- "Show Raw JSON" toggle

**Acceptance Criteria:**

- Tools render as collapsible blocks
- Large tool lists don't break layout
- Deduplication works (shared tools shown once)

---

### Task 11: Frontend — System Prompts Tab & Raw JSON Tab

**Files:** `static/app.js`, `static/style.css`

**Requirements:**

- System Prompts tab: show Anthropic format `system` array entries
- Display `cache_control` annotations clearly
- Deduplication note if content matches across entries
- Raw JSON tab: complete entry in pretty-printed JSON
- "Show Raw JSON" toggle on System Prompts tab

**Acceptance Criteria:**

- System prompts render with cache_control visible
- Raw JSON tab shows complete formatted entry
- Toggle works on System Prompts tab

---

### Task 12: Polish, Error Handling & Integration Testing

**Files:** All files

**Requirements:**

- Consistent error messages for all failure modes
- Loading states/spinners during AJAX calls
- Responsive layout (reasonable at different widths)
- Edge cases: empty log files, single entry, very large entries
- Verify all tabs work end-to-end with real log data

**Acceptance Criteria:**

- No crashes on edge cases
- UI provides feedback during loading
- All features work together with `resources/logs.jsonl`

---

## Execution Order & Dependencies

```text
Task 1 (Scaffolding)
  └── Task 2 (Parser)
        ├── Task 3 (Pagination API)
        │     └── Task 6 (Sidebar UI)
        │           └── Task 7 (Filter Panel UI)
        ├── Task 4 (Filter API)
        │     └── Task 7 (Filter Panel UI)
        ├── Task 5 (Upload/Export API)
        │     └── Task 7 (Filter Panel UI)
        └── Task 8 (Request Comparison)
              ├── Task 9 (Copilot Response)
              ├── Task 10 (Tools Tab)
              ├── Task 11 (System Prompts + Raw JSON)
              └── Task 12 (Polish)
```

**Linear execution order:**

1. Task 1 → 2. Task 2 → 3. Task 3 → 4. Task 4 → 5. Task 5 → 6. Task 6 → 7. Task 7 → 8. Task 8 → 9. Task 9 → 10. Task 10 → 11. Task 11 → 12. Task 12

---

## Git Strategy

After each task's editor-reviewer loop completes:

```bash
# Stage all changes
git add -A

# Commit with conventional commit message
git commit -m "feat(task-N): <short description>

<what was implemented>

TODO:
- <any deferred items>
- <known limitations>
- <integration items for later tasks>"
```

After all tasks complete:

```bash
git log --oneline  # Summary of all commits
```

---

## Progress Tracking

| Task | Status | Summary |
|------|--------|---------|
| Task 1: Project Scaffolding & Flask App Setup | DONE | Flask app, two-panel layout, responsive CSS, tab switching |
| Task 2: JSONL Parsing & In-Memory Indexing | DONE | Lazy parser with offset index, MD5 dedup, malformed line handling |
| Task 3: Server-Side Pagination API | DONE | GET /api/entries with pagination, GET /api/entries/<id> with lazy load |
| Task 4: Filtering & Search API | DONE | Model/time/search filters with AND logic, GET /api/models |
| Task 5: File Upload & Export Endpoints | DONE | POST /api/upload with validation, GET /api/export with filters |
| Task 6: Frontend — Sidebar & Entry List | DONE | AJAX entry list, pagination, click-to-detail, XSS-safe |
| Task 7: Frontend — Filter Panel | DONE | Collapsible filters, model dropdown, search, upload, export |
| Task 8: Frontend — Request Comparison Tab | DONE | Split view, role colors, thinking merge, tool blocks, raw toggle |
| Task 9: Frontend — Copilot Response Tab | DONE | SSE parsing, delta merging, reasoning/content split, tool calls |
| Task 10: Frontend — Tools Tab | DONE | Collapsible tool blocks, dedup by name, schema display, raw toggle |
| Task 11: Frontend — System Prompts Tab & Raw JSON Tab | DONE | System prompts with cache_control badges, dedup note, raw JSON tab |
| Task 12: Polish, Error Handling & Integration Testing | DONE | Loading states, toast errors, edge cases, 413 handler |

---

## File Structure (Final)

```text
Adapter-Logs-Reviewer/
├── app.py                    # Flask application & API routes
├── log_parser.py             # JSONL parsing, indexing, deduplication
├── requirements-pip.txt      # Python dependencies (Flask)
├── templates/
│   └── index.html            # Main HTML page
├── static/
│   ├── style.css             # All styles
│   └── app.js                # All frontend JavaScript
├── resources/
│   ├── logs.jsonl            # Sample log data
│   └── requirements.txt     # Requirements document
├── PLAN.md                   # This file
└── README.md                 # (if needed) Usage instructions
```
