from typing import Optional
from headline_transform.llm_providers.base import LLM
from headline_transform.schemas import LLMProvider

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