from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naive UTC datetime — same value datetime.utcnow() gave, without the
    deprecation warning (removed in a future Python version). Deliberately naive,
    not datetime.now(timezone.utc) as-is: every DateTime column and comparison in
    this codebase assumes naive UTC values, and SQLite doesn't reliably round-trip
    tzinfo. Mixing aware and naive datetimes would raise TypeError on comparison —
    switching everything to real timezone-awareness is a bigger, riskier change
    than a deprecation warning warrants this week."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
