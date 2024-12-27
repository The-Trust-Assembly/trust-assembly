from abc import ABC, abstractmethod
import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum, auto
import openai
import os
from typing import Dict, Optional, Type

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
    provider_type: LLMProvider = None

    @abstractmethod
    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        pass

class TestLLM(LLM):
    provider_type = LLMProvider.TEST

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        return f"TEST : {user_prompt}"

class OpenAILLM(LLM):
    provider_type = LLMProvider.OPENAI

    def __init__(self):
        openai.api_key = os.getenv("OPENAI_API_KEY")
        self.client = openai.AsyncOpenAI()

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system", 
                        "content": system_prompt
                    },
                    {
                        "role": "user", 
                        "content": user_prompt
                    } 
                ]
            )

            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Error in generate: {str(e)}")
            return user_prompt  # Return original input if generation fails

class HeadlineTransformService:
    def __init__(self, provider: LLM, fallback_provider: Optional[LLM] = None):
        self.provider: LLM = provider
        self.fallback_provider: LLM = fallback_provider
        
    async def transform_headline(
        self, 
        headline: str, 
        author: str, 
        body: str
    ) -> tuple[str, LLMProvider]:
        system_prompt: str = """You are an expert in writing headlines in the style of different authors.
                            Rewrite the the headline provided to you in the style of the given author, while keeping the same meaning.
                            Use the article body for context. Output only the transformed headline, nothing else."""
        
        user_prompt: str = f"""Original headline: {headline}

                            Author style to mimic: {author}

                            Article body:
                            {body}"""

        try:
            result = await self.provider.generate(system_prompt, user_prompt)
            return result, self.provider.provider_type
        except Exception as e:
            if self.fallback_provider:
                result = await self.fallback_provider.generate(system_prompt, user_prompt)
                return result, self.fallback_provider.provider_type
            raise e

service = HeadlineTransformService(OpenAILLM())
async def transform_headline(request: HeadlineRequest) -> HeadlineResponse:
    transformed, provider_used = await service.transform_headline(
        request.headline,
        request.author,
        request.body
    )
    
    return HeadlineResponse(
        original_headline=request.headline,
        transformed_headline=transformed,
        provider_used=provider_used
    )