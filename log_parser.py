"""
JSONL Log Parser with lazy loading, in-memory indexing, and content deduplication.

Reads JSONL files line-by-line, builds a lightweight index for pagination,
and deduplicates repeated content (tools, messages, system prompts) via hashing.
"""

import hashlib
import json
import os
from typing import Optional


class LogParser:
    """Parses and indexes JSONL log files with lazy loading and deduplication."""

    def __init__(self):
        self._file_path: Optional[str] = None
        self._index: list[dict] = []
        self._malformed: list[dict] = []  # [{line_number, offset, error}]

        # Deduplication stores: hash -> content
        self._tools_store: dict[str, list] = {}
        self._messages_store: dict[str, list] = {}
        self._system_store: dict[str, list] = {}

        # Index entry -> hash references (avoid storing full content in index)
        self._entry_tools_hash: dict[int, str] = {}
        self._entry_messages_hash: dict[int, str] = {}
        self._entry_system_hash: dict[int, str] = {}

    @property
    def file_path(self) -> Optional[str]:
        return self._file_path

    @property
    def entry_count(self) -> int:
        return len(self._index)

    @property
    def malformed_count(self) -> int:
        return len(self._malformed)

    @property
    def malformed_entries(self) -> list[dict]:
        return self._malformed.copy()

    def load(self, file_path: str) -> dict:
        """
        Load and index a JSONL file. Returns summary stats.
        Clears any previously loaded data first.
        """
        self._reset()
        self._file_path = file_path

        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Log file not found: {file_path}")

        line_number = 0
        offset = 0

        with open(file_path, "r", encoding="utf-8") as f:
            while True:
                line_start = f.tell()
                line = f.readline()
                if not line:
                    break

                line_number += 1
                stripped = line.strip()

                # Skip empty lines
                if not stripped:
                    offset = f.tell()
                    continue

                try:
                    entry = json.loads(stripped)
                except json.JSONDecodeError as e:
                    self._malformed.append({
                        "line_number": line_number,
                        "offset": line_start,
                        "error": str(e),
                    })
                    offset = f.tell()
                    continue

                if not isinstance(entry, dict):
                    self._malformed.append({
                        "line_number": line_number,
                        "offset": line_start,
                        "error": "Entry is not a JSON object",
                    })
                    offset = f.tell()
                    continue

                # Build index entry
                idx = len(self._index)
                index_entry = self._build_index_entry(entry, line_start, len(stripped), idx)
                self._index.append(index_entry)

                offset = f.tell()

        return {
            "total_entries": len(self._index),
            "malformed_entries": len(self._malformed),
            "unique_tool_sets": len(self._tools_store),
            "unique_message_sets": len(self._messages_store),
            "unique_system_prompts": len(self._system_store),
        }

    def get_index(self, page: int = 1, per_page: int = 50) -> dict:
        """Return a paginated slice of the index."""
        total = len(self._index)
        start = (page - 1) * per_page
        end = min(start + per_page, total)

        entries = []
        for i in range(start, end):
            entry = self._index[i].copy()
            entry["id"] = i  # 0-based ID for API use
            entries.append(entry)

        return {
            "total": total,
            "page": page,
            "per_page": per_page,
            "entries": entries,
        }

    def get_entry(self, entry_id: int) -> Optional[dict]:
        """
        Lazily read and return the full content of a single entry by its index ID.
        Only reads the specific line from disk.
        """
        if entry_id < 0 or entry_id >= len(self._index):
            return None

        if not self._file_path or not os.path.isfile(self._file_path):
            return None

        index_entry = self._index[entry_id]
        offset = index_entry["line_offset"]

        with open(self._file_path, "r", encoding="utf-8") as f:
            f.seek(offset)
            line = f.readline()

        try:
            data = json.loads(line.strip())
        except (json.JSONDecodeError, ValueError):
            return None

        return data

    def get_entry_summary(self, entry_id: int) -> Optional[dict]:
        """Return the index summary for a single entry."""
        if entry_id < 0 or entry_id >= len(self._index):
            return None
        entry = self._index[entry_id].copy()
        entry["id"] = entry_id
        return entry

    def get_all_models(self) -> list[str]:
        """Return sorted list of unique model names across all entries."""
        models = set()
        for entry in self._index:
            if entry.get("model"):
                models.add(entry["model"])
        return sorted(models)

    def get_deduplicated_tools(self, entry_id: int) -> Optional[list]:
        """Return the deduplicated tools for an entry via hash lookup."""
        if entry_id not in self._entry_tools_hash:
            return None
        hash_key = self._entry_tools_hash[entry_id]
        return self._tools_store.get(hash_key)

    def get_deduplicated_system(self, entry_id: int) -> Optional[list]:
        """Return the deduplicated system prompts for an entry via hash lookup."""
        if entry_id not in self._entry_system_hash:
            return None
        hash_key = self._entry_system_hash[entry_id]
        return self._system_store.get(hash_key)

    def _reset(self):
        """Clear all loaded data for re-loading."""
        self._file_path = None
        self._index.clear()
        self._malformed.clear()
        self._tools_store.clear()
        self._messages_store.clear()
        self._system_store.clear()
        self._entry_tools_hash.clear()
        self._entry_messages_hash.clear()
        self._entry_system_hash.clear()

    def _build_index_entry(self, entry: dict, offset: int, size_bytes: int, idx: int) -> dict:
        """Extract summary fields and perform deduplication for one entry."""
        timestamp = entry.get("timestamp", "")
        anthropic_req = entry.get("anthropicRequest", {})
        model = anthropic_req.get("model", "")
        messages = anthropic_req.get("messages", [])
        tools = anthropic_req.get("tools", [])
        system = anthropic_req.get("system", [])

        # Deduplicate tools
        if tools:
            tools_hash = self._content_hash(tools)
            if tools_hash not in self._tools_store:
                self._tools_store[tools_hash] = tools
            self._entry_tools_hash[idx] = tools_hash

        # Deduplicate messages
        if messages:
            messages_hash = self._content_hash(messages)
            if messages_hash not in self._messages_store:
                self._messages_store[messages_hash] = messages
            self._entry_messages_hash[idx] = messages_hash

        # Deduplicate system prompts
        if system:
            system_hash = self._content_hash(system)
            if system_hash not in self._system_store:
                self._system_store[system_hash] = system
            self._entry_system_hash[idx] = system_hash

        return {
            "line_offset": offset,
            "timestamp": timestamp,
            "model": model,
            "message_count": len(messages),
            "tools_count": len(tools),
            "size_bytes": size_bytes,
        }

    @staticmethod
    def _content_hash(content) -> str:
        """Generate a stable hash for JSON-serializable content."""
        serialized = json.dumps(content, sort_keys=True, separators=(",", ":"))
        return hashlib.md5(serialized.encode("utf-8")).hexdigest()
