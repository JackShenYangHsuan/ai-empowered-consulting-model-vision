#!/usr/bin/env python3
"""
Standalone worker script for running browser automation searches.
This runs as an independent process and saves results to disk.
"""
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
from browser import run_browser_agent

# Results directory
RESULTS_DIR = Path(__file__).parent / "search_results"
RESULTS_DIR.mkdir(exist_ok=True)

def save_result_to_disk(request_id: str, result: str):
    """Save search result to disk as JSON file."""
    try:
        result_file = RESULTS_DIR / f"{request_id}.json"
        data = {
            "request_id": request_id,
            "result": result,
            "timestamp": datetime.now().isoformat(),
            "status": "completed" if not result.startswith("Error") and not result.startswith("Search was cancelled") else "error"
        }
        with open(result_file, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"✅ Saved result to disk: {result_file}", flush=True)
    except Exception as e:
        print(f"❌ Error saving result to disk: {e}", flush=True)

async def run_search(request_id: str, task: str):
    """Run the browser search and save results."""
    try:
        step_count = 0

        async def step_handler(*args, **kwargs):
            nonlocal step_count
            step_count += 1
            print(f"📍 Step {step_count} completed", flush=True)

        print(f"🔍 Starting browser automation for request {request_id}", flush=True)
        result = await run_browser_agent(task=task, on_step=step_handler)

        # Save to disk
        save_result_to_disk(request_id, result)

        print(f"✅ Search completed for request {request_id}", flush=True)
        print(f"📊 Results:\n{result[:200]}...", flush=True)

    except asyncio.CancelledError:
        error_msg = "Search was cancelled due to timeout. Please try again with a simpler search or address."
        save_result_to_disk(request_id, error_msg)
        print(f"⚠️ Search cancelled for request {request_id}", flush=True)

    except Exception as e:
        error_msg = f"Error: {str(e)}"
        save_result_to_disk(request_id, error_msg)
        print(f"❌ Search error for request {request_id}: {str(e)}", flush=True)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: search_worker.py <request_id> <task_json>", flush=True)
        sys.exit(1)

    request_id = sys.argv[1]
    task = sys.argv[2]

    print(f"🚀 Worker started for request {request_id}", flush=True)

    # Run the search
    asyncio.run(run_search(request_id, task))

    print(f"🏁 Worker finished for request {request_id}", flush=True)
