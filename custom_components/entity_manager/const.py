"""Constants for Entity Manager integration."""

DOMAIN = "entity_manager"

# Configuration
CONF_ENTITIES_CONFIG = "entities_config"
CONF_DEFAULT_RECORDER_DAYS = "default_recorder_days"

# Default values
DEFAULT_RECORDER_DAYS = 10
CONFIG_FILE = "entity_manager_config.json"

# Services
SERVICE_UPDATE_ENTITY_STATE = "update_entity_state"
SERVICE_UPDATE_RECORDER_DAYS = "update_recorder_days"
SERVICE_BULK_UPDATE = "bulk_update"
SERVICE_PURGE_RECORDER = "purge_recorder"
SERVICE_RELOAD_CONFIG = "reload_config"
SERVICE_DELETE_ENTITY = "delete_entity"
SERVICE_BULK_DELETE = "bulk_delete"

# Attributes
ATTR_ENTITY_ID = "entity_id"
ATTR_ENTITY_IDS = "entity_ids"
ATTR_ENABLED = "enabled"
ATTR_RECORDER_DAYS = "recorder_days"
ATTR_FORCE_PURGE = "force_purge"

# Events
EVENT_ENTITY_MANAGER_UPDATED = "entity_manager_updated"