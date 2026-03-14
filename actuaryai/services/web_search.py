"""Web search service using Browser Use SDK."""

import asyncio
import re
import time

from browser_use_sdk import AsyncBrowserUse

from actuaryai.config import Settings
from actuaryai.logger import get_logger

logger = get_logger(__name__)


class WebSearch:
    """Performs web searches using Browser Use cloud browser."""

    def __init__(self, settings: Settings):
        self.api_key = settings.browser_use_api_key
        logger.info("WebSearch initialized with Browser Use SDK")

    def _run_async(self, coro):
        """Run an async coroutine from sync context."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, coro)
                    return future.result(timeout=120)
            else:
                return loop.run_until_complete(coro)
        except RuntimeError:
            return asyncio.run(coro)

    def _parse_output(self, text: str) -> list[dict]:
        """Parse the Browser Use text output into structured results."""
        results = []
        if not text:
            return results

        # Split by numbered items (1. **Title**, 2. **Title**, etc.)
        blocks = re.split(r'\n\d+\.\s+\*\*', text)

        for block in blocks[1:]:  # Skip the preamble before first result
            title = ""
            description = ""
            url = ""

            # Extract title (everything before the first **)
            title_match = re.match(r'(.+?)\*\*', block)
            if title_match:
                title = title_match.group(1).strip()

            # Extract description
            desc_match = re.search(r'\*\*Description\*\*[:\s]*(.+?)(?:\n|$)', block)
            if desc_match:
                description = desc_match.group(1).strip()

            # Extract URL
            url_match = re.search(r'\*\*URL\*\*[:\s]*(https?://\S+)', block)
            if url_match:
                url = url_match.group(1).strip()

            if title:
                results.append({
                    "title": title,
                    "description": description,
                    "url": url,
                })

        return results

    async def _search_async(self, query: str, count: int = 5) -> list[dict]:
        """Perform a web search via Browser Use."""
        client = AsyncBrowserUse(api_key=self.api_key)

        task_prompt = (
            f"Go to Google and search for: {query}\n"
            f"Return the top {count} organic search results (skip ads). "
            f"For each result, provide the title, a brief description, and the URL. "
            f"Format each result as:\n"
            f"1. **Title**\n   - **Description**: ...\n   - **URL**: ..."
        )

        task = await client.tasks.create_task(task=task_prompt)
        result = await task.complete()

        if result.output:
            return self._parse_output(result.output)[:count]
        return []

    def search(self, query: str, count: int = 5, freshness: str = "pm") -> list[dict]:
        """Perform a web search via Browser Use.

        Args:
            query: Search query string
            count: Number of results to return
            freshness: Time filter (kept for API compatibility)
        """
        logger.debug(f"Searching for: {query} (count: {count})")
        try:
            results = self._run_async(self._search_async(query, count))
            logger.info(f"Search '{query}' returned {len(results)} results")
            return results
        except Exception as e:
            logger.error(f"Search failed for '{query}': {e}")
            return []

    def search_multiple(self, queries: list[str], delay: float = 1.0, freshness: str = "pm") -> dict[str, list[dict]]:
        """Perform multiple searches.

        Args:
            queries: List of search query strings
            delay: Delay in seconds between searches
            freshness: Time filter (kept for API compatibility)
        """
        logger.info(f"Starting {len(queries)} searches with {delay}s delay")
        all_results = {}
        for i, query in enumerate(queries):
            logger.debug(f"Search {i+1}/{len(queries)}: {query}")
            all_results[query] = self.search(query, freshness=freshness)
            if i < len(queries) - 1:
                time.sleep(delay)
        logger.info(f"Completed all {len(queries)} searches")
        return all_results

    def close(self):
        """Close the client."""
        logger.debug("Closing WebSearch client")
