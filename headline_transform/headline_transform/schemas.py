from dataclasses import dataclass
from enum import Enum

class LLMProvider(str, Enum):
    TEST = "test",
    OPENAI = "openai"

@dataclass
class HeadlineResponse():
    original_headline: str
    transformed_headline: str
    provider_used: LLMProvider  # Tell the client which provider was actually used
