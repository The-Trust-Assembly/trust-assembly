from .base import LLM
from headline_transform.schemas import LLMProvider
from headline_transform.llm_providers import register_provider

@register_provider(LLMProvider.TEST)
class TestLLM(LLM):
    provider_type = LLMProvider.TEST

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        return f"TEST : {user_prompt}"