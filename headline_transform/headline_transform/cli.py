#!/usr/bin/env python3
import argparse
import asyncio
import json
import sys
from typing import Optional

from headline_transform.llm_providers import get_provider
from headline_transform.llm_providers.base import LLM
from headline_transform.schemas import HeadlineResponse, LLMProvider
from headline_transform.services import HeadlineTransformService

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
    # Get and instantiate the primary provider
    primary_type = LLMProvider(provider)
    primary_class = get_provider(primary_type)
    primary: LLM = primary_class()
    
    # Create fallback provider if specified
    secondary = None
    if fallback_provider:
        secondary_type = LLMProvider(fallback_provider)
        secondary_class = get_provider(secondary_type)
        secondary: LLM = secondary_class()
    
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

def run_async_main():
    """
    Wrapper function to handle the async execution.
    """
    try:
        return asyncio.run(main())
    except Exception as e:
        raise

if __name__ == "__main__":
    run_async_main()