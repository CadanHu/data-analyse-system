import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent))

from services.graph_rag_service import graph_rag_service
from database.knowledge_db import knowledge_db
import json

async def test_graph_rag_components():
    print("🚀 [Test] Starting GraphRAG Component Verification...")

    user_id = 999
    doc_id = "test_doc_123"

    # 1. Test Database Schema & Migration (implicitly by calling init_db)
    print("🏗️ [Test] Initializing DB...")
    await knowledge_db.init_db()
    print("✅ DB Initialized.")

    # 2. Test Community Saving with new fields
    print("💾 [Test] Saving mock communities (L0 and L2)...")
    mock_communities_l0 = [
        {
            "community_id": 1,
            "title": "Tech Stack",
            "summary": "Focuses on FastAPI and React.",
            "entity_texts": ["FastAPI", "React", "Python"],
            "size": 3,
            "key_findings": ["Uses modern web frameworks"],
            "impact_score": 8,
            "central_entities": ["FastAPI"]
        }
    ]
    mock_communities_l2 = [
        {
            "community_id": 101,
            "title": "General Architecture",
            "summary": "Overview of the entire system architecture.",
            "entity_texts": ["FastAPI", "React", "Mobile", "Database"],
            "size": 10,
            "key_findings": ["System is modular"],
            "impact_score": 9,
            "central_entities": ["Architecture"]
        }
    ]

    await knowledge_db.delete_communities(doc_id, user_id)
    await knowledge_db.save_communities(doc_id, user_id, mock_communities_l0, level=0)
    await knowledge_db.save_communities(doc_id, user_id, mock_communities_l2, level=2)
    print("✅ Mock communities saved.")

    # 3. Test get_communities with level
    print("🔎 [Test] Retrieving L2 communities...")
    comms = await knowledge_db.get_communities(user_id, level=2)
    assert len(comms) > 0
    assert comms[0]["level"] == 2
    assert comms[0]["title"] == "General Architecture"
    print(f"✅ L2 retrieval successful: {comms[0]['title']}")

    # 4. Test get_communities_for_entities
    print("🔎 [Test] Retrieving communities for 'FastAPI'...")
    matched = await knowledge_db.get_communities_for_entities(["FastAPI"], user_id, level=0)
    assert len(matched) > 0
    assert "FastAPI" in matched[0]["entity_texts"]
    print(f"✅ Community match for entities successful: {matched[0]['title']}")

    # 5. Test Global Search Context (Legacy Mode)
    print("🌐 [Test] Testing legacy global search context...")
    context = await graph_rag_service.global_search(user_id)
    assert "General Architecture" in context
    print("✅ Legacy global search context generated.")

    # Note: global_search_mapreduce requires actual LLM calls which might fail in test env
    # We will skip the actual LLM call but verify the method exists and handles missing data
    print("🌍 [Test] Testing global_search_mapreduce (no data case)...")
    empty_res = await graph_rag_service.global_search_mapreduce("What is the tech stack?", 888)
    assert "暂无" in empty_res
    print("✅ Map-Reduce handled empty data correctly.")

    print("🎉 [Test] GraphRAG components verified successfully!")

if __name__ == "__main__":
    asyncio.run(test_graph_rag_components())
