#!/usr/bin/env python3
import asyncio
import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP, Context

# Load environment variables from .env file
load_dotenv()

# Initialize FastMCP server
mcp = FastMCP("uber_eats")

# Persistent storage directory
RESULTS_DIR = Path(__file__).parent / "search_results"
RESULTS_DIR.mkdir(exist_ok=True)

# In-memory storage for search results (kept for backward compatibility)
search_results = {}

# Helper functions for persistent storage
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
        print(f"✅ Saved result to disk: {result_file}")
    except Exception as e:
        print(f"❌ Error saving result to disk: {e}")

def load_result_from_disk(request_id: str) -> str | None:
    """Load search result from disk."""
    try:
        result_file = RESULTS_DIR / f"{request_id}.json"
        if result_file.exists():
            with open(result_file, 'r') as f:
                data = json.load(f)
            print(f"✅ Loaded result from disk: {result_file}")
            return data.get("result")
        return None
    except Exception as e:
        print(f"❌ Error loading result from disk: {e}")
        return None

@mcp.tool()
async def find_menu_options(address: str, food_craving: str, context: Context) -> str:
    """Search Uber Eats for food options based on delivery address and what you're craving.

    Args:
        address: Delivery address (e.g., "123 Main St, New York, NY" or "Stockholm, Sweden")
        food_craving: What food you're craving (e.g., "pizza", "tacos", "sushi")
    """

    # Create the search task
    task = f"""
0. Start by going to: https://www.ubereats.com/
1. Look for the address/location input field (usually at the top of the page)
2. Click on the address field and clear any existing text
3. Type "{address}" and wait 2 seconds for autocomplete suggestions
4. Press Enter or click the first suggestion to set the delivery location
5. Wait 3 seconds for the page to load with restaurants for this location
6. Find the search bar for food/restaurants (usually near the top)
7. Type "{food_craving}" in the search bar and press Enter
8. Wait 3 seconds for search results to load
9. Scroll down to see more options if needed
10. Collect the following information for the top 10 items/dishes you find:
    - Restaurant name
    - Item/dish name
    - Price
    - Rating (if visible)
    - Delivery time estimate (if visible)
    - Direct URL to the item
11. Format the results as a clear list with all details for each of the 10 options
"""

    # Spawn independent worker process for the search
    worker_script = Path(__file__).parent / "search_worker.py"
    python_exe = sys.executable

    print(f"🚀 Spawning worker process for request {context.request_id}")

    # Start the worker process in the background (detached)
    process = subprocess.Popen(
        [python_exe, str(worker_script), context.request_id, task],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True  # Detach from parent process
    )

    print(f"✅ Worker process started with PID {process.pid}")
    await context.info(f"Search for '{food_craving}' at '{address}' started in background")

    # Store initial status
    initial_status = f"Search for '{food_craving}' at '{address}' is running. Check back in 2-3 minutes for results."
    search_results[context.request_id] = initial_status
    save_result_to_disk(context.request_id, initial_status)

    return f"Search started! Worker process (PID {process.pid}) is running the browser automation. Results will be available in 2-3 minutes at resource://search_results/{context.request_id}"

@mcp.resource(uri="resource://search_results/{request_id}")
async def get_search_results(request_id: str) -> str:
    """Get the search results for a given request ID.

    Args:
        request_id: The ID of the request to get the search results for
    """
    # First, try to load from disk (persistent storage)
    disk_result = load_result_from_disk(request_id)
    if disk_result is not None:
        print(f"📂 Retrieved result from disk for request {request_id}")
        return disk_result

    # Fall back to in-memory storage
    if request_id in search_results:
        print(f"💾 Retrieved result from memory for request {request_id}")
        return search_results[request_id]

    # No results found anywhere
    print(f"❌ No results found for request {request_id}")
    return f"No search results found for request ID: {request_id}"

@mcp.tool()
async def order_food(item_url: str, item_name: str, context: Context) -> str:
    """Order food from a restaurant.
    
    Args:
        restaurant_url: URL of the restaurant
        item_name: Name of the item to order
    """
    
    task = f"""
1. Go to {item_url}
2. Click "Add to order"
3. Wait 3 seconds
4. Click "Go to checkout"
5. If there are upsell modals, click "Skip"
6. Click "Place order"
"""
    
    # Start the background task for ordering
    asyncio.create_task(
        perform_order(item_url, item_name, task, context)
    )
    
    # Return a message immediately
    return f"Order for '{item_name}' started. Your order is being processed."

async def perform_order(restaurant_url: str, item_name: str, task: str, context: Context):
    """Perform the actual food ordering in the background."""
    try:
        step_count = 0
        
        async def step_handler(*args, **kwargs):
            nonlocal step_count
            step_count += 1
            await context.info(f"Order step {step_count} completed")
            await context.report_progress(step_count)
        
        result = await run_browser_agent(task=task, on_step=step_handler)
        
        # Report completion
        await context.info(f"Order for '{item_name}' has been placed successfully!")
        return result
    
    except Exception as e:
        error_msg = f"Error ordering '{item_name}': {str(e)}"
        await context.error(error_msg)
        return error_msg

if __name__ == "__main__":
    mcp.run(transport='stdio') 
