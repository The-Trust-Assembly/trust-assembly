#!/usr/bin/env python3
from abc import ABC, abstractmethod
import argparse
import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum
import json
import openai
import os
import sys
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

def create_parser() -> argparse.ArgumentParser:
    """Create and configure the CLI argument parser"""
    parser = argparse.ArgumentParser(
        description="Transform headlines using different LLM providers"
    )
    
    # Add arguments for headline transformation
    parser.add_argument(
        "--headline", 
        required=True,
        help="The headline to transform"
    )
    parser.add_argument(
        "--author", 
        required=True,
        help="The author whose style to mimic"
    )
    parser.add_argument(
        "--body", 
        required=True,
        help="The article body for context"
    )
    parser.add_argument(
        "--provider",
        choices=[p.value for p in LLMProvider],
        default=LLMProvider.OPENAI.value,
        help="The LLM provider to use (default: openai)"
    )
    parser.add_argument(
        "--fallback-provider",
        choices=[p.value for p in LLMProvider],
        default=LLMProvider.TEST.value,
        help="The fallback LLM provider to use if primary fails (default: test)"
    )
    parser.add_argument(
        "--output-format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)"
    )
    
    return parser

def create_service(provider: str, fallback_provider: Optional[str] = None) -> HeadlineTransformService:
    """Create a HeadlineTransformService with the specified providers"""
    # Map provider types to their implementations
    provider_map: Dict[LLMProvider, Type[LLM]] = {
        LLMProvider.TEST: TestLLM,
        LLMProvider.OPENAI: OpenAILLM,
    }
    
    # Create primary provider
    primary = provider_map[LLMProvider(provider)]()
    
    # Create fallback provider if specified
    secondary = None
    if fallback_provider:
        secondary = provider_map[LLMProvider(fallback_provider)]()
    
    return HeadlineTransformService(primary, secondary)

async def main():
    """ CLI entry point """
    parser = create_parser()
    args = parser.parse_args()
    
    # Create the service with specified providers
    service = create_service(args.provider, args.fallback_provider)
    
    try:
        # Transform the headline
        transformed, provider_used = await service.transform_headline(
            args.headline,
            args.author,
            args.body
        )
        
        # Create response object
        response = HeadlineResponse(
            original_headline=args.headline,
            transformed_headline=transformed,
            provider_used=provider_used
        )
        
        # Output results in requested format
        if args.output_format == "json":
            print(json.dumps(response.__dict__))
        else:
            print(f"Original headline: {response.original_headline}")
            print(f"Transformed headline: {response.transformed_headline}")
            print(f"Provider used: {response.provider_used}")
            
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())