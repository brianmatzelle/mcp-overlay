"""
Base provider class for content streaming sources.
"""

from abc import ABC, abstractmethod
from typing import List, Optional


class ContentProvider(ABC):
    """Base class for content streaming providers"""

    def __init__(self):
        self.name = "Base Provider"
        self.content_type = "unknown"
        self.base_url = ""

    @abstractmethod
    async def search(self, query: str) -> List[dict]:
        """Search for content matching the query."""
        pass

    @abstractmethod
    async def get_stream_info(self, content_url: str) -> Optional[dict]:
        """Extract stream information from content page URL."""
        pass

    def can_handle_url(self, url: str) -> bool:
        """Check if this provider can handle the given URL."""
        return self.base_url in url
