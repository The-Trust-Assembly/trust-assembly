from abc import ABC, abstractmethod
import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum, auto
from fastapi import FastAPI
import openai
import os
from typing import Dict, Optional, Type

app = FastAPI()

class LLMProvider(str, Enum):
    TEST = "test",
    OPENAI = "openai"

@dataclass
class HeadlineRequest():
    headline: str
    author: str
    body: str
    provider: LLMProvider = LLMProvider.OPENAI  # Default to OpenAI if not specified
    fallback_provider: Optional[LLMProvider] = LLMProvider.TEST  # Optional fallback provider

@dataclass
class HeadlineResponse():
    original_headline: str
    transformed_headline: str
    provider_used: LLMProvider  # Tell the client which provider was actually used

class LLM(ABC):
    @abstractmethod
    async def transform_headline(self, headline: str, author: str, body: str) -> str:
        pass

class TestLLM(LLM):
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def transform_headline(self, headline: str, author: str, body: str) -> str:
        return f"TEST : {headline}"

class OpenAILLM(LLM):
    def __init__(self):
        # Getting OpenAI API key from environment for now
        # Will be changed to a more secure method later
        openai.api_key = os.getenv("OPENAI_API_KEY")
        self.client = openai.AsyncOpenAI()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def transform_headline(self, headline: str, author: str, body: str) -> str:
        try:
            # Using GPT-4o-mini for now because it's cheap
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {   # Keep static content like instructions in beginning to allow prompt caching
                        "role": "developer", 
                        "content": """You are an expert in writing headlines in the style of different authors.
                                        Rewrite the the headline provided to you in the style of the given author, while keeping the same meaning.
                                        Use the article body for context. Output only the transformed headline, nothing else."""
                    },
                    {
                        "role": "user", 
                        "content":  f"""Original headline: {headline}

                                        Author style to mimic: {author}

                                        Article body:
                                        {body}"""
                    } 
                ]
            )

            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Error in transform_headline: {str(e)}")
            return headline  # Return original headline if transformation fails
        
# Factory for creating LLM provider instances
class LLMFactory:
    # Class variable to store provider mapping
    _providers: Dict[LLMProvider, Type[LLM]] = {
        LLMProvider.OPENAI: OpenAILLM,
        LLMProvider.TEST: TestLLM
    }
        
    # Class variable to store instances
    _instances: Dict[LLMProvider, LLM] = {}

    @classmethod
    def create(cls, provider: LLMProvider, reuse_instance: bool = True) -> LLM:
        """
        Create (or retrieve) an instance of the specified LLM provider.
        
        Args:
            provider: The type of LLM provider to create
            reuse_instance: If True, reuse existing instance if available
        
        Returns:
            An instance of the requested LLM provider
        
        Raises:
            ValueError: If the requested provider is not registered
        """
        if provider not in cls._providers:
            raise ValueError(f"Unsupported LLM provider: {provider}")

        # Reuse existing instance if requested and available
        if reuse_instance and provider in cls._instances:
            return cls._instances[provider]

        # Create new instance
        instance = cls._providers[provider]()
        
        # Store instance if reuse is enabled
        if reuse_instance:
            cls._instances[provider] = instance

        return instance
    
class HeadlineTransformService:
    def __init__(self):
        self.factory = LLMFactory()
        
    async def transform_headline(
        self, 
        headline: str, 
        author: str, 
        body: str, 
        provider: LLMProvider,
        fallback_provider: Optional[LLMProvider] = None
    ) -> tuple[str, LLMProvider]:
        """
        Transform a headline using the specified provider, falling back if needed.
        Returns both the transformed headline and which provider was actually used.
        """
        try:
            async with self.factory.create(provider, reuse_instance=True) as llm:
                result = await llm.transform_headline(headline, author, body)
                return result, provider
        except Exception as e:
            if fallback_provider:
                # Try fallback provider if primary fails
                async with self.factory.create(fallback_provider, reuse_instance=True) as llm:
                    result = await llm.transform_headline(headline, author, body)
                    return result, fallback_provider
            raise  # Re-raise if no fallback or fallback also failed


service = HeadlineTransformService()
@app.post("/transform-headline", response_model=HeadlineResponse)
async def transform_headline(request: HeadlineRequest) -> HeadlineResponse:
    transformed, provider_used = await service.transform_headline(
        request.headline,
        request.author,
        request.body,
        request.provider,
        request.fallback_provider
    )
    
    return HeadlineResponse(
        original_headline=request.headline,
        transformed_headline=transformed,
        provider_used=provider_used
    )