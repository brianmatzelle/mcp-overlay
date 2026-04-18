"""
CrackStreams provider for sports streaming.
"""

import httpx
import json
import re
from typing import List, Optional
from bs4 import BeautifulSoup

from .base import ContentProvider
from config import USER_AGENT, HTTP_TIMEOUT


class CrackStreamsProvider(ContentProvider):
    """Provider for CrackStreams sports streaming"""

    def __init__(self):
        super().__init__()
        self.name = "CrackStreams"
        self.content_type = "sports"
        self.base_url = "crackstreams.ms"
        self.leagues = [
            ('nflstreams', 'NFL'),
            ('ncaa', 'NCAA'),
            ('nbaregular', 'NBA'),
            ('nhlstreams', 'NHL'),
            ('mmastreams', 'UFC/MMA'),
            ('boxingcasino', 'Boxing'),
            ('wwestreams', 'WWE'),
            ('mlbwildcard', 'MLB'),
        ]

    async def search(self, query: str) -> List[dict]:
        """Search CrackStreams for sports games matching the query"""
        headers = {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }

        query_lower = query.lower()
        results = []

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            for league_slug, league_name in self.leagues:
                try:
                    url = f"https://{self.base_url}/league/{league_slug}"
                    response = await client.get(url, headers=headers, follow_redirects=True)
                    soup = BeautifulSoup(response.text, 'lxml')

                    game_links = soup.find_all('a', href=re.compile(r'/stream/'))

                    for link in game_links:
                        game_title = link.get_text(strip=True)
                        game_url = link.get('href', '')

                        if game_url.startswith('/'):
                            game_url = f"https://{self.base_url}{game_url}"

                        if query_lower:
                            if not any(word in game_title.lower() for word in query_lower.split()):
                                continue

                        time_text = ""
                        parent = link.parent
                        if parent:
                            time_elem = parent.find(text=re.compile(r'\d{1,2}:\d{2}'))
                            if time_elem:
                                time_text = time_elem.strip()

                        if not any(r['url'] == game_url for r in results):
                            results.append({
                                'title': game_title,
                                'url': game_url,
                                'metadata': league_name,
                                'time': time_text,
                                'provider': self.name,
                            })

                except Exception as e:
                    print(f"Error scraping {league_name}: {e}")
                    continue

        return results

    async def get_stream_info(self, content_url: str) -> Optional[dict]:
        """Extract stream information from CrackStreams game page."""
        headers = {
            'User-Agent': USER_AGENT,
            'Referer': f'https://{self.base_url}/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }

        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                response = await client.get(content_url, headers=headers, follow_redirects=True)
                html_content = response.text

                match = re.search(r'const allStreams = (\[.*?\]);', html_content)
                if not match:
                    return None

                streams = json.loads(match.group(1))
                if not streams:
                    return None

                first_stream = streams[0]
                embed_url = first_stream.get('value', '')
                if not embed_url:
                    return None

                # watchlive.top embed
                embed_match = re.search(r'/embed/([^/]+)/(\d+)-\d+', embed_url)
                if embed_match:
                    return {
                        'embed_url': embed_url,
                        'channel': embed_match.group(2),
                        'sport': embed_match.group(1),
                        'source': 'watchlive',
                        'label': first_stream.get('label', 'Stream'),
                        'provider': self.name,
                    }

                # sharkstreams player
                shark_match = re.search(r'sharkstreams\.net/player\.php\?channel=(\d+)', embed_url)
                if shark_match:
                    return {
                        'embed_url': embed_url,
                        'channel': shark_match.group(1),
                        'sport': 'unknown',
                        'source': 'sharkstreams',
                        'label': first_stream.get('label', 'Stream'),
                        'provider': self.name,
                    }

                return None

        except Exception as e:
            print(f"Error scraping CrackStreams URL {content_url}: {e}")
            return None
