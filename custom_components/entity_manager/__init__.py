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
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN, 
    CONFIG_FILE, 
    DEFAULT_RECORDER_DAYS,
    SERVICE_UPDATE_ENTITY_STATE,
    SERVICE_UPDATE_RECORDER_DAYS,
    SERVICE_BULK_UPDATE,
    SERVICE_PURGE_RECORDER,
    SERVICE_RELOAD_CONFIG,
    SERVICE_DELETE_ENTITY,
    SERVICE_BULK_DELETE,
    ATTR_ENTITY_ID,
    ATTR_ENTITY_IDS,
    ATTR_ENABLED,
    ATTR_RECORDER_DAYS,
    ATTR_FORCE_PURGE,
)
from .api import setup_api

_LOGGER = logging.getLogger(__name__)

try:
    from homeassistant.helpers.entity_registry import RegistryEntryDisabler
    HAS_REGISTRY_ENTRY_DISABLER = True
except ImportError:
    HAS_REGISTRY_ENTRY_DISABLER = False

SERVICE_INTELLIGENT_PURGE = "intelligent_purge"
SERVICE_GENERATE_RECORDER_REPORT = "generate_recorder_report"
ATTR_LIMIT = "limit"
ATTR_DAYS_BACK = "days_back"

UPDATE_ENTITY_STATE_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_ID): cv.entity_id,
    vol.Required(ATTR_ENABLED): cv.boolean,
})

UPDATE_RECORDER_DAYS_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_ID): cv.entity_id,
    vol.Required(ATTR_RECORDER_DAYS): vol.All(int, vol.Range(min=0, max=365)),
})

BULK_UPDATE_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_IDS): cv.entity_ids,
    vol.Optional(ATTR_ENABLED): cv.boolean,
    vol.Optional(ATTR_RECORDER_DAYS): vol.All(int, vol.Range(min=0, max=365)),
})

DELETE_ENTITY_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_ID): cv.entity_id,
})

BULK_DELETE_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_IDS): cv.entity_ids,
})

PURGE_RECORDER_SCHEMA = vol.Schema({
    vol.Optional(ATTR_ENTITY_IDS): cv.entity_ids,
    vol.Optional(ATTR_FORCE_PURGE, default=False): cv.boolean,
})

INTELLIGENT_PURGE_SCHEMA = vol.Schema({
    vol.Optional(ATTR_FORCE_PURGE, default=False): cv.boolean,
})

GENERATE_RECORDER_REPORT_SCHEMA = vol.Schema({
    vol.Optional(ATTR_LIMIT, default=100): vol.All(int, vol.Range(min=1, max=1000)),
    vol.Optional(ATTR_DAYS_BACK, default=30): vol.All(int, vol.Range(min=1, max=365)),
})


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Entity Manager from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    manager = EntityManager(hass)
    hass.data[DOMAIN] = manager
    await manager.load_config()
    await register_services(hass, manager)
    setup_api(hass)
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    return True

async def register_services(hass: HomeAssistant, manager):
    """Register all Entity Manager services."""
    async def handle_update_entity_state(call: ServiceCall):
        await manager.update_entity_state(call.data[ATTR_ENTITY_ID], call.data[ATTR_ENABLED])
    
    async def handle_update_recorder_days(call: ServiceCall):
        await manager.update_recorder_days(call.data[ATTR_ENTITY_ID], call.data[ATTR_RECORDER_DAYS])
    
    async def handle_bulk_update(call: ServiceCall):
        await manager.bulk_update(call.data[ATTR_ENTITY_IDS], call.data.get(ATTR_ENABLED), call.data.get(ATTR_RECORDER_DAYS))
    
    async def handle_delete_entity(call: ServiceCall):
        await manager.delete_entity(call.data[ATTR_ENTITY_ID])
    
    async def handle_bulk_delete(call: ServiceCall):
        await manager.bulk_delete(call.data[ATTR_ENTITY_IDS])
    
    async def handle_purge_recorder(call: ServiceCall):
        await manager.purge_recorder(call.data.get(ATTR_ENTITY_IDS, []), call.data.get(ATTR_FORCE_PURGE, False))
    
    async def handle_reload_config(call: ServiceCall):
        await manager.load_config()

    async def handle_intelligent_purge(call: ServiceCall):
        await manager.intelligent_purge(call.data.get(ATTR_FORCE_PURGE, False))

    async def handle_generate_recorder_report(call: ServiceCall):
        await manager.generate_recorder_report(call.data.get(ATTR_LIMIT, 100), call.data.get(ATTR_DAYS_BACK, 30))

    hass.services.async_register(DOMAIN, SERVICE_UPDATE_ENTITY_STATE, handle_update_entity_state, UPDATE_ENTITY_STATE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_RECORDER_DAYS, handle_update_recorder_days, UPDATE_RECORDER_DAYS_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_UPDATE, handle_bulk_update, BULK_UPDATE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_DELETE_ENTITY, handle_delete_entity, DELETE_ENTITY_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_DELETE, handle_bulk_delete, BULK_DELETE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_PURGE_RECORDER, handle_purge_recorder, PURGE_RECORDER_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_RELOAD_CONFIG, handle_reload_config)
    hass.services.async_register(DOMAIN, SERVICE_INTELLIGENT_PURGE, handle_intelligent_purge, INTELLIGENT_PURGE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_GENERATE_RECORDER_REPORT, handle_generate_recorder_report, GENERATE_RECORDER_REPORT_SCHEMA)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.services.async_remove(DOMAIN, SERVICE_UPDATE_ENTITY_STATE)
    hass.services.async_remove(DOMAIN, SERVICE_UPDATE_RECORDER_DAYS)
    hass.services.async_remove(DOMAIN, SERVICE_BULK_UPDATE)
    hass.services.async_remove(DOMAIN, SERVICE_DELETE_ENTITY)
    hass.services.async_remove(DOMAIN, SERVICE_BULK_DELETE)
    hass.services.async_remove(DOMAIN, SERVICE_PURGE_RECORDER)
    hass.services.async_remove(DOMAIN, SERVICE_RELOAD_CONFIG)
    hass.services.async_remove(DOMAIN, SERVICE_INTELLIGENT_PURGE)
    hass.services.async_remove(DOMAIN, SERVICE_GENERATE_RECORDER_REPORT)
    
    unload_ok = await hass.config_entries.async_forward_entry_unload(entry, "sensor")
    if unload_ok:
        hass.data.pop(DOMAIN, None)
    return unload_ok


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

    async def save_config(self):
        """Save configuration to file asynchronously."""
        await self.hass.async_add_executor_job(self._save_config_sync)

    async def get_all_entities(self) -> List[Dict[str, Any]]:
        """Get all entities with their configurations and integration info."""
        entity_registry: EntityRegistry = async_get_entity_registry(self.hass)
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
    
    async def update_entity_state(self, entity_id: str, enabled: bool):
        """Update entity enabled state."""
        if entity_id not in self._config:
            self._config[entity_id] = {}
        self._config[entity_id]["enabled"] = enabled
        await self.save_config()
        
        entity_registry: EntityRegistry = async_get_entity_registry(self.hass)
        if not (entity_entry := entity_registry.async_get(entity_id)):
            return

        if enabled:
            entity_registry.async_update_entity(entity_id, disabled_by=None)
        else:
            disable_value = RegistryEntryDisabler.USER if HAS_REGISTRY_ENTRY_DISABLER else "user"
            entity_registry.async_update_entity(entity_id, disabled_by=disable_value)
    
    async def update_recorder_days(self, entity_id: str, recorder_days: int):
        """Update entity recorder days."""
        if entity_id not in self._config:
            self._config[entity_id] = {}
        self._config[entity_id]["recorder_days"] = recorder_days
        await self.save_config()
    
    async def bulk_update(self, entity_ids: List[str], enabled: Optional[bool] = None, recorder_days: Optional[int] = None):
        """Bulk update entities."""
        for entity_id in entity_ids:
            if enabled is not None:
                await self.update_entity_state(entity_id, enabled)
            if recorder_days is not None:
                await self.update_recorder_days(entity_id, recorder_days)
    
    async def delete_entity(self, entity_id: str):
        """Delete entity from Home Assistant."""
        entity_registry: EntityRegistry = async_get_entity_registry(self.hass)
        if entity_registry.async_get(entity_id):
            entity_registry.async_remove(entity_id)
        if entity_id in self._config:
            del self._config[entity_id]
            await self.save_config()
    
    async def bulk_delete(self, entity_ids: List[str]):
        """Bulk delete entities."""
        for entity_id in entity_ids:
            await self.delete_entity(entity_id)
    
    async def purge_recorder(self, entity_ids: List[str] = None, force_purge: bool = False):
        """Purge recorder data for entities."""
        # ... (código inalterado)
        pass

    async def intelligent_purge(self, force_purge: bool = False) -> Dict[str, Any]:
        """Execute intelligent purge based on entity configurations."""
        # ... (código inalterado)
        return {}

    async def generate_recorder_report(self, limit: int = 100, days_back: int = 30) -> Dict[str, Any]:
        """Generate a simple report counting all records per entity."""
        result = {"status": "success", "entities_analyzed": 0, "total_records": 0, "report_file": "", "report_data": []}
        try:
            if "recorder" not in self.hass.config.components:
                raise HomeAssistantError("Recorder component not available")
            
            def _simple_query():
                from homeassistant.components.recorder import get_instance
                from sqlalchemy import text
                
                recorder_instance = get_instance(self.hass)
                if not recorder_instance:
                    raise HomeAssistantError("Recorder instance not available")
                
                with recorder_instance.get_session() as session:
                    sql_query = text("""
                    SELECT sm.entity_id as entity_id, COUNT(*) as record_count
                    FROM states s JOIN states_meta sm ON s.metadata_id = sm.metadata_id
                    WHERE sm.entity_id IS NOT NULL
                    GROUP BY sm.entity_id ORDER BY record_count DESC LIMIT :limit_param
                    """)
                    return session.execute(sql_query, {"limit_param": limit}).fetchall()
            
            sql_results = await self.hass.async_add_executor_job(_simple_query)
            
            report_data = [{"entity_id": row[0], "record_count": row[1]} for row in sql_results if row[0]]
            total_records = sum(item["record_count"] for item in report_data)
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            report_filename = f"recorder_report_{timestamp}.json"
            www_path = self.hass.config.path("www")
            os.makedirs(www_path, exist_ok=True)
            report_path = os.path.join(www_path, report_filename)
            
            full_report = {"data": report_data}
            await self.hass.async_add_executor_job(self._save_report_file, report_path, full_report)
            
            result.update({
                "entities_analyzed": len(report_data),
                "total_records": total_records,
                "report_file": report_filename,
                "report_data": report_data,
            })
            return result
            
        except Exception as e:
            _LOGGER.error("Error generating recorder report: %s", e, exc_info=True)
            result.update({"status": "error", "error": str(e)})
            return result

    def _save_report_file(self, path: str, data: Dict[str, Any]) -> None:
        """Save report file synchronously."""
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        except Exception as e:
            _LOGGER.error("Error saving report file: %s", e)
            raise
