"""Tiny BM25 retrieval over the curated knowledge base (markdown with front matter)."""

import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
TOKEN = re.compile(r"[a-z0-9]+|[஀-௿]+")
STOP = {"the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "for", "on", "at", "be", "my", "i",
        "what", "should", "do", "this", "with", "are", "can", "how", "when", "which", "from", "about", "as", "by"}


@dataclass(frozen=True)
class Chunk:
    id: str
    title: str
    publisher: str
    url: str
    heading: str
    text: str


def tokenize(text: str) -> list[str]:
    return [t for t in TOKEN.findall(text.lower()) if t not in STOP]


def _parse(path: Path) -> list[Chunk]:
    raw = path.read_text(encoding="utf-8")
    meta: dict[str, str] = {}
    body = raw
    if raw.startswith("---"):
        _, front, body = raw.split("---", 2)
        for line in front.strip().splitlines():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    chunks = []
    for i, section in enumerate(re.split(r"^## ", body, flags=re.M)):
        section = section.strip()
        if not section:
            continue
        heading, _, text = section.partition("\n")
        chunks.append(Chunk(id=f"{path.stem}#{i}", title=meta.get("title", path.stem),
                            publisher=meta.get("publisher", ""), url=meta.get("url", ""),
                            heading=heading.strip(), text=text.strip()))
    return chunks


@lru_cache
def load_chunks(directory: str = str(KNOWLEDGE_DIR)) -> tuple[Chunk, ...]:
    return tuple(c for p in sorted(Path(directory).glob("*.md")) for c in _parse(p))


def search(query: str, k: int = 4, chunks: tuple[Chunk, ...] | None = None) -> list[Chunk]:
    chunks = chunks if chunks is not None else load_chunks()
    docs = [tokenize(f"{c.title} {c.heading} {c.heading} {c.text}") for c in chunks]
    if not docs:
        return []
    n = len(docs)
    avgdl = sum(len(d) for d in docs) / n
    df = Counter(t for d in docs for t in set(d))
    q = tokenize(query)
    scores = []
    for chunk, doc in zip(chunks, docs, strict=True):
        tf = Counter(doc)
        s = 0.0
        for term in q:
            if term not in tf:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            s += idf * tf[term] * 2.2 / (tf[term] + 1.2 * (0.25 + 0.75 * len(doc) / avgdl))
        if s > 0:
            scores.append((s, chunk))
    scores.sort(key=lambda x: -x[0])
    return [c for _, c in scores[:k]]
