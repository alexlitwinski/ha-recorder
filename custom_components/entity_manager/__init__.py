"""Entity Manager integration for Home Assistant."""
import logging
import os
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import voluptuous as vol

from homeassistant.components.recorder import get_instance, purge
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry
from homeassistant.helpers.device_registry import async_get as async_get_device_registry
from homeassistant.exceptions import HomeAssistantError
from homeassistant.components.http import StaticPathConfig

from .const import (
    DOMAIN,
    CONFIG_FILE,
    DEFAULT_RECORDER_DAYS,
    SERVICE_UPDATE_ENTITY_STATE,
    SERVICE_UPDATE_RECORDER_DAYS,
    SERVICE_BULK_UPDATE,
    SERVICE_PURGE_RECORDER,
    SERVICE_RELOAD_CONFIG,
    ATTR_ENTITY_ID,
    ATTR_ENTITY_IDS,
    ATTR_ENABLED,
    ATTR_RECORDER_DAYS,
    ATTR_FORCE_PURGE,
    EVENT_ENTITY_MANAGER_UPDATED,
)
from .api import setup_api

_LOGGER = logging.getLogger(__name__)

# Service schemas
UPDATE_ENTITY_STATE_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_ID): cv.entity_id,
    vol.Required(ATTR_ENABLED): bool,
})

UPDATE_RECORDER_DAYS_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_ID): cv.entity_id,
    vol.Required(ATTR_RECORDER_DAYS): vol.All(int, vol.Range(min=0)),
})

BULK_UPDATE_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_IDS): cv.entity_ids,
    vol.Optional(ATTR_ENABLED): bool,
    vol.Optional(ATTR_RECORDER_DAYS): vol.All(int, vol.Range(min=0)),
})

PURGE_RECORDER_SCHEMA = vol.Schema({
    vol.Optional(ATTR_ENTITY_IDS): cv.entity_ids,
    vol.Optional(ATTR_FORCE_PURGE, default=False): bool,
})


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Entity Manager from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    
    # Initialize the entity manager
    manager = EntityManager(hass)
    hass.data[DOMAIN] = manager
    
    # Load configuration
    await manager.load_config()
    
    # Register services
    await _register_services(hass, manager)
    
    # Setup API views
    setup_api(hass)
    
    # Register the custom card (usando API assíncrona correta)
    await _register_frontend_resources(hass)
    
    # Setup sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    
    return True


async def _register_frontend_resources(hass: HomeAssistant):
    """Register frontend resources for the custom card."""
    try:
        # Usar a API assíncrona correta para registrar recursos estáticos
        card_path = hass.config.path("custom_components", DOMAIN, "entity-manager-card-final.js")
        
        # Verificar se o arquivo existe
        if os.path.exists(card_path):
            await hass.http.async_register_static_paths([
                StaticPathConfig(
                    "/local/entity-manager-card-final.js",
                    card_path,
                    False
                )
            ])
            _LOGGER.info("Frontend resources registered successfully via async API")
        else:
            _LOGGER.warning("Card file not found: %s", card_path)
            
    except Exception as e:
        _LOGGER.error("Error registering frontend resources: %s", e)
        # Fallback para método antigo se necessário
        try:
            from homeassistant.components.frontend import add_extra_js_url
            add_extra_js_url(hass, "/local/entity-manager-card-final.js")
            _LOGGER.info("Frontend resources registered via fallback method")
        except Exception as fallback_error:
            _LOGGER.error("Fallback registration also failed: %s", fallback_error)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Entity Manager config entry."""
    # Unload platforms
    unload_ok = await hass.config_entries.async_unload_platforms(entry, ["sensor"])
    
    if unload_ok:
        hass.data.pop(DOMAIN, None)
    
    return unload_ok


async def _register_services(hass: HomeAssistant, manager: "EntityManager"):
    """Register Entity Manager services."""
    
    async def update_entity_state(call: ServiceCall):
        """Update entity enabled state."""
        entity_id = call.data[ATTR_ENTITY_ID]
        enabled = call.data[ATTR_ENABLED]
        await manager.update_entity_state(entity_id, enabled)
    
    async def update_recorder_days(call: ServiceCall):
        """Update entity recorder days."""
        entity_id = call.data[ATTR_ENTITY_ID]
        recorder_days = call.data[ATTR_RECORDER_DAYS]
        await manager.update_recorder_days(entity_id, recorder_days)
    
    async def bulk_update(call: ServiceCall):
        """Bulk update entities."""
        entity_ids = call.data[ATTR_ENTITY_IDS]
        enabled = call.data.get(ATTR_ENABLED)
        recorder_days = call.data.get(ATTR_RECORDER_DAYS)
        await manager.bulk_update(entity_ids, enabled, recorder_days)
    
    async def purge_recorder(call: ServiceCall):
        """Purge recorder data."""
        entity_ids = call.data.get(ATTR_ENTITY_IDS)
        force_purge = call.data[ATTR_FORCE_PURGE]
        await manager.purge_recorder(entity_ids, force_purge)
    
    async def reload_config(call: ServiceCall):
        """Reload configuration."""
        await manager.load_config()
    
    # Register services
    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_ENTITY_STATE,
        update_entity_state,
        schema=UPDATE_ENTITY_STATE_SCHEMA,
    )
    
    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_RECORDER_DAYS,
        update_recorder_days,
        schema=UPDATE_RECORDER_DAYS_SCHEMA,
    )
    
    hass.services.async_register(
        DOMAIN,
        SERVICE_BULK_UPDATE,
        bulk_update,
        schema=BULK_UPDATE_SCHEMA,
    )
    
    hass.services.async_register(
        DOMAIN,
        SERVICE_PURGE_RECORDER,
        purge_recorder,
        schema=PURGE_RECORDER_SCHEMA,
    )
    
    hass.services.async_register(
        DOMAIN,
        SERVICE_RELOAD_CONFIG,
        reload_config,
    )


class EntityManager:
    """Entity Manager class."""
    
    def __init__(self, hass: HomeAssistant):
        """Initialize Entity Manager."""
        self.hass = hass
        self._config: Dict[str, Any] = {}
        self._config_path = hass.config.path("custom_components", DOMAIN, CONFIG_FILE)
    
    async def load_config(self):
        """Load configuration from file."""
        try:
            if os.path.exists(self._config_path):
                with open(self._config_path, 'r', encoding='utf-8') as f:
                    self._config = json.load(f)
            else:
                self._config = {}
            _LOGGER.info("Configuration loaded successfully")
        except Exception as e:
            _LOGGER.error("Error loading configuration: %s", e)
            self._config = {}
    
    async def save_config(self):
        """Save configuration to file."""
        try:
            os.makedirs(os.path.dirname(self._config_path), exist_ok=True)
            with open(self._config_path, 'w', encoding='utf-8') as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
            _LOGGER.info("Configuration saved successfully")
        except Exception as e:
            _LOGGER.error("Error saving configuration: %s", e)
    
    def get_entity_config(self, entity_id: str) -> Dict[str, Any]:
        """Get entity configuration."""
        return self._config.get(entity_id, {
            "enabled": True,
            "recorder_days": DEFAULT_RECORDER_DAYS
        })
    
    async def update_entity_state(self, entity_id: str, enabled: bool):
        """Update entity enabled state."""
        entity_registry = await async_get_entity_registry(self.hass)
        
        try:
            entity_registry.async_update_entity(
                entity_id,
                disabled_by=None if enabled else "user"
            )
            
            # Update config
            if entity_id not in self._config:
                self._config[entity_id] = {"recorder_days": DEFAULT_RECORDER_DAYS}
            self._config[entity_id]["enabled"] = enabled
            
            await self.save_config()
            
            # Fire event
            self.hass.bus.async_fire(EVENT_ENTITY_MANAGER_UPDATED, {
                "entity_id": entity_id,
                "enabled": enabled
            })
            
            _LOGGER.info("Updated entity %s state to %s", entity_id, enabled)
            
        except Exception as e:
            _LOGGER.error("Error updating entity %s state: %s", entity_id, e)
            raise HomeAssistantError(f"Error updating entity state: {e}")
    
    async def update_recorder_days(self, entity_id: str, recorder_days: int):
        """Update entity recorder days."""
        try:
            # Update config
            if entity_id not in self._config:
                self._config[entity_id] = {"enabled": True}
            self._config[entity_id]["recorder_days"] = recorder_days
            
            await self.save_config()
            
            # Fire event
            self.hass.bus.async_fire(EVENT_ENTITY_MANAGER_UPDATED, {
                "entity_id": entity_id,
                "recorder_days": recorder_days
            })
            
            _LOGGER.info("Updated entity %s recorder days to %d", entity_id, recorder_days)
            
        except Exception as e:
            _LOGGER.error("Error updating entity %s recorder days: %s", entity_id, e)
            raise HomeAssistantError(f"Error updating recorder days: {e}")
    
    async def bulk_update(self, entity_ids: List[str], enabled: Optional[bool] = None, 
                         recorder_days: Optional[int] = None):
        """Bulk update entities."""
        try:
            entity_registry = await async_get_entity_registry(self.hass)
            
            for entity_id in entity_ids:
                # Update entity state if provided
                if enabled is not None:
                    entity_registry.async_update_entity(
                        entity_id,
                        disabled_by=None if enabled else "user"
                    )
                
                # Update config
                if entity_id not in self._config:
                    self._config[entity_id] = {
                        "enabled": True,
                        "recorder_days": DEFAULT_RECORDER_DAYS
                    }
                
                if enabled is not None:
                    self._config[entity_id]["enabled"] = enabled
                if recorder_days is not None:
                    self._config[entity_id]["recorder_days"] = recorder_days
            
            await self.save_config()
            
            # Fire event
            self.hass.bus.async_fire(EVENT_ENTITY_MANAGER_UPDATED, {
                "entity_ids": entity_ids,
                "bulk_update": True
            })
            
            _LOGGER.info("Bulk updated %d entities", len(entity_ids))
            
        except Exception as e:
            _LOGGER.error("Error in bulk update: %s", e)
            raise HomeAssistantError(f"Error in bulk update: {e}")
    
    async def purge_recorder(self, entity_ids: Optional[List[str]] = None, force_purge: bool = False):
        """Purge recorder data based on entity configurations."""
        try:
            recorder_instance = get_instance(self.hass)
            if not recorder_instance:
                raise HomeAssistantError("Recorder not available")
            
            entities_to_purge = entity_ids or list(self._config.keys())
            
            for entity_id in entities_to_purge:
                config = self.get_entity_config(entity_id)
                recorder_days = config.get("recorder_days", DEFAULT_RECORDER_DAYS)
                
                if recorder_days == 0 and not force_purge:
                    _LOGGER.info("Skipping purge for %s (recorder_days=0, force_purge=False)", entity_id)
                    continue
                
                if recorder_days > 0:
                    purge_date = datetime.now() - timedelta(days=recorder_days)
                else:
                    # If recorder_days is 0 and force_purge is True, purge all
                    purge_date = datetime.now()
                
                await recorder_instance.async_add_executor_job(
                    purge.purge_old_data,
                    recorder_instance,
                    purge_date,
                    repack=False,
                    apply_filter=True,
                    entity_ids=[entity_id]
                )
                
                _LOGGER.info("Purged data for %s before %s", entity_id, purge_date)
            
            _LOGGER.info("Recorder purge completed for %d entities", len(entities_to_purge))
            
        except Exception as e:
            _LOGGER.error("Error purging recorder: %s", e)
            raise HomeAssistantError(f"Error purging recorder: {e}")
    
    async def get_all_entities(self) -> List[Dict[str, Any]]:
        """Get all entities with their configurations."""
        entity_registry = await async_get_entity_registry(self.hass)
        entities = []
        
        for entity in entity_registry.entities.values():
            config = self.get_entity_config(entity.entity_id)
            state = self.hass.states.get(entity.entity_id)
            
            # Determinar o estado real
            if state is None:
                entity_state = "not_provided"
            elif state.state == "unavailable":
                entity_state = "unavailable"
            else:
                entity_state = state.state
            
            entities.append({
                "entity_id": entity.entity_id,
                "name": entity.name or entity.entity_id,
                "domain": entity.domain,
                "platform": entity.platform,
                "enabled": not bool(entity.disabled_by),
                "state": entity_state,
                "attributes": dict(state.attributes) if state else {},
                "recorder_days": config.get("recorder_days", DEFAULT_RECORDER_DAYS),
            })
        
        return sorted(entities, key=lambda x: x["entity_id"])
