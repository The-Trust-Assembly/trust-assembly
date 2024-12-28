import openai
import os

from headline_transform.llm_providers import register_provider
from headline_transform.llm_providers.base import LLM
from headline_transform.schemas import LLMProvider

@register_provider(LLMProvider.OPENAI)
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