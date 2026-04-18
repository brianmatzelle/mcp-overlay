"""
Provider registry and lookup functions.
"""

from typing import List, Optional

from .base import ContentProvider
from .crackstreams import CrackStreamsProvider

PROVIDERS: List[ContentProvider] = [
    CrackStreamsProvider(),
]


def get_provider_by_url(url: str) -> Optional[ContentProvider]:
    """Find the appropriate provider for a given URL."""
    for provider in PROVIDERS:
        if provider.can_handle_url(url):
            return provider
    return None


def get_providers_by_type(content_type: str) -> List[ContentProvider]:
    """Get all providers that handle a specific content type."""
    if content_type == "all":
        return PROVIDERS
    return [p for p in PROVIDERS if p.content_type == content_type]


def get_all_providers() -> List[ContentProvider]:
    """Get all registered providers."""
    return PROVIDERS
