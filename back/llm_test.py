import asyncio
import httpx
from enum import Enum

# First, ensure your FastAPI server is running
# It typically runs on http://localhost:8000 by default

class ProviderType(str, Enum):
    OPENAI = "openai"
    TEST = "test"

async def test_headline_transform():
    # Create an async client
    async with httpx.AsyncClient() as client:
        # Prepare the request data
        test_data = {
            "headline": "Scientists discover new deep-sea creatures",
            "author": "Scott Alexander",
            "body": "Marine biologists discovered several new species...",
            "provider": "openai"  # "openai" or "test"
        }

        # Send the request to your API
        response = await client.post(
            "http://localhost:8000/transform-headline",
            json=test_data
        )

        # Print the results
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")

# Run the test
if __name__ == "__main__":
    asyncio.run(test_headline_transform())