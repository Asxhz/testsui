"""Parallel embedding generation for fast vector DB population."""

import json
import sqlite3
import time
import multiprocessing as mp
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

DB_PATH = "actuaryai.db"
VECTOR_DB_PATH = "vector_db"
COLLECTION_NAME = "markets"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
NUM_WORKERS = 10
BATCH_SIZE = 500


def load_markets():
    """Load all active markets from SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute("SELECT id, question, description, data FROM markets WHERE active = 1")
    rows = cursor.fetchall()
    conn.close()
    print(f"Loaded {len(rows)} active markets")
    return rows


def generate_text(row):
    """Generate embedding text from market row."""
    mid, question, description, _ = row
    parts = [question]
    if description:
        parts.append(description)
    return mid, " ".join(parts)


def embed_chunk(args):
    """Worker: embed a chunk of markets."""
    chunk_id, texts_with_ids = args
    model = SentenceTransformer(EMBEDDING_MODEL)

    ids = [t[0] for t in texts_with_ids]
    texts = [t[1] for t in texts_with_ids]

    print(f"  Worker {chunk_id}: embedding {len(texts)} markets...")
    embeddings = model.encode(texts, show_progress_bar=False, batch_size=256)

    print(f"  Worker {chunk_id}: done")
    return chunk_id, ids, texts, embeddings.tolist()


def main():
    start = time.time()

    # Load markets
    rows = load_markets()
    texts_with_ids = [generate_text(r) for r in rows]

    # Parse market data for metadata
    market_data = {}
    for row in rows:
        mid = row[0]
        data = json.loads(row[3])
        market_data[mid] = {
            "question": data.get("question", ""),
            "liquidity": data.get("liquidity", 0.0) or 0.0,
            "volume": data.get("volume", 0.0) or 0.0,
            "active": True,
        }

    # Split into chunks for parallel processing
    chunk_size = len(texts_with_ids) // NUM_WORKERS
    chunks = []
    for i in range(NUM_WORKERS):
        start_idx = i * chunk_size
        end_idx = start_idx + chunk_size if i < NUM_WORKERS - 1 else len(texts_with_ids)
        chunks.append((i, texts_with_ids[start_idx:end_idx]))

    print(f"Split into {len(chunks)} chunks for {NUM_WORKERS} workers")
    print(f"Chunk sizes: {[len(c[1]) for c in chunks]}")

    # Generate embeddings in parallel
    print("\nGenerating embeddings in parallel...")
    embed_start = time.time()

    with mp.Pool(NUM_WORKERS) as pool:
        results = pool.map(embed_chunk, chunks)

    embed_time = time.time() - embed_start
    print(f"\nEmbedding generation complete in {embed_time:.1f}s")

    # Write to ChromaDB sequentially
    print("\nWriting to ChromaDB...")
    write_start = time.time()

    client = chromadb.PersistentClient(
        path=VECTOR_DB_PATH,
        settings=ChromaSettings(anonymized_telemetry=False, allow_reset=True),
    )
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"description": "Polymarket markets with semantic embeddings"},
    )

    total_written = 0
    for chunk_id, ids, texts, embeddings in sorted(results, key=lambda x: x[0]):
        # Write in sub-batches to avoid memory issues
        sub_batch = 5000
        for i in range(0, len(ids), sub_batch):
            batch_ids = ids[i:i + sub_batch]
            batch_texts = texts[i:i + sub_batch]
            batch_embeddings = embeddings[i:i + sub_batch]
            batch_metadatas = [market_data[mid] for mid in batch_ids]

            collection.upsert(
                ids=batch_ids,
                embeddings=batch_embeddings,
                documents=batch_texts,
                metadatas=batch_metadatas,
            )
            total_written += len(batch_ids)
            print(f"  Written {total_written}/{len(texts_with_ids)} vectors")

    write_time = time.time() - write_start
    total_time = time.time() - start

    print(f"\nDone!")
    print(f"  Total vectors: {collection.count()}")
    print(f"  Embedding time: {embed_time:.1f}s")
    print(f"  Write time: {write_time:.1f}s")
    print(f"  Total time: {total_time:.1f}s")


if __name__ == "__main__":
    mp.set_start_method("spawn")
    main()
