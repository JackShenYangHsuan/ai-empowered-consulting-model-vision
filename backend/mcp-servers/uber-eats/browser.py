from typing import Awaitable, Callable
from browser_use import Agent
from browser_use.browser.session import BrowserSession
from browser_use.llm.openai.chat import ChatOpenAI
from dotenv import load_dotenv
import warnings

load_dotenv()

warnings.filterwarnings("ignore")

llm = ChatOpenAI(model="gpt-4o")

task_template = """
perform the following task
{task}
"""

async def run_browser_agent(task: str, on_step: Callable[[], Awaitable[None]]):
    """Run the browser-use agent with the specified task."""

    # Create a browser session with Chrome configuration
    browser_session = BrowserSession(
        executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless=False,  # Run in visible mode so you can see what's happening
        disable_security=True,  # Disable security features that might interfere
    )

    agent = Agent(
        task=task_template.format(task=task),
        browser_session=browser_session,
        llm=llm,
        register_new_step_callback=on_step,
        register_done_callback=on_step,
        max_steps=50,  # Increase max steps
        max_actions_per_step=20,  # Allow more actions per step
    )

    result = await agent.run()

    # Stop the browser session
    await browser_session.stop()

    return result.final_result()
