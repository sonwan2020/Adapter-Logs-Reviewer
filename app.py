"""Adapter Logs Reviewer — Flask application entry point."""

import os

from flask import Flask, jsonify, render_template, request

from log_parser import LogParser

app = Flask(__name__)

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


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
