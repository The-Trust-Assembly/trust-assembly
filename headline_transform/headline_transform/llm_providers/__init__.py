from typing import Dict, Type
from headline_transform.llm_providers.base import LLM
from headline_transform.schemas import LLMProvider

# Dictionary to store provider implementations
_provider_registry: Dict[LLMProvider, Type[LLM]] = {}

def register_provider(provider_type: LLMProvider):
    """
    A decorator that registers LLM provider implementations.
    Allows providers to self-register when their modules are imported.
    Add @register_provider(LLMProvider.{PROVIDER_NAME}) above the class definition to register it.
    """
    def decorator(provider_class: Type[LLM]):
        _provider_registry[provider_type] = provider_class
        return provider_class
    return decorator

def get_provider(provider_type: LLMProvider) -> Type[LLM]:
    """
    Retrieves a provider implementation by its type.
    Raises KeyError if the provider type isn't registered.
    """
    if provider_type not in _provider_registry:
        raise KeyError(f"No provider registered for type: {provider_type}")
    return _provider_registry[provider_type]

# Import all provider implementations to ensure they're registered
from headline_transform.llm_providers import test, openai