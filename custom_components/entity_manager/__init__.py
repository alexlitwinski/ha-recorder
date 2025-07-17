"""Entity Manager integration for Home Assistant."""
import logging
import os
import json
import yaml
import shutil
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
    SERVICE_INTELLIGENT_PURGE,
    SERVICE_GENERATE_RECORDER_REPORT,
    SERVICE_UPDATE_RECORDER_EXCLUDE,
    SERVICE_BULK_UPDATE_RECORDER_EXCLUDE,
    SERVICE_UPDATE_RECORDER_CONFIG,
    SERVICE_PURGE_ALL_ENTITIES,
    ATTR_ENTITY_ID,
    ATTR_ENTITY_IDS,
    ATTR_ENABLED,
    ATTR_RECORDER_DAYS,
    ATTR_FORCE_PURGE,
    ATTR_RECORDER_EXCLUDE,
    ATTR_BACKUP_CONFIG,
    ATTR_LIMIT,
    ATTR_DAYS_BACK,
    UPDATE_RECORDER_EXCLUDE_SCHEMA,
    BULK_UPDATE_RECORDER_EXCLUDE_SCHEMA,
    UPDATE_RECORDER_CONFIG_SCHEMA,
    INTELLIGENT_PURGE_SCHEMA,
    GENERATE_RECORDER_REPORT_SCHEMA,
    PURGE_ALL_ENTITIES_SCHEMA,
    RECORDER_CONFIG_PATH,
    RECORDER_CONFIG_BACKUP_PATH,
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

    # Novos handlers
    async def handle_update_recorder_exclude(call: ServiceCall):
        await manager.update_recorder_exclude(call.data[ATTR_ENTITY_ID], call.data[ATTR_RECORDER_EXCLUDE])
    
    async def handle_bulk_update_recorder_exclude(call: ServiceCall):
        await manager.bulk_update_recorder_exclude(call.data[ATTR_ENTITY_IDS], call.data[ATTR_RECORDER_EXCLUDE])
    
    async def handle_update_recorder_config(call: ServiceCall):
        await manager.update_recorder_config(call.data.get(ATTR_BACKUP_CONFIG, True))
    
    async def handle_purge_all_entities(call: ServiceCall):
        await manager.purge_all_entities(call.data.get(ATTR_FORCE_PURGE, False))

    # Registrar serviços existentes
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_ENTITY_STATE, handle_update_entity_state, UPDATE_ENTITY_STATE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_RECORDER_DAYS, handle_update_recorder_days, UPDATE_RECORDER_DAYS_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_UPDATE, handle_bulk_update, BULK_UPDATE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_DELETE_ENTITY, handle_delete_entity, DELETE_ENTITY_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_DELETE, handle_bulk_delete, BULK_DELETE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_PURGE_RECORDER, handle_purge_recorder, PURGE_RECORDER_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_RELOAD_CONFIG, handle_reload_config)
    hass.services.async_register(DOMAIN, SERVICE_INTELLIGENT_PURGE, handle_intelligent_purge, INTELLIGENT_PURGE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_GENERATE_RECORDER_REPORT, handle_generate_recorder_report, GENERATE_RECORDER_REPORT_SCHEMA)
    
    # Registrar novos serviços
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_RECORDER_EXCLUDE, handle_update_recorder_exclude, UPDATE_RECORDER_EXCLUDE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_BULK_UPDATE_RECORDER_EXCLUDE, handle_bulk_update_recorder_exclude, BULK_UPDATE_RECORDER_EXCLUDE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_RECORDER_CONFIG, handle_update_recorder_config, UPDATE_RECORDER_CONFIG_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_PURGE_ALL_ENTITIES, handle_purge_all_entities, PURGE_ALL_ENTITIES_SCHEMA)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Remover serviços existentes
    hass.services.async_remove(DOMAIN, SERVICE_UPDATE_ENTITY_STATE)
    hass.services.async_remove(DOMAIN, SERVICE_UPDATE_RECORDER_DAYS)
    hass.services.async_remove(DOMAIN, SERVICE_BULK_UPDATE)
    hass.services.async_remove(DOMAIN, SERVICE_DELETE_ENTITY)
    hass.services.async_remove(DOMAIN, SERVICE_BULK_DELETE)
    hass.services.async_remove(DOMAIN, SERVICE_PURGE_RECORDER)
    hass.services.async_remove(DOMAIN, SERVICE_RELOAD_CONFIG)
    hass.services.async_remove(DOMAIN, SERVICE_INTELLIGENT_PURGE)
    hass.services.async_remove(DOMAIN, SERVICE_GENERATE_RECORDER_REPORT)
    
    # Remover novos serviços
    hass.services.async_remove(DOMAIN, SERVICE_UPDATE_RECORDER_EXCLUDE)
    hass.services.async_remove(DOMAIN, SERVICE_BULK_UPDATE_RECORDER_EXCLUDE)
    hass.services.async_remove(DOMAIN, SERVICE_UPDATE_RECORDER_CONFIG)
    hass.services.async_remove(DOMAIN, SERVICE_PURGE_ALL_ENTITIES)
    
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
        entities = []

        # Buscar TODAS as entidades do registry (habilitadas e desabilitadas)
        for entity_entry in entity_registry.entities.values():
            entity_id = entity_entry.entity_id
            config = self._config.get(entity_id, {})
            
            # Determinar se está habilitada
            is_enabled = not entity_entry.disabled_by
            
            # Tentar pegar o estado atual (pode não existir se desabilitada)
            state_obj = self.hass.states.get(entity_id)
            
            if state_obj:
                # Entidade tem estado (provavelmente habilitada)
                entity_name = state_obj.name or entity_id
                entity_state = state_obj.state
            else:
                # Entidade não tem estado (provavelmente desabilitada)
                entity_name = entity_entry.name or entity_entry.original_name or entity_id
                entity_state = "disabled" if not is_enabled else "unavailable"
            
            # Determinar domínio da plataforma e integração
            platform = entity_entry.platform or "unknown"
            integration_domain = "homeassistant"
            
            if entity_entry.config_entry_id:
                config_entry = self.hass.config_entries.async_get_entry(entity_entry.config_entry_id)
                if config_entry:
                    integration_domain = config_entry.domain

            entities.append({
                "entity_id": entity_id,
                "name": entity_name,
                "state": entity_state,
                "domain": entity_id.split('.')[0],  # Pegar domínio do entity_id
                "platform": platform,
                "integration_domain": integration_domain,
                "enabled": is_enabled,
                "recorder_days": config.get("recorder_days", DEFAULT_RECORDER_DAYS),
                "recorder_exclude": config.get("recorder_exclude", False),
            })

        # Adicionar entidades que estão apenas no states mas não no registry (edge case)
        registry_entity_ids = {entry.entity_id for entry in entity_registry.entities.values()}
        all_states = self.hass.states.async_all()
        
        for state in all_states:
            entity_id = state.entity_id
            if entity_id not in registry_entity_ids:
                config = self._config.get(entity_id, {})
                
                entities.append({
                    "entity_id": entity_id,
                    "name": state.name or entity_id,
                    "state": state.state,
                    "domain": state.domain,
                    "platform": "unknown",
                    "integration_domain": "homeassistant",
                    "enabled": True,  # Se está em states, provavelmente está habilitada
                    "recorder_days": config.get("recorder_days", DEFAULT_RECORDER_DAYS),
                    "recorder_exclude": config.get("recorder_exclude", False),
                })

        # Ordenar por entity_id para consistência
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
        """Bulk update entities recorder exclude setting."""
        for entity_id in entity_ids:
            await self.update_recorder_exclude(entity_id, recorder_exclude)
        _LOGGER.info("Bulk updated recorder exclude for %d entities: %s", len(entity_ids), recorder_exclude)
    
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
    
    async def update_recorder_config(self, backup_config: bool = True) -> Dict[str, Any]:
        """Update Home Assistant configuration.yaml with recorder exclude settings."""
        result = {"status": "success", "message": "", "excluded_entities": []}
        
        try:
            config_path = self.hass.config.path(RECORDER_CONFIG_PATH)
            backup_path = self.hass.config.path(RECORDER_CONFIG_BACKUP_PATH)
            
            # Coletar entidades marcadas para exclusão
            excluded_entities = []
            for entity_id, config in self._config.items():
                if config.get("recorder_exclude", False):
                    excluded_entities.append(entity_id)
            
            result["excluded_entities"] = excluded_entities
            
            if not excluded_entities:
                result["message"] = "Nenhuma entidade marcada para exclusão do recorder."
                return result
            
            # Fazer backup se solicitado
            if backup_config and os.path.exists(config_path):
                await self.hass.async_add_executor_job(shutil.copy2, config_path, backup_path)
                _LOGGER.info("Backup created: %s", backup_path)
            
            # Ler configuração atual
            config_data = {}
            if os.path.exists(config_path):
                config_data = await self.hass.async_add_executor_job(self._load_yaml_file, config_path)
            
            # Atualizar configuração do recorder
            if "recorder" not in config_data:
                config_data["recorder"] = {}
            
            if "exclude" not in config_data["recorder"]:
                config_data["recorder"]["exclude"] = {}
            
            if "entities" not in config_data["recorder"]["exclude"]:
                config_data["recorder"]["exclude"]["entities"] = []
            
            # Adicionar entidades excluídas (evitar duplicatas)
            current_excluded = set(config_data["recorder"]["exclude"]["entities"])
            new_excluded = set(excluded_entities)
            all_excluded = sorted(current_excluded.union(new_excluded))
            config_data["recorder"]["exclude"]["entities"] = all_excluded
            
            # Salvar configuração atualizada
            await self.hass.async_add_executor_job(self._save_yaml_file, config_path, config_data)
            
            result["message"] = f"Configuração atualizada com {len(excluded_entities)} entidades excluídas. Reinicie o HA para aplicar."
            _LOGGER.info("Updated recorder configuration with %d excluded entities", len(excluded_entities))
            
        except Exception as e:
            _LOGGER.error("Error updating recorder configuration: %s", e, exc_info=True)
            result.update({"status": "error", "message": f"Erro ao atualizar configuração: {str(e)}"})
        
        return result
    
    async def purge_all_entities(self, force_purge: bool = False) -> Dict[str, Any]:
        """Execute recorder.purge_entities service."""
        result = {"status": "success", "message": "", "purged_entities": []}
        
        try:
            # Coletar entidades marcadas para exclusão
            excluded_entities = []
            for entity_id, config in self._config.items():
                if config.get("recorder_exclude", False):
                    excluded_entities.append(entity_id)
            
            if not excluded_entities and not force_purge:
                result["message"] = "Nenhuma entidade marcada para limpeza do recorder."
                return result
            
            # Executar purge_entities
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
        # Implementação simplificada - pode ser expandida
        pass

    async def intelligent_purge(self, force_purge: bool = False) -> Dict[str, Any]:
        """Execute intelligent purge based on entity configurations."""
        # Implementação simplificada - pode ser expandida
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