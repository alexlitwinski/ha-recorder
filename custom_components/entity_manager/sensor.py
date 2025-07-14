"""Sensor platform for Entity Manager."""
import logging
from typing import Any, Dict

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Entity Manager sensor."""
    manager = hass.data[DOMAIN]
    
    async_add_entities([
        EntityManagerSensor(hass, manager),
    ])


class EntityManagerSensor(SensorEntity):
    """Entity Manager sensor."""
    
    def __init__(self, hass: HomeAssistant, manager):
        """Initialize the sensor."""
        self.hass = hass
        self._manager = manager
        self._attr_name = "Entity Manager Stats"
        self._attr_unique_id = f"{DOMAIN}_stats"
        self._attr_icon = "mdi:view-grid"
        self._attributes: Dict[str, Any] = {}
        
    @property
    def state(self) -> int:
        """Return the number of managed entities."""
        return len(self._manager._config)
    
    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        """Return sensor attributes."""
        return self._attributes
    
    async def async_update(self) -> None:
        """Update the sensor."""
        await self._manager.load_config()
        
        # AQUI ESTÁ A CORREÇÃO: remoção do 'await'
        entity_registry = async_get_entity_registry(self.hass)
        
        total_entities = len(entity_registry.entities)
        managed_entities = len(self._manager._config)
        
        enabled_entities_count = 0
        domains: Dict[str, int] = {}
        states: Dict[str, int] = {}

        for entity in entity_registry.entities.values():
            if not entity.disabled_by:
                enabled_entities_count += 1
            
            domain = entity.entity_id.split('.')[0]
            domains[domain] = domains.get(domain, 0) + 1

            state_obj = self.hass.states.get(entity.entity_id)
            state_val = "not_provided"
            if state_obj:
                state_val = state_obj.state
            
            states[state_val] = states.get(state_val, 0) + 1
            
        disabled_entities_count = total_entities - enabled_entities_count
        
        recorder_config: Dict[str, int] = {}
        for config in self._manager._config.values():
            days = config.get('recorder_days', DEFAULT_RECORDER_DAYS)
            key = f"entities_with_{days}_days"
            recorder_config[key] = recorder_config.get(key, 0) + 1
        
        self._attributes = {
            "total_entities": total_entities,
            "managed_entities": managed_entities,
            "enabled_entities": enabled_entities_count,
            "disabled_entities": disabled_entities_count,
            "domains": domains,
            "states": states,
            "recorder_config": recorder_config,
            "config_file": self._manager._config_path,
        }