from app.agent.prompts import build_continued_messages, build_initial_messages, parse_final_answer


def test_parse_final_answer_detects_clarifying_question():
    content = '{"clarifying_question": "Do you mean the whole barangay, or one purok?"}'
    result = parse_final_answer(content)
    assert result == {"clarifying_question": "Do you mean the whole barangay, or one purok?"}


def test_parse_final_answer_detects_normal_claims_narrative():
    content = '{"claims": [], "narrative": "All quiet."}'
    result = parse_final_answer(content)
    assert result["narrative"] == "All quiet."
    assert "clarifying_question" not in result


def test_parse_final_answer_tolerates_code_fence():
    content = '```json\n{"claims": [], "narrative": "Fine."}\n```'
    result = parse_final_answer(content)
    assert result["narrative"] == "Fine."


def test_clarifying_question_only_offered_when_question_given():
    with_question = build_initial_messages("what about Purok 4?")
    without_question = build_initial_messages(None)
    assert "clarifying_question" in with_question[0]["content"]
    assert "clarifying_question" not in without_question[0]["content"]


def test_build_continued_messages_appends_not_replaces():
    existing = [{"role": "system", "content": "sys"}, {"role": "user", "content": "first question"}]
    continued = build_continued_messages(existing, "follow-up question")
    assert len(continued) == 3
    assert continued[:2] == existing
    assert continued[2] == {"role": "user", "content": "follow-up question"}
