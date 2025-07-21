"""Entity Manager integration for Home Assistant."""
import logging
import os
import json
import yaml
import shutil
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import copy

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
    DOMAIN_CONFIG_FILE,
    DEFAULT_RECORDER_DAYS,
    DEFAULT_DOMAIN_RECORDER_DAYS,
    SERVICE_UPDATE_ENTITY_STATE,
    SERVICE_UPDATE_RECORDER_DAYS,
    SERVICE_BULK_UPDATE,
    SERVICE_PURGE_RECORDER,
    SERVICE_RELOAD_CONFIG,
    SERVICE_DELETE_ENTITY,
    SERVICE_BULK_DELETE,
    SERVICE_INTELLIGENT_PURGE,
    SERVICE_GENERATE_RECORDER_REPORT,
    SERVICE_UPDATE_RECORDER_EXCLUDE,
    SERVICE_BULK_UPDATE_RECORDER_EXCLUDE,
    SERVICE_UPDATE_RECORDER_CONFIG,
    SERVICE_PURGE_ALL_ENTITIES,
    SERVICE_EXCLUDE_DOMAIN,
    SERVICE_INCLUDE_DOMAIN,
    SERVICE_BULK_EXCLUDE_DOMAINS,
    SERVICE_UPDATE_DOMAIN_RECORDER_DAYS,
    SERVICE_BULK_UPDATE_DOMAIN_RECORDER_DAYS,
    ATTR_ENTITY_ID,
    ATTR_ENTITY_IDS,
    ATTR_ENABLED,
    ATTR_RECORDER_DAYS,
    ATTR_FORCE_PURGE,
    ATTR_RECORDER_EXCLUDE,
    ATTR_BACKUP_CONFIG,
    ATTR_LIMIT,
    ATTR_DAYS_BACK,
    ATTR_DOMAIN,
    ATTR_DOMAINS,
    ATTR_DOMAIN_RECORDER_DAYS,
    UPDATE_RECORDER_EXCLUDE_SCHEMA,
    BULK_UPDATE_RECORDER_EXCLUDE_SCHEMA,
    UPDATE_RECORDER_CONFIG_SCHEMA,
    INTELLIGENT_PURGE_SCHEMA,
    GENERATE_RECORDER_REPORT_SCHEMA,
    PURGE_ALL_ENTITIES_SCHEMA,
    EXCLUDE_DOMAIN_SCHEMA,
    INCLUDE_DOMAIN_SCHEMA,
    BULK_EXCLUDE_DOMAINS_SCHEMA,
    UPDATE_DOMAIN_RECORDER_DAYS_SCHEMA,
    BULK_UPDATE_DOMAIN_RECORDER_DAYS_SCHEMA,
    RECORDER_CONFIG_PATH,
    RECORDER_YAML_PATH,
    RECORDER_CONFIG_BACKUP_PATH,
    RECORDER_YAML_BACKUP_PATH,
)
from .api import setup_api

_LOGGER = logging.getLogger(__name__)

try:
    from homeassistant.helpers.entity_registry import RegistryEntryDisabler
    HAS_REGISTRY_ENTRY_DISABLER = True
except ImportError:
    HAS_REGISTRY_ENTRY_DISABLER = False

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


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Entity Manager from a config entry."""
    _LOGGER.info("Setting up Entity Manager integration")
    
    hass.data.setdefault(DOMAIN, {})
    manager = EntityManager(hass)
    hass.data[DOMAIN] = manager
    
    try:
        await manager.load_config()
        _LOGGER.info("Entity Manager configuration loaded successfully")
        
        await register_services(hass, manager)
        _LOGGER.info("Entity Manager services registered successfully")
        
        setup_api(hass)
        _LOGGER.info("Entity Manager API setup completed")
        
        await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
        _LOGGER.info("Entity Manager sensor platform setup completed")
        
        # Add options update listener
        entry.async_on_unload(entry.add_update_listener(async_reload_entry))
        
        return True
    except Exception as e:
        _LOGGER.error("Failed to setup Entity Manager: %s", e, exc_info=True)
        return False


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry."""
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)

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

    # Existing handlers
    async def handle_update_recorder_exclude(call: ServiceCall):
        await manager.update_recorder_exclude(call.data[ATTR_ENTITY_ID], call.data[ATTR_RECORDER_EXCLUDE])
    
    async def handle_bulk_update_recorder_exclude(call: ServiceCall):
        await manager.bulk_update_recorder_exclude(call.data[ATTR_ENTITY_IDS], call.data[ATTR_RECORDER_EXCLUDE])
    
    async def handle_update_recorder_config(call: ServiceCall):
        await manager.update_recorder_config(call.data.get(ATTR_BACKUP_CONFIG, True))
    
    async def handle_purge_all_entities(call: ServiceCall):
        await manager.purge_all_entities(call.data.get(ATTR_FORCE_PURGE, False))

    # UPDATED DOMAIN HANDLERS
    async def handle_exclude_domain(call: ServiceCall):
        domain = call.data[ATTR_DOMAIN]
        recorder_exclude = call.data.get(ATTR_RECORDER_EXCLUDE, True)
        recorder_days = call.data.get(ATTR_RECORDER_DAYS)
        await manager.exclude_domain(domain, recorder_exclude, recorder_days)
    
    async def handle_include_domain(call: ServiceCall):
        domain = call.data[ATTR_DOMAIN]
        recorder_days = call.data.get(ATTR_RECORDER_DAYS)
        await manager.include_domain(domain, recorder_days)
    
    async def handle_bulk_exclude_domains(call: ServiceCall):
        domains = call.data[ATTR_DOMAINS]
        recorder_exclude = call.data.get(ATTR_RECORDER_EXCLUDE, True)
        recorder_days = call.data.get(ATTR_RECORDER_DAYS)
        await manager.bulk_exclude_domains(domains, recorder_exclude, recorder_days)

    # NEW DOMAIN RECORDER DAYS HANDLERS
    async def handle_update_domain_recorder_days(call: ServiceCall):
        await manager.update_domain_recorder_days(call.data[ATTR_DOMAIN], call.data[ATTR_DOMAIN_RECORDER_DAYS])
    
    async def handle_bulk_update_domain_recorder_days(call: ServiceCall):
        await manager.bulk_update_domain_recorder_days(call.data[ATTR_DOMAINS], call.data[ATTR_DOMAIN_RECORDER_DAYS])

    # Register existing services
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_ENTITY_STATE, handle_update_entity_state, UPDATE_ENTITY_STATE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_RECORDER_DAYS, handle_update_recorder_days, UPDATE_RECORDER_DAYS_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_UPDATE, handle_bulk_update, BULK_UPDATE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_DELETE_ENTITY, handle_delete_entity, DELETE_ENTITY_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_DELETE, handle_bulk_delete, BULK_DELETE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_PURGE_RECORDER, handle_purge_recorder, PURGE_RECORDER_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_RELOAD_CONFIG, handle_reload_config)
    hass.services.async_register(DOMAIN, SERVICE_INTELLIGENT_PURGE, handle_intelligent_purge, INTELLIGENT_PURGE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_GENERATE_RECORDER_REPORT, handle_generate_recorder_report, GENERATE_RECORDER_REPORT_SCHEMA)
    
    # Register existing services
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_RECORDER_EXCLUDE, handle_update_recorder_exclude, UPDATE_RECORDER_EXCLUDE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_UPDATE_RECORDER_EXCLUDE, handle_bulk_update_recorder_exclude, BULK_UPDATE_RECORDER_EXCLUDE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_RECORDER_CONFIG, handle_update_recorder_config, UPDATE_RECORDER_CONFIG_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_PURGE_ALL_ENTITIES, handle_purge_all_entities, PURGE_ALL_ENTITIES_SCHEMA)
    
    # Register UPDATED domain services
    hass.services.async_register(DOMAIN, SERVICE_EXCLUDE_DOMAIN, handle_exclude_domain, EXCLUDE_DOMAIN_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_INCLUDE_DOMAIN, handle_include_domain, INCLUDE_DOMAIN_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_EXCLUDE_DOMAINS, handle_bulk_exclude_domains, BULK_EXCLUDE_DOMAINS_SCHEMA)
    
    # Register NEW domain recorder days services
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_DOMAIN_RECORDER_DAYS, handle_update_domain_recorder_days, UPDATE_DOMAIN_RECORDER_DAYS_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_UPDATE_DOMAIN_RECORDER_DAYS, handle_bulk_update_domain_recorder_days, BULK_UPDATE_DOMAIN_RECORDER_DAYS_SCHEMA)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Remove existing services
    services_to_remove = [
        SERVICE_UPDATE_ENTITY_STATE, SERVICE_UPDATE_RECORDER_DAYS, SERVICE_BULK_UPDATE,
        SERVICE_DELETE_ENTITY, SERVICE_BULK_DELETE, SERVICE_PURGE_RECORDER, SERVICE_RELOAD_CONFIG,
        SERVICE_INTELLIGENT_PURGE, SERVICE_GENERATE_RECORDER_REPORT, SERVICE_UPDATE_RECORDER_EXCLUDE,
        SERVICE_BULK_UPDATE_RECORDER_EXCLUDE, SERVICE_UPDATE_RECORDER_CONFIG, SERVICE_PURGE_ALL_ENTITIES,
        SERVICE_EXCLUDE_DOMAIN, SERVICE_INCLUDE_DOMAIN, SERVICE_BULK_EXCLUDE_DOMAINS,
        SERVICE_UPDATE_DOMAIN_RECORDER_DAYS, SERVICE_BULK_UPDATE_DOMAIN_RECORDER_DAYS
    ]
    
    for service in services_to_remove:
        hass.services.async_remove(DOMAIN, service)
    
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
        self._domain_config: Dict[str, Any] = {}
        self._config_path = hass.config.path("custom_components", DOMAIN, CONFIG_FILE)
        self._domain_config_path = hass.config.path("custom_components", DOMAIN, DOMAIN_CONFIG_FILE)
        self._config_lock = False  # Simple lock to prevent concurrent access

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

    def _load_domain_config_sync(self) -> Dict[str, Any]:
        """Loads the domain config file synchronously."""
        if not os.path.exists(self._domain_config_path):
            return {}
        try:
            with open(self._domain_config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            _LOGGER.error("Could not read or decode domain config file: %s", e)
            return {}

    def _save_domain_config_sync(self) -> None:
        """Saves the domain config file synchronously."""
        try:
            os.makedirs(os.path.dirname(self._domain_config_path), exist_ok=True)
            with open(self._domain_config_path, 'w', encoding='utf-8') as f:
                json.dump(self._domain_config, f, indent=2, ensure_ascii=False)
        except IOError as e:
            _LOGGER.error("Could not write to domain config file: %s", e)

    async def load_config(self):
        """Load configuration from files asynchronously."""
        if self._config_lock:
            _LOGGER.warning("Config is locked, waiting...")
            return
        self._config = await self.hass.async_add_executor_job(self._load_config_sync)
        self._domain_config = await self.hass.async_add_executor_job(self._load_domain_config_sync)

    async def save_config(self):
        """Save configuration to file asynchronously."""
        if self._config_lock:
            _LOGGER.warning("Config is locked, skipping save...")
            return
        await self.hass.async_add_executor_job(self._save_config_sync)

    async def save_domain_config(self):
        """Save domain configuration to file asynchronously."""
        if self._config_lock:
            _LOGGER.warning("Config is locked, skipping domain save...")
            return
        await self.hass.async_add_executor_job(self._save_domain_config_sync)

    async def get_all_entities(self) -> List[Dict[str, Any]]:
        """Get all entities with their configurations and integration info."""
        entity_registry: EntityRegistry = async_get_entity_registry(self.hass)
        entities = []

        # Create a copy of registry entities to avoid modification during iteration
        registry_entities = dict(entity_registry.entities)

        # Process registry entities
        for entity_entry in registry_entities.values():
            entity_id = entity_entry.entity_id
            config = self._config.get(entity_id, {})
            domain = entity_id.split('.')[0]
            domain_config = self._domain_config.get(domain, {})
            
            # Determine if enabled
            is_enabled = not entity_entry.disabled_by
            
            # Try to get current state
            state_obj = self.hass.states.get(entity_id)
            
            if state_obj:
                entity_name = state_obj.name or entity_id
                entity_state = state_obj.state
            else:
                entity_name = entity_entry.name or entity_entry.original_name or entity_id
                entity_state = "disabled" if not is_enabled else "unavailable"
            
            # Determine platform and integration domain
            platform = entity_entry.platform or "unknown"
            integration_domain = "homeassistant"
            
            if entity_entry.config_entry_id:
                config_entry = self.hass.config_entries.async_get_entry(entity_entry.config_entry_id)
                if config_entry:
                    integration_domain = config_entry.domain

            # Determine recorder settings - priority: entity > domain > default
            recorder_days = config.get("recorder_days") or domain_config.get("recorder_days", DEFAULT_RECORDER_DAYS)
            recorder_exclude = config.get("recorder_exclude")
            if recorder_exclude is None:
                recorder_exclude = domain_config.get("recorder_exclude", False)

            entities.append({
                "entity_id": entity_id,
                "name": entity_name,
                "state": entity_state,
                "domain": domain,
                "platform": platform,
                "integration_domain": integration_domain,
                "enabled": is_enabled,
                "recorder_days": recorder_days,
                "recorder_exclude": recorder_exclude,
            })

        # Add entities from states that are not in registry
        registry_entity_ids = set(registry_entities.keys())
        all_states = self.hass.states.async_all()
        
        for state in all_states:
            entity_id = state.entity_id
            if entity_id not in registry_entity_ids:
                config = self._config.get(entity_id, {})
                domain = state.domain
                domain_config = self._domain_config.get(domain, {})
                
                # Determine recorder settings - priority: entity > domain > default
                recorder_days = config.get("recorder_days") or domain_config.get("recorder_days", DEFAULT_RECORDER_DAYS)
                recorder_exclude = config.get("recorder_exclude")
                if recorder_exclude is None:
                    recorder_exclude = domain_config.get("recorder_exclude", False)
                
                entities.append({
                    "entity_id": entity_id,
                    "name": state.name or entity_id,
                    "state": state.state,
                    "domain": domain,
                    "platform": "unknown",
                    "integration_domain": "homeassistant",
                    "enabled": True,
                    "recorder_days": recorder_days,
                    "recorder_exclude": recorder_exclude,
                })

        # Sort for consistency
        entities.sort(key=lambda x: x["entity_id"])
        
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
    
    async def update_recorder_exclude(self, entity_id: str, recorder_exclude: bool):
        """Update entity recorder exclude setting."""
        if entity_id not in self._config:
            self._config[entity_id] = {}
        self._config[entity_id]["recorder_exclude"] = recorder_exclude
        await self.save_config()
        _LOGGER.info("Updated recorder exclude for %s: %s", entity_id, recorder_exclude)
    
    async def bulk_update_recorder_exclude(self, entity_ids: List[str], recorder_exclude: bool):
        """Bulk update entities recorder exclude setting - FIXED to avoid iteration issues."""
        # Create a copy of the entity_ids list to avoid modification during iteration
        entity_ids_copy = list(entity_ids)
        
        _LOGGER.info("Starting bulk update recorder exclude for %d entities: %s", len(entity_ids_copy), recorder_exclude)
        
        # Lock config to prevent concurrent modifications
        self._config_lock = True
        
        try:
            # Process all entities at once to avoid multiple saves
            for entity_id in entity_ids_copy:
                if entity_id not in self._config:
                    self._config[entity_id] = {}
                self._config[entity_id]["recorder_exclude"] = recorder_exclude
                _LOGGER.debug("Updated recorder exclude for %s: %s", entity_id, recorder_exclude)
            
            # Save config only once at the end
            await self.save_config()
            
        finally:
            self._config_lock = False
        
        _LOGGER.info("Bulk updated recorder exclude for %d entities: %s", len(entity_ids_copy), recorder_exclude)
    
    async def bulk_update(self, entity_ids: List[str], enabled: Optional[bool] = None, recorder_days: Optional[int] = None):
        """Bulk update entities."""
        entity_ids_copy = list(entity_ids)  # Avoid iteration issues
        
        for entity_id in entity_ids_copy:
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
        entity_ids_copy = list(entity_ids)  # Avoid iteration issues
        for entity_id in entity_ids_copy:
            await self.delete_entity(entity_id)
    
    # NEW DOMAIN MANAGEMENT FUNCTIONS WITH RECORDER DAYS SUPPORT
    async def update_domain_recorder_days(self, domain: str, recorder_days: int):
        """Update recorder days for a domain."""
        if domain not in self._domain_config:
            self._domain_config[domain] = {}
        self._domain_config[domain]["recorder_days"] = recorder_days
        await self.save_domain_config()
        _LOGGER.info("Updated recorder days for domain %s: %d", domain, recorder_days)
    
    async def bulk_update_domain_recorder_days(self, domains: List[str], recorder_days: int):
        """Bulk update recorder days for multiple domains."""
        domains_copy = list(domains)
        
        for domain in domains_copy:
            if domain not in self._domain_config:
                self._domain_config[domain] = {}
            self._domain_config[domain]["recorder_days"] = recorder_days
        
        await self.save_domain_config()
        _LOGGER.info("Bulk updated recorder days for %d domains: %d", len(domains_copy), recorder_days)
    
    async def exclude_domain(self, domain: str, recorder_exclude: bool = True, recorder_days: Optional[int] = None):
        """Exclude/include all entities from a domain with optional recorder days."""
        _LOGGER.info("Excluding domain %s from recorder: %s", domain, recorder_exclude)
        
        # Update domain configuration
        if domain not in self._domain_config:
            self._domain_config[domain] = {}
        
        self._domain_config[domain]["recorder_exclude"] = recorder_exclude
        
        if recorder_days is not None:
            self._domain_config[domain]["recorder_days"] = recorder_days
        
        await self.save_domain_config()
        
        # Optional: Also update individual entities if you want to override domain settings
        # Get all entities from the domain
        entities = await self.get_all_entities()
        domain_entities = [e["entity_id"] for e in entities if e["domain"] == domain]
        
        if domain_entities:
            # Clear individual entity overrides to let domain config take precedence
            for entity_id in domain_entities:
                if entity_id in self._config:
                    # Remove individual overrides to let domain config take precedence
                    if "recorder_exclude" in self._config[entity_id]:
                        del self._config[entity_id]["recorder_exclude"]
                    if recorder_days is not None and "recorder_days" in self._config[entity_id]:
                        del self._config[entity_id]["recorder_days"]
                    
                    # Remove empty configs
                    if not self._config[entity_id]:
                        del self._config[entity_id]
            
            await self.save_config()
        
        _LOGGER.info("Updated domain %s configuration: exclude=%s, days=%s", domain, recorder_exclude, recorder_days)
    
    async def include_domain(self, domain: str, recorder_days: Optional[int] = None):
        """Include all entities from a domain in recorder with optional recorder days."""
        await self.exclude_domain(domain, False, recorder_days)
    
    async def bulk_exclude_domains(self, domains: List[str], recorder_exclude: bool = True, recorder_days: Optional[int] = None):
        """Bulk exclude/include multiple domains with optional recorder days."""
        domains_copy = list(domains)  # Avoid iteration issues
        
        for domain in domains_copy:
            await self.exclude_domain(domain, recorder_exclude, recorder_days)
    
    async def update_recorder_config(self, backup_config: bool = True) -> Dict[str, Any]:
        """Update recorder.yaml with complete domain and entity configuration."""
        result = {"status": "success", "message": "", "excluded_entities": [], "excluded_domains": [], "domain_configs": {}}
        
        try:
            recorder_yaml_path = self.hass.config.path(RECORDER_YAML_PATH)
            config_yaml_path = self.hass.config.path(RECORDER_CONFIG_PATH)
            recorder_backup_path = self.hass.config.path(RECORDER_YAML_BACKUP_PATH)
            
            # Make backup if requested
            if backup_config and os.path.exists(recorder_yaml_path):
                await self.hass.async_add_executor_job(shutil.copy2, recorder_yaml_path, recorder_backup_path)
                _LOGGER.info("Backup created: %s", recorder_backup_path)
            
            # Get all entities to understand current state
            entities = await self.get_all_entities()
            
            # Create recorder configuration - FIXED: No 'recorder:' wrapper since it's included via !include
            recorder_config = {
                "db_url": "sqlite:///home-assistant_v2.db",  # User should customize
                "purge_keep_days": 10,  # Default - user should customize
                "commit_interval": 1,
                "auto_purge": True,
                "auto_repack": True
            }
            
            # Process domain exclusions
            excluded_domains = []
            domain_include_configs = {}
            
            for domain, domain_config in self._domain_config.items():
                if domain_config.get("recorder_exclude", False):
                    excluded_domains.append(domain)
                else:
                    # Domain is included, check if it has custom recorder days
                    recorder_days = domain_config.get("recorder_days")
                    if recorder_days is not None and recorder_days != DEFAULT_RECORDER_DAYS:
                        domain_include_configs[domain] = {"purge_keep_days": recorder_days}
            
            # Process individual entity exclusions (only for entities not in excluded domains)
            excluded_entities = []
            individual_entity_configs = {}
            
            for entity_id, config in self._config.items():
                domain = entity_id.split('.')[0]
                
                # Skip if domain is fully excluded
                if domain in excluded_domains:
                    continue
                
                if config.get("recorder_exclude", False):
                    excluded_entities.append(entity_id)
                else:
                    # Entity is included, check if it has custom recorder days
                    recorder_days = config.get("recorder_days")
                    if recorder_days is not None:
                        # Only include if different from domain default or system default
                        domain_default = self._domain_config.get(domain, {}).get("recorder_days", DEFAULT_RECORDER_DAYS)
                        if recorder_days != domain_default:
                            individual_entity_configs[entity_id] = {"purge_keep_days": recorder_days}
            
            # Build exclude section
            exclude_section = {}
            if excluded_domains:
                exclude_section["domains"] = sorted(excluded_domains)
            if excluded_entities:
                exclude_section["entities"] = sorted(excluded_entities)
            
            if exclude_section:
                recorder_config["exclude"] = exclude_section
            
            # Build include section with custom purge_keep_days
            include_section = {}
            if domain_include_configs:
                include_section["domains"] = domain_include_configs
            if individual_entity_configs:
                include_section["entities"] = individual_entity_configs
            
            if include_section:
                recorder_config["include"] = include_section
            
            # Add comments to the YAML
            yaml_content = self._create_recorder_yaml_with_comments(recorder_config)
            
            # Save recorder.yaml
            await self.hass.async_add_executor_job(self._save_yaml_content, recorder_yaml_path, yaml_content)
            
            # Update configuration.yaml to include recorder.yaml if not already included
            await self._ensure_recorder_yaml_included(config_yaml_path, backup_config)
            
            # Prepare result
            result.update({
                "excluded_entities": excluded_entities,
                "excluded_domains": excluded_domains,
                "domain_configs": {
                    "excluded_domains": len(excluded_domains),
                    "domains_with_custom_days": len(domain_include_configs),
                    "entities_with_custom_days": len(individual_entity_configs)
                }
            })
            
            total_excluded = len(excluded_entities)
            message_parts = []
            if excluded_domains:
                message_parts.append(f"{len(excluded_domains)} domínios excluídos")
            if excluded_entities:
                message_parts.append(f"{len(excluded_entities)} entidades individuais excluídas")
            if domain_include_configs:
                message_parts.append(f"{len(domain_include_configs)} domínios com dias customizados")
            if individual_entity_configs:
                message_parts.append(f"{len(individual_entity_configs)} entidades com dias customizados")
            
            if message_parts:
                result["message"] = f"recorder.yaml atualizado com {', '.join(message_parts)}. Reinicie o HA para aplicar."
            else:
                result["message"] = "recorder.yaml criado com configuração padrão. Personalize conforme necessário."
            
            _LOGGER.info("Updated recorder.yaml: %s", result["message"])
            
        except Exception as e:
            _LOGGER.error("Error updating recorder configuration: %s", e, exc_info=True)
            result.update({"status": "error", "message": f"Erro ao atualizar configuração: {str(e)}"})
        
        return result
    
    def _create_recorder_yaml_with_comments(self, config: Dict[str, Any]) -> str:
        """Create recorder.yaml content with helpful comments."""
        content = "# Configuração do Recorder gerada pelo Entity Manager\n"
        content += "# Data: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "\n"
        content += "# \n"
        content += "# IMPORTANTE: Após fazer alterações, reinicie o Home Assistant\n"
        content += "# \n"
        content += "# Documentação: https://www.home-assistant.io/integrations/recorder/\n"
        content += "\n"
        
        # Add recorder configuration directly (no 'recorder:' wrapper since it's included)
        yaml_str = yaml.safe_dump(config, default_flow_style=False, allow_unicode=True, indent=2)
        
        # Add inline comments
        lines = yaml_str.split('\n')
        enhanced_lines = []
        
        for line in lines:
            if 'db_url:' in line and 'sqlite:///home-assistant_v2.db' in line:
                enhanced_lines.append(line + '  # Personalize o caminho do banco conforme necessário')
            elif 'purge_keep_days: 10' in line and not any(x in line for x in ['domains:', 'entities:']):
                enhanced_lines.append(line + '  # Dias padrão de retenção - personalize conforme necessário')
            elif line.strip() == 'exclude:':
                enhanced_lines.append(line + '  # Entidades e domínios excluídos do recorder')
            elif line.strip() == 'include:':
                enhanced_lines.append(line + '  # Configurações customizadas de retenção')
            elif 'domains:' in line and any(x in yaml_str[:yaml_str.find(line)] for x in ['exclude:']):
                enhanced_lines.append(line + '  # Domínios completamente excluídos')
            elif 'entities:' in line and any(x in yaml_str[:yaml_str.find(line)] for x in ['exclude:']):
                enhanced_lines.append(line + '  # Entidades individuais excluídas')
            else:
                enhanced_lines.append(line)
        
        content += '\n'.join(enhanced_lines)
        content += "\n\n# Configuração gerada automaticamente pelo Entity Manager\n"
        content += "# Para modificar, use a interface do Entity Manager ou edite este arquivo manualmente\n"
        
        return content
    
    def _save_yaml_content(self, file_path: str, content: str) -> None:
        """Save YAML content to file synchronously."""
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception as e:
            _LOGGER.error("Error saving YAML content to %s: %s", file_path, e)
            raise
    
    async def _ensure_recorder_yaml_included(self, config_path: str, backup_config: bool = True):
        """Ensure that recorder.yaml is included in configuration.yaml."""
        try:
            # Make backup of configuration.yaml if requested
            if backup_config and os.path.exists(config_path):
                config_backup_path = self.hass.config.path(RECORDER_CONFIG_BACKUP_PATH)
                await self.hass.async_add_executor_job(shutil.copy2, config_path, config_backup_path)
            
            # Read file as text to check if include is already present
            file_content = ""
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    file_content = f.read()
            
            # Check if recorder is already configured
            has_recorder_include = "recorder: !include recorder.yaml" in file_content
            has_recorder_section = "recorder:" in file_content
            
            # If recorder include is not present, add it
            if not has_recorder_include and not has_recorder_section:
                # Add the include line
                if file_content and not file_content.endswith('\n'):
                    file_content += '\n'
                
                file_content += '\n# Entity Manager - Recorder Configuration\n'
                file_content += '# IMPORTANTE: O arquivo recorder.yaml contém todas as configurações do recorder\n'
                file_content += '# Gerado automaticamente pelo Entity Manager\n'
                file_content += 'recorder: !include recorder.yaml\n'
                
                # Write updated content
                with open(config_path, 'w', encoding='utf-8') as f:
                    f.write(file_content)
                
                _LOGGER.info("Added 'recorder: !include recorder.yaml' to configuration.yaml")
            
            elif has_recorder_section and not has_recorder_include:
                _LOGGER.warning(
                    "recorder: section already exists in configuration.yaml. "
                    "Para usar o Entity Manager, substitua a seção recorder: existente por: "
                    "'recorder: !include recorder.yaml' e mova suas configurações para recorder.yaml"
                )
            
            else:
                _LOGGER.info("recorder: !include recorder.yaml already present in configuration.yaml")
            
        except Exception as e:
            _LOGGER.error("Error ensuring recorder.yaml include: %s", e)
    
    async def purge_all_entities(self, force_purge: bool = False) -> Dict[str, Any]:
        """Execute recorder.purge_entities service."""
        result = {"status": "success", "message": "", "purged_entities": []}
        
        try:
            # Collect excluded entities
            excluded_entities = []
            for entity_id, config in self._config.items():
                if config.get("recorder_exclude", False):
                    excluded_entities.append(entity_id)
            
            if not excluded_entities and not force_purge:
                result["message"] = "Nenhuma entidade marcada para limpeza do recorder."
                return result
            
            # Execute purge_entities
            service_data = {}
            if excluded_entities:
                service_data["entity_ids"] = excluded_entities
            
            await self.hass.services.async_call(
                "recorder",
                "purge_entities",
                service_data,
                blocking=False
            )
            
            result["purged_entities"] = excluded_entities
            result["message"] = f"Comando de limpeza enviado para {len(excluded_entities)} entidades."
            _LOGGER.info("Executed recorder.purge_entities for %d entities", len(excluded_entities))
            
        except Exception as e:
            _LOGGER.error("Error executing purge_entities: %s", e, exc_info=True)
            result.update({"status": "error", "message": f"Erro ao executar limpeza: {str(e)}"})
        
        return result
    
    def _load_yaml_file(self, file_path: str) -> Dict[str, Any]:
        """Load YAML file synchronously."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f) or {}
        except Exception as e:
            _LOGGER.error("Error loading YAML file %s: %s", file_path, e)
            return {}
    
    def _save_yaml_file(self, file_path: str, data: Dict[str, Any]) -> None:
        """Save YAML file synchronously."""
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                yaml.safe_dump(data, f, default_flow_style=False, allow_unicode=True, indent=2)
        except Exception as e:
            _LOGGER.error("Error saving YAML file %s: %s", file_path, e)
            raise
    
    async def purge_recorder(self, entity_ids: List[str] = None, force_purge: bool = False):
        """Purge recorder data for entities."""
        # Simplified implementation
        pass

    async def intelligent_purge(self, force_purge: bool = False) -> Dict[str, Any]:
        """Execute intelligent purge based on entity configurations."""
        # Simplified implementation
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