"""Adapter Logs Reviewer — Flask application entry point."""

import io
import json
import os
import tempfile

from flask import Flask, jsonify, render_template, request, send_file

from log_parser import LogParser

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB

# Initialize parser and load the default log file
parser = LogParser()
_log_file = os.path.join(os.path.dirname(__file__), "resources", "logs.jsonl")
if os.path.isfile(_log_file):
    parser.load(_log_file)


@app.route("/")
def index():
    """Serve the main viewer page."""
    return render_template("index.html")


@app.route("/api/entries")
def api_entries():
    """Return paginated entry summaries with optional filtering."""
    try:
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 50))
    except (TypeError, ValueError):
        return jsonify({"error": "page and per_page must be integers"}), 400

    if page < 1:
        page = 1
    if per_page < 1 or per_page > 200:
        per_page = 50

    model = request.args.get("model") or None
    time_from = request.args.get("time_from") or None
    time_to = request.args.get("time_to") or None
    search = request.args.get("search") or None

    result = parser.get_index(
        page=page,
        per_page=per_page,
        model=model,
        time_from=time_from,
        time_to=time_to,
        search=search,
    )
    return jsonify(result)


@app.route("/api/models")
def api_models():
    """Return distinct model names for filter dropdowns."""
    return jsonify({"models": parser.get_all_models()})


@app.route("/api/entries/<int:entry_id>")
def api_entry_detail(entry_id: int):
    """Return full detail for a single entry."""
    entry = parser.get_entry(entry_id)
    if entry is None:
        return jsonify({"error": "Entry not found"}), 404
    return jsonify({"id": entry_id, "data": entry})


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """Accept a JSONL file upload, validate it, and replace the active dataset."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    # Validate file extension
    if not file.filename.lower().endswith((".jsonl", ".json", ".ndjson")):
        return jsonify({"error": "Only .jsonl files are accepted"}), 400

    # Read and validate content
    content = file.read().decode("utf-8", errors="replace")
    lines = content.splitlines()

    valid_count = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        try:
            obj = json.loads(stripped)
            if isinstance(obj, dict):
                valid_count += 1
        except json.JSONDecodeError:
            pass

    total_lines = sum(1 for l in lines if l.strip())
    skipped_count = total_lines - valid_count

    if valid_count == 0:
        return jsonify({"error": "File contains no valid JSONL entries"}), 400

    # Save to resources/uploaded.jsonl
    upload_path = os.path.join(os.path.dirname(__file__), "resources", "uploaded.jsonl")
    with open(upload_path, "w", encoding="utf-8") as f:
        f.write(content)

    # Re-index
    stats = parser.load(upload_path)
    stats["valid_lines"] = valid_count
    stats["skipped_lines"] = skipped_count
    return jsonify({"message": "File uploaded successfully", "stats": stats})


@app.route("/api/export")
def api_export():
    """Export filtered entries as a downloadable JSONL file."""
    model = request.args.get("model") or None
    time_from = request.args.get("time_from") or None
    time_to = request.args.get("time_to") or None
    search = request.args.get("search") or None

    filtered = parser.filter_entries(model, time_from, time_to, search)

    output = io.BytesIO()
    for _entry, entry_id in filtered:
        full = parser.get_entry(entry_id)
        if full is not None:
            line = json.dumps(full, ensure_ascii=False) + "\n"
            output.write(line.encode("utf-8"))

    output.seek(0)
    return send_file(
        output,
        mimetype="application/x-ndjson",
        as_attachment=True,
        download_name="export.jsonl",
    )


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
