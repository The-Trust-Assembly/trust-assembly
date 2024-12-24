import asyncio
import httpx
from enum import Enum

class ProviderType(str, Enum):
    OPENAI = "openai"
    TEST = "test"

# Uses openai API to transform given headline in style of given author
# "test" provider can be used for testing purposes so as not to incur API costs,
# it will return the original headline with "TEST : " prepended

async def test_headline_transform():
    # Create an async client
    async with httpx.AsyncClient() as client:
        # Prepare the request
        test_data = {
            "headline": "Scientists discover new deep-sea creatures",
            "author": "Scott Alexander",
            "body": "Marine biologists discovered several new species...",
            "provider": "test"  # "openai" or "test"
        }

        # Send POST request to API
        response = await client.post(
            "http://localhost:8000/transform-headline",
            json=test_data
        )

        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")

# Run the test
if __name__ == "__main__":
    asyncio.run(test_headline_transform())