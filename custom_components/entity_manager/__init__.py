"""Entity Manager integration for Home Assistant."""
import logging
import os
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry, EntityRegistry
from homeassistant.helpers.device_registry import async_get as async_get_device_registry, DeviceRegistry
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN, CONFIG_FILE, DEFAULT_RECORDER_DAYS
from .api import setup_api

_LOGGER = logging.getLogger(__name__)

# Schemas e setup de serviços (sem alterações significativas)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Entity Manager from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    manager = EntityManager(hass)
    hass.data[DOMAIN] = manager
    await manager.load_config()
    # Registra os serviços aqui (código omitido por brevidade, use o seu original)
    setup_api(hass)
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    return True

class EntityManager:
    """Entity Manager class."""

    def __init__(self, hass: HomeAssistant):
        """Initialize Entity Manager."""
        self.hass = hass
        self._config: Dict[str, Any] = {}
        self._config_path = hass.config.path("custom_components", DOMAIN, CONFIG_FILE)

    def _load_config_sync(self) -> Dict[str, Any]:
        """Loads the config file synchronously."""
        if not os.path.exists(self._config_path):
            return {}
        try:
            with open(self._config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            _LOGGER.error("Could not read or decode entity manager config file: %s", e)
            return {}

    def _save_config_sync(self) -> None:
        """Saves the config file synchronously."""
        try:
            os.makedirs(os.path.dirname(self._config_path), exist_ok=True)
            with open(self._config_path, 'w', encoding='utf-8') as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
        except IOError as e:
            _LOGGER.error("Could not write to entity manager config file: %s", e)

    async def load_config(self):
        """Load configuration from file asynchronously."""
        self._config = await self.hass.async_add_executor_job(self._load_config_sync)
        _LOGGER.info("Entity Manager configuration loaded.")

    async def save_config(self):
        """Save configuration to file asynchronously."""
        await self.hass.async_add_executor_job(self._save_config_sync)

    async def get_all_entities(self) -> List[Dict[str, Any]]:
        """Get all entities with their configurations and integration info."""
        try:
            entity_registry: EntityRegistry = async_get_entity_registry(self.hass)
            device_registry: DeviceRegistry = async_get_device_registry(self.hass)
            all_states = self.hass.states.async_all()
            entities = []

            for state in all_states:
                entity_id = state.entity_id
                entity_entry = entity_registry.async_get(entity_id)
                config = self._config.get(entity_id, {})
                
                integration_domain = "homeassistant"
                if entity_entry:
                    is_enabled = not entity_entry.disabled_by
                    platform = entity_entry.platform
                    if entity_entry.config_entry_id:
                        config_entry = self.hass.config_entries.async_get_entry(entity_entry.config_entry_id)
                        if config_entry:
                            integration_domain = config_entry.domain
                else:
                    is_enabled = config.get("enabled", True)
                    platform = "unknown"

                entities.append({
                    "entity_id": entity_id,
                    "name": state.name,
                    "state": state.state,
                    "domain": state.domain,
                    "platform": platform,
                    "integration_domain": integration_domain,
                    "enabled": is_enabled,
                    "recorder_days": config.get("recorder_days", DEFAULT_RECORDER_DAYS),
                })
            return entities
        except Exception as e:
            _LOGGER.error("Critical error in get_all_entities: %s", e, exc_info=True)
            return [] # Retorna lista vazia em caso de erro crítico
            
    # Inclua aqui as outras funções da sua classe EntityManager (delete_entity, etc.)