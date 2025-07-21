"""Constants for Entity Manager integration."""
import voluptuous as vol
import homeassistant.helpers.config_validation as cv

DOMAIN = "entity_manager"

# Configuration
CONF_ENTITIES_CONFIG = "entities_config"
CONF_DEFAULT_RECORDER_DAYS = "default_recorder_days"

# Default values
DEFAULT_RECORDER_DAYS = 10
DEFAULT_DOMAIN_RECORDER_DAYS = 30
CONFIG_FILE = "entity_manager_config.json"
DOMAIN_CONFIG_FILE = "entity_manager_domains.json"

# Services
SERVICE_UPDATE_ENTITY_STATE = "update_entity_state"
SERVICE_UPDATE_RECORDER_DAYS = "update_recorder_days"
SERVICE_BULK_UPDATE = "bulk_update"
SERVICE_PURGE_RECORDER = "purge_recorder"
SERVICE_RELOAD_CONFIG = "reload_config"
SERVICE_DELETE_ENTITY = "delete_entity"
SERVICE_BULK_DELETE = "bulk_delete"

# Existing services
SERVICE_INTELLIGENT_PURGE = "intelligent_purge"
SERVICE_GENERATE_RECORDER_REPORT = "generate_recorder_report"
SERVICE_UPDATE_RECORDER_EXCLUDE = "update_recorder_exclude"
SERVICE_BULK_UPDATE_RECORDER_EXCLUDE = "bulk_update_recorder_exclude"
SERVICE_UPDATE_RECORDER_CONFIG = "update_recorder_config"
SERVICE_PURGE_ALL_ENTITIES = "purge_all_entities"

# DOMAIN SERVICES - UPDATED
SERVICE_EXCLUDE_DOMAIN = "exclude_domain"
SERVICE_INCLUDE_DOMAIN = "include_domain"
SERVICE_BULK_EXCLUDE_DOMAINS = "bulk_exclude_domains"
SERVICE_UPDATE_DOMAIN_RECORDER_DAYS = "update_domain_recorder_days"
SERVICE_BULK_UPDATE_DOMAIN_RECORDER_DAYS = "bulk_update_domain_recorder_days"

# Attributes
ATTR_ENTITY_ID = "entity_id"
ATTR_ENTITY_IDS = "entity_ids"
ATTR_ENABLED = "enabled"
ATTR_RECORDER_DAYS = "recorder_days"
ATTR_FORCE_PURGE = "force_purge"
ATTR_RECORDER_EXCLUDE = "recorder_exclude"
ATTR_BACKUP_CONFIG = "backup_config"

# New attributes
ATTR_LIMIT = "limit"
ATTR_DAYS_BACK = "days_back"
ATTR_DOMAIN = "domain"
ATTR_DOMAINS = "domains"
ATTR_DOMAIN_RECORDER_DAYS = "domain_recorder_days"

# Events
EVENT_ENTITY_MANAGER_UPDATED = "entity_manager_updated"

# Recorder config - USING SEPARATE recorder.yaml
RECORDER_CONFIG_PATH = "configuration.yaml"
RECORDER_YAML_PATH = "recorder.yaml"
RECORDER_CONFIG_BACKUP_PATH = "configuration.yaml.entity_manager_backup"
RECORDER_YAML_BACKUP_PATH = "recorder.yaml.entity_manager_backup"

# SCHEMAS
UPDATE_RECORDER_EXCLUDE_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_ID): cv.entity_id,
    vol.Required(ATTR_RECORDER_EXCLUDE): cv.boolean,
})

BULK_UPDATE_RECORDER_EXCLUDE_SCHEMA = vol.Schema({
    vol.Required(ATTR_ENTITY_IDS): cv.entity_ids,
    vol.Required(ATTR_RECORDER_EXCLUDE): cv.boolean,
})

UPDATE_RECORDER_CONFIG_SCHEMA = vol.Schema({
    vol.Optional(ATTR_BACKUP_CONFIG, default=True): cv.boolean,
})

INTELLIGENT_PURGE_SCHEMA = vol.Schema({
    vol.Optional(ATTR_FORCE_PURGE, default=False): cv.boolean,
})

GENERATE_RECORDER_REPORT_SCHEMA = vol.Schema({
    vol.Optional(ATTR_LIMIT, default=100): vol.All(int, vol.Range(min=1, max=1000)),
    vol.Optional(ATTR_DAYS_BACK, default=30): vol.All(int, vol.Range(min=1, max=365)),
})

PURGE_ALL_ENTITIES_SCHEMA = vol.Schema({
    vol.Optional(ATTR_FORCE_PURGE, default=False): cv.boolean,
})

# UPDATED DOMAIN SCHEMAS
EXCLUDE_DOMAIN_SCHEMA = vol.Schema({
    vol.Required(ATTR_DOMAIN): cv.string,
    vol.Optional(ATTR_RECORDER_EXCLUDE, default=True): cv.boolean,
    vol.Optional(ATTR_RECORDER_DAYS): vol.All(int, vol.Range(min=0, max=365)),
})

INCLUDE_DOMAIN_SCHEMA = vol.Schema({
    vol.Required(ATTR_DOMAIN): cv.string,
    vol.Optional(ATTR_RECORDER_DAYS): vol.All(int, vol.Range(min=0, max=365)),
})

BULK_EXCLUDE_DOMAINS_SCHEMA = vol.Schema({
    vol.Required(ATTR_DOMAINS): vol.All(cv.ensure_list, [cv.string]),
    vol.Optional(ATTR_RECORDER_EXCLUDE, default=True): cv.boolean,
    vol.Optional(ATTR_RECORDER_DAYS): vol.All(int, vol.Range(min=0, max=365)),
})

# NEW DOMAIN RECORDER DAYS SCHEMAS
UPDATE_DOMAIN_RECORDER_DAYS_SCHEMA = vol.Schema({
    vol.Required(ATTR_DOMAIN): cv.string,
    vol.Required(ATTR_DOMAIN_RECORDER_DAYS): vol.All(int, vol.Range(min=0, max=365)),
})

BULK_UPDATE_DOMAIN_RECORDER_DAYS_SCHEMA = vol.Schema({
    vol.Required(ATTR_DOMAINS): vol.All(cv.ensure_list, [cv.string]),
    vol.Required(ATTR_DOMAIN_RECORDER_DAYS): vol.All(int, vol.Range(min=0, max=365)),
})