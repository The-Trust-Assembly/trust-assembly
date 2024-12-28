from abc import ABC, abstractmethod
from headline_transform.schemas import LLMProvider

class LLM(ABC):
    provider_type: LLMProvider = None

    @abstractmethod
    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        pass