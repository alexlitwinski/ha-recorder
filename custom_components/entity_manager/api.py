"""API views for Entity Manager."""
import json
import logging
import os
from typing import Any, Dict

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry

from .const import DOMAIN, DEFAULT_RECORDER_DAYS

_LOGGER = logging.getLogger(__name__)


def setup_api(hass: HomeAssistant) -> None:
    """Set up the API views."""
    _LOGGER.info("Setting up Entity Manager API views")
    
    try:
        hass.http.register_view(EntityManagerConfigView)
        hass.http.register_view(EntityManagerEntitiesView)
        hass.http.register_view(EntityManagerPanelView)
        hass.http.register_view(EntityManagerStatusView)
        
        # Endpoints existentes
        hass.http.register_view(EntityManagerIntelligentPurgeView)
        hass.http.register_view(EntityManagerRecorderReportView)
        
        # Novos endpoints
        hass.http.register_view(EntityManagerUpdateRecorderConfigView)
        hass.http.register_view(EntityManagerPurgeAllEntitiesView)
        hass.http.register_view(EntityManagerBulkUpdateRecorderExcludeView)
        
        _LOGGER.info("Entity Manager API views registered successfully")
        
    except Exception as e:
        _LOGGER.error("Failed to register Entity Manager API views: %s", e, exc_info=True)


class EntityManagerStatusView(HomeAssistantView):
    """View to check if Entity Manager is running."""
    
    url = "/api/entity_manager/status"
    name = "api:entity_manager:status"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Get Entity Manager status."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"status": "error", "message": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        return web.Response(text=json.dumps({"status": "ok", "message": "Entity Manager is running"}), content_type="application/json")


class EntityManagerConfigView(HomeAssistantView):
    """View to handle entity manager configuration."""
    
    url = "/api/entity_manager/config"
    name = "api:entity_manager:config"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Get entity manager configuration."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        return web.Response(text=json.dumps(manager._config), content_type="application/json")
    
    async def post(self, request: web.Request) -> web.Response:
        """Update entity manager configuration."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            manager._config.update(data)
            await manager.save_config()
            return web.Response(text=json.dumps({"success": True}), content_type="application/json")
        except Exception as e:
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerEntitiesView(HomeAssistantView):
    """View to get all entities with their configurations."""
    
    url = "/api/entity_manager/entities"
    name = "api:entity_manager:entities"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Get all entities with their configurations."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            entities = await manager.get_all_entities()
            return web.Response(text=json.dumps(entities), content_type="application/json")
        except Exception as e:
            _LOGGER.error("API: Error getting entities: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": f"Error getting entities: {str(e)}"}), status=500, content_type="application/json")


class EntityManagerIntelligentPurgeView(HomeAssistantView):
    """View to execute intelligent purge."""
    
    url = "/api/entity_manager/intelligent_purge"
    name = "api:entity_manager:intelligent_purge"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            force_purge = data.get("force_purge", False)
            result = await manager.intelligent_purge(force_purge)
            return web.Response(text=json.dumps(result), content_type="application/json")
        except Exception as e:
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerRecorderReportView(HomeAssistantView):
    """View to generate recorder report."""
    
    url = "/api/entity_manager/recorder_report"
    name = "api:entity_manager:recorder_report"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Generate recorder report."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            limit = data.get("limit", 100)
            days_back = data.get("days_back", 30)
            
            _LOGGER.info("API: Generating recorder report (limit=%d, days_back=%d)", limit, days_back)
            
            result = await manager.generate_recorder_report(limit, days_back)
            
            if result.get("report_file"):
                download_url = f"/local/{result['report_file']}"
                
                response_data = {
                    "status": result.get("status"),
                    "entities_analyzed": result.get("entities_analyzed"),
                    "total_records": result.get("total_records"),
                    "report_file": result.get("report_file"),
                    "download_url": download_url,
                    "report_data": result.get("report_data", [])
                }
                
                if result.get("status") == "error":
                    response_data["error"] = result.get("error", "Unknown error")
                
                return web.Response(text=json.dumps(response_data), content_type="application/json")
            else:
                return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error generating recorder report: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerUpdateRecorderConfigView(HomeAssistantView):
    """View to update recorder configuration."""
    
    url = "/api/entity_manager/update_recorder_config"
    name = "api:entity_manager:update_recorder_config"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Update recorder configuration with excluded entities."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            backup_config = data.get("backup_config", True)
            
            _LOGGER.info("API: Updating recorder configuration (backup=%s)", backup_config)
            
            result = await manager.update_recorder_config(backup_config)
            return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error updating recorder configuration: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerPurgeAllEntitiesView(HomeAssistantView):
    """View to execute purge_entities."""
    
    url = "/api/entity_manager/purge_all_entities"
    name = "api:entity_manager:purge_all_entities"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Execute recorder.purge_entities service."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            force_purge = data.get("force_purge", False)
            
            _LOGGER.info("API: Executing purge_all_entities (force=%s)", force_purge)
            
            result = await manager.purge_all_entities(force_purge)
            return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error executing purge_all_entities: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerBulkUpdateRecorderExcludeView(HomeAssistantView):
    """View to bulk update recorder exclude setting."""
    
    url = "/api/entity_manager/bulk_update_recorder_exclude"
    name = "api:entity_manager:bulk_update_recorder_exclude"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Bulk update entities recorder exclude setting."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            entity_ids = data.get("entity_ids", [])
            recorder_exclude = data.get("recorder_exclude", False)
            
            if not entity_ids:
                return web.Response(text=json.dumps({"error": "No entity_ids provided"}), status=400, content_type="application/json")
            
            _LOGGER.info("API: Bulk updating recorder exclude for %d entities: %s", len(entity_ids), recorder_exclude)
            
            await manager.bulk_update_recorder_exclude(entity_ids, recorder_exclude)
            
            result = {
                "success": True,
                "message": f"Updated recorder_exclude for {len(entity_ids)} entities",
                "entity_count": len(entity_ids),
                "recorder_exclude": recorder_exclude
            }
            
            return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error bulk updating recorder exclude: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerPanelView(HomeAssistantView):
    """View to serve the Entity Manager panel."""
    
    url = "/entity_manager"
    name = "entity_manager:panel"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Serve the Entity Manager panel."""
        # Implementação simplificada
        return web.Response(text="Panel HTML would be here", content_type="text/html")