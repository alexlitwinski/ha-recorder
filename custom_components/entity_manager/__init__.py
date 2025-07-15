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

# IMPORTANTE: Definir _LOGGER ANTES de usá-lo
_LOGGER = logging.getLogger(__name__)

# Tentar importar RegistryEntryDisabler, com fallback para versões antigas
try:
    from homeassistant.helpers.entity_registry import RegistryEntryDisabler
    HAS_REGISTRY_ENTRY_DISABLER = True
    _LOGGER.debug("Using RegistryEntryDisabler enum")
except ImportError:
    # Fallback para versões antigas do Home Assistant
    HAS_REGISTRY_ENTRY_DISABLER = False
    _LOGGER.debug("RegistryEntryDisabler not available, using string values")

# NOVOS SERVIÇOS
SERVICE_INTELLIGENT_PURGE = "intelligent_purge"
SERVICE_GENERATE_RECORDER_REPORT = "generate_recorder_report"

# NOVOS ATRIBUTOS
ATTR_LIMIT = "limit"
ATTR_DAYS_BACK = "days_back"

# Schemas para os serviços
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

# NOVOS SCHEMAS
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
    
    # Log de compatibilidade
    _LOGGER.info("Entity Manager starting up...")
    
    # Tentar obter versão do HA de forma segura
    try:
        from homeassistant import const as ha_const
        if hasattr(ha_const, 'MAJOR_VERSION') and hasattr(ha_const, 'MINOR_VERSION'):
            ha_version = f"{ha_const.MAJOR_VERSION}.{ha_const.MINOR_VERSION}"
            _LOGGER.info("Home Assistant version: %s", ha_version)
        else:
            _LOGGER.debug("Could not determine HA version")
    except Exception as e:
        _LOGGER.debug("Could not get HA version: %s", e)
    
    _LOGGER.info("RegistryEntryDisabler available: %s", HAS_REGISTRY_ENTRY_DISABLER)
    
    if HAS_REGISTRY_ENTRY_DISABLER:
        try:
            # Verificar se conseguimos acessar os valores do enum
            test_values = [RegistryEntryDisabler.USER, RegistryEntryDisabler.CONFIG]
            _LOGGER.debug("RegistryEntryDisabler enum values accessible: %s", test_values)
        except Exception as e:
            _LOGGER.warning("RegistryEntryDisabler enum present but not accessible: %s", e)
    
    # Registrar todos os serviços
    await register_services(hass, manager)
    
    setup_api(hass)
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    return True

async def register_services(hass: HomeAssistant, manager):
    """Register all Entity Manager services."""
    
    async def handle_update_entity_state(call: ServiceCall):
        """Handle update entity state service."""
        entity_id = call.data[ATTR_ENTITY_ID]
        enabled = call.data[ATTR_ENABLED]
        await manager.update_entity_state(entity_id, enabled)
    
    async def handle_update_recorder_days(call: ServiceCall):
        """Handle update recorder days service."""
        entity_id = call.data[ATTR_ENTITY_ID]
        recorder_days = call.data[ATTR_RECORDER_DAYS]
        await manager.update_recorder_days(entity_id, recorder_days)
    
    async def handle_bulk_update(call: ServiceCall):
        """Handle bulk update service."""
        entity_ids = call.data[ATTR_ENTITY_IDS]
        enabled = call.data.get(ATTR_ENABLED)
        recorder_days = call.data.get(ATTR_RECORDER_DAYS)
        await manager.bulk_update(entity_ids, enabled, recorder_days)
    
    async def handle_delete_entity(call: ServiceCall):
        """Handle delete entity service."""
        entity_id = call.data[ATTR_ENTITY_ID]
        await manager.delete_entity(entity_id)
    
    async def handle_bulk_delete(call: ServiceCall):
        """Handle bulk delete service."""
        entity_ids = call.data[ATTR_ENTITY_IDS]
        await manager.bulk_delete(entity_ids)
    
    async def handle_purge_recorder(call: ServiceCall):
        """Handle purge recorder service."""
        entity_ids = call.data.get(ATTR_ENTITY_IDS, [])
        force_purge = call.data.get(ATTR_FORCE_PURGE, False)
        await manager.purge_recorder(entity_ids, force_purge)
    
    async def handle_reload_config(call: ServiceCall):
        """Handle reload config service."""
        await manager.load_config()
    
    # NOVOS HANDLERS
    async def handle_intelligent_purge(call: ServiceCall):
        """Handle intelligent purge service."""
        force_purge = call.data.get(ATTR_FORCE_PURGE, False)
        result = await manager.intelligent_purge(force_purge)
        _LOGGER.info("Intelligent purge completed: %s", result)
    
    async def handle_generate_recorder_report(call: ServiceCall):
        """Handle generate recorder report service."""
        limit = call.data.get(ATTR_LIMIT, 100)
        days_back = call.data.get(ATTR_DAYS_BACK, 30)
        result = await manager.generate_recorder_report(limit, days_back)
        _LOGGER.info("Recorder report generated: %s", result)
    
    # Registrar os serviços existentes
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_ENTITY_STATE, handle_update_entity_state, UPDATE_ENTITY_STATE_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_RECORDER_DAYS, handle_update_recorder_days, UPDATE_RECORDER_DAYS_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_BULK_UPDATE, handle_bulk_update, BULK_UPDATE_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_DELETE_ENTITY, handle_delete_entity, DELETE_ENTITY_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_BULK_DELETE, handle_bulk_delete, BULK_DELETE_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_PURGE_RECORDER, handle_purge_recorder, PURGE_RECORDER_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_RELOAD_CONFIG, handle_reload_config
    )
    
    # REGISTRAR NOVOS SERVIÇOS
    hass.services.async_register(
        DOMAIN, SERVICE_INTELLIGENT_PURGE, handle_intelligent_purge, INTELLIGENT_PURGE_SCHEMA
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_GENERATE_RECORDER_REPORT, handle_generate_recorder_report, GENERATE_RECORDER_REPORT_SCHEMA
    )
    
    _LOGGER.info("Entity Manager services registered successfully (including new services)")

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Remover serviços
    hass.services.async_remove(DOMAIN, SERVICE_UPDATE_ENTITY_STATE)
    hass.services.async_remove(DOMAIN, SERVICE_UPDATE_RECORDER_DAYS)
    hass.services.async_remove(DOMAIN, SERVICE_BULK_UPDATE)
    hass.services.async_remove(DOMAIN, SERVICE_DELETE_ENTITY)
    hass.services.async_remove(DOMAIN, SERVICE_BULK_DELETE)
    hass.services.async_remove(DOMAIN, SERVICE_PURGE_RECORDER)
    hass.services.async_remove(DOMAIN, SERVICE_RELOAD_CONFIG)
    
    # Remover novos serviços
    hass.services.async_remove(DOMAIN, SERVICE_INTELLIGENT_PURGE)
    hass.services.async_remove(DOMAIN, SERVICE_GENERATE_RECORDER_REPORT)
    
    unload_ok = await hass.config_entries.async_forward_entry_unload(entry, "sensor")
    if unload_ok:
        hass.data[DOMAIN].clear()
    
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
    
    async def update_entity_state(self, entity_id: str, enabled: bool):
        """Update entity enabled state."""
        if entity_id not in self._config:
            self._config[entity_id] = {}
        
        self._config[entity_id]["enabled"] = enabled
        await self.save_config()
        _LOGGER.info("Updated config for entity %s (enabled=%s)", entity_id, enabled)
        
        # Também atualizar no registro de entidades do HA se possível
        entity_registry: EntityRegistry = async_get_entity_registry(self.hass)
        entity_entry = entity_registry.async_get(entity_id)
        
        if not entity_entry:
            _LOGGER.warning("Entity %s not found in registry, config updated only", entity_id)
            return
        
        # Se a entidade já está no estado desejado, não fazer nada
        current_enabled = not entity_entry.disabled_by
        if current_enabled == enabled:
            _LOGGER.debug("Entity %s already in desired state (enabled=%s)", entity_id, enabled)
            return
        
        try:
            if enabled and entity_entry.disabled_by:
                # Habilitar entidade - sempre funciona
                entity_registry.async_update_entity(entity_id, disabled_by=None)
                _LOGGER.info("Enabled entity %s in registry", entity_id)
                
            elif not enabled and not entity_entry.disabled_by:
                # Desabilitar entidade - parte mais complicada
                _LOGGER.debug("Attempting to disable entity %s in registry", entity_id)
                
                # Lista de valores para tentar, em ordem de preferência
                disable_values = []
                
                if HAS_REGISTRY_ENTRY_DISABLER:
                    try:
                        disable_values.append(RegistryEntryDisabler.USER)
                        _LOGGER.debug("Added RegistryEntryDisabler.USER to attempt list")
                    except Exception:
                        pass
                    try:
                        disable_values.append(RegistryEntryDisabler.CONFIG)
                        _LOGGER.debug("Added RegistryEntryDisabler.CONFIG to attempt list")
                    except Exception:
                        pass
                
                # Fallbacks para versões antigas
                disable_values.extend(["user", "USER", "config", "CONFIG", "integration"])
                
                success = False
                last_error = None
                
                for disable_value in disable_values:
                    try:
                        _LOGGER.debug("Trying to disable entity %s with value: %s (type: %s)", 
                                    entity_id, disable_value, type(disable_value).__name__)
                        
                        entity_registry.async_update_entity(entity_id, disabled_by=disable_value)
                        _LOGGER.info("Successfully disabled entity %s with value: %s", entity_id, disable_value)
                        success = True
                        break
                        
                    except Exception as e:
                        last_error = e
                        _LOGGER.debug("Failed to disable entity %s with value %s: %s", 
                                    entity_id, disable_value, str(e))
                        continue
                
                if not success:
                    _LOGGER.error("Failed to disable entity %s in registry after trying all methods. Last error: %s", 
                                entity_id, last_error)
                    _LOGGER.warning("Entity %s disabled in config only (registry update failed)", entity_id)
                    # Não levantar exceção - pelo menos a config foi salva
                    
        except Exception as e:
            _LOGGER.error("Unexpected error updating entity registry for %s: %s", entity_id, e, exc_info=True)
            _LOGGER.warning("Entity %s state updated in config only", entity_id)
            # Não levantar exceção - continuar funcionamento
        
        _LOGGER.info("Completed update_entity_state for %s", entity_id)
    
    async def update_recorder_days(self, entity_id: str, recorder_days: int):
        """Update entity recorder days."""
        if entity_id not in self._config:
            self._config[entity_id] = {}
        
        self._config[entity_id]["recorder_days"] = recorder_days
        await self.save_config()
        _LOGGER.info("Updated entity %s recorder days to %d", entity_id, recorder_days)
    
    async def bulk_update(self, entity_ids: List[str], enabled: Optional[bool] = None, recorder_days: Optional[int] = None):
        """Bulk update entities."""
        for entity_id in entity_ids:
            if entity_id not in self._config:
                self._config[entity_id] = {}
            
            if enabled is not None:
                await self.update_entity_state(entity_id, enabled)
            
            if recorder_days is not None:
                await self.update_recorder_days(entity_id, recorder_days)
        
        _LOGGER.info("Bulk updated %d entities", len(entity_ids))
    
    async def delete_entity(self, entity_id: str):
        """Delete entity from Home Assistant."""
        try:
            entity_registry: EntityRegistry = async_get_entity_registry(self.hass)
            entity_entry = entity_registry.async_get(entity_id)
            
            if entity_entry:
                entity_registry.async_remove(entity_id)
                _LOGGER.info("Deleted entity from registry: %s", entity_id)
            
            # Remover da configuração local
            if entity_id in self._config:
                del self._config[entity_id]
                await self.save_config()
                
            _LOGGER.info("Successfully deleted entity: %s", entity_id)
            
        except Exception as e:
            _LOGGER.error("Error deleting entity %s: %s", entity_id, e)
            raise HomeAssistantError(f"Failed to delete entity {entity_id}: {e}")
    
    async def bulk_delete(self, entity_ids: List[str]):
        """Bulk delete entities."""
        for entity_id in entity_ids:
            await self.delete_entity(entity_id)
        
        _LOGGER.info("Bulk deleted %d entities", len(entity_ids))
    
    async def purge_recorder(self, entity_ids: List[str] = None, force_purge: bool = False):
        """Purge recorder data for entities."""
        try:
            if not entity_ids:
                # Se não especificado, usar todas as entidades configuradas
                entity_ids = list(self._config.keys())
            
            # Agrupar entidades por dias para eficiência
            entities_by_days = {}
            
            for entity_id in entity_ids:
                recorder_days = self._config.get(entity_id, {}).get("recorder_days", DEFAULT_RECORDER_DAYS)
                
                if recorder_days == 0 and not force_purge:
                    continue  # Pular entidades com 0 dias a menos que force_purge seja True
                
                if recorder_days not in entities_by_days:
                    entities_by_days[recorder_days] = []
                entities_by_days[recorder_days].append(entity_id)
            
            # Executar purge agrupado
            for days, entity_list in entities_by_days.items():
                try:
                    await self.hass.services.async_call(
                        "recorder", 
                        "purge_entities",  # ← COMANDO CORRETO!
                        {
                            "entity_id": entity_list,
                            "keep_days": days
                        }
                    )
                    _LOGGER.info("Purged %d entities with %d days retention", len(entity_list), days)
                except Exception as purge_error:
                    _LOGGER.warning("Could not purge entities with %d days: %s", days, purge_error)
            
            _LOGGER.info("Purged recorder data for %d entities in %d groups", len(entity_ids), len(entities_by_days))
            
        except Exception as e:
            _LOGGER.error("Error purging recorder data: %s", e)
            raise HomeAssistantError(f"Failed to purge recorder data: {e}")