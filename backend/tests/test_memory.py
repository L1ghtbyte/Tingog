from app.crud import get_conversation, get_latest_briefing_record, save_briefing_record, save_conversation


def test_briefing_record_save_and_retrieve_latest(db):
    assert get_latest_briefing_record(db) is None

    save_briefing_record(db, "First narrative.", [{"source_tool": "x", "source_field": "y", "value": 1}], trigger_source="coordinator_query")
    save_briefing_record(db, "Second, more recent narrative.", [], trigger_source="scheduled")

    latest = get_latest_briefing_record(db)
    assert latest.narrative == "Second, more recent narrative."


def test_conversation_save_and_retrieve(db):
    assert get_conversation(db, "does-not-exist") is None

    messages = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]
    save_conversation(db, "conv-1", messages)

    loaded = get_conversation(db, "conv-1")
    assert loaded.messages == messages


def test_conversation_save_updates_existing(db):
    save_conversation(db, "conv-1", [{"role": "user", "content": "first"}])
    save_conversation(db, "conv-1", [{"role": "user", "content": "first"}, {"role": "user", "content": "second"}])

    loaded = get_conversation(db, "conv-1")
    assert len(loaded.messages) == 2
