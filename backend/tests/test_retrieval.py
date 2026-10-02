from app.modules.assistant.retrieval import load_chunks, search


def test_knowledge_base_has_sources():
    chunks = load_chunks()
    assert len(chunks) >= 15
    assert all(c.url.startswith("http") and c.publisher for c in chunks)


def test_bph_query_finds_pest_guide():
    top = search("brown planthopper hopperburn at base of plants")[0]
    assert top.id.startswith("rice-pest-scouting") and "planthopper" in top.heading.lower()


def test_awd_query_finds_water_guide():
    ids = [c.id for c in search("when should I irrigate with alternate wetting and drying")]
    assert any(i.startswith("rice-water-management") for i in ids)


def test_irrelevant_query_returns_nothing():
    assert search("zzzz qqqq") == []
