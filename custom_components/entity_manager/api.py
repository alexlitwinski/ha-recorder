"""API views for Entity Manager."""
import json
import logging
from typing import Any, Dict

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry

from .const import DOMAIN, DEFAULT_RECORDER_DAYS

_LOGGER = logging.getLogger(__name__)


def setup_api(hass: HomeAssistant) -> None:
    """Set up the API views."""
    hass.http.register_view(EntityManagerConfigView)
    hass.http.register_view(EntityManagerEntitiesView)
    hass.http.register_view(EntityManagerPanelView)


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
            return web.Response(
                text=json.dumps({"error": "Entity Manager not initialized"}),
                status=500,
                content_type="application/json"
            )
        
        try:
            return web.Response(
                text=json.dumps(manager._config),
                content_type="application/json"
            )
        except Exception as e:
            _LOGGER.error("Error getting config: %s", e)
            return web.Response(
                text=json.dumps({"error": str(e)}),
                status=500,
                content_type="application/json"
            )
    
    async def post(self, request: web.Request) -> web.Response:
        """Update entity manager configuration."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(
                text=json.dumps({"error": "Entity Manager not initialized"}),
                status=500,
                content_type="application/json"
            )
        
        try:
            data = await request.json()
            manager._config.update(data)
            await manager.save_config()
            
            return web.Response(
                text=json.dumps({"success": True}),
                content_type="application/json"
            )
        except Exception as e:
            _LOGGER.error("Error updating config: %s", e)
            return web.Response(
                text=json.dumps({"error": str(e)}),
                status=500,
                content_type="application/json"
            )


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
            _LOGGER.error("Entity Manager not initialized")
            return web.Response(
                text=json.dumps({"error": "Entity Manager not initialized"}),
                status=500,
                content_type="application/json"
            )
        
        try:
            _LOGGER.debug("API: Getting all entities")
            
            # Chamar a função do manager que já tem o tratamento correto
            entities = await manager.get_all_entities()
            
            _LOGGER.info("API: Successfully retrieved %d entities", len(entities))
            
            # Verificar se os dados são JSON-serializáveis antes de retornar
            try:
                json_data = json.dumps(entities)
                return web.Response(
                    text=json_data,
                    content_type="application/json"
                )
            except (TypeError, ValueError) as json_error:
                _LOGGER.error("API: JSON serialization error: %s", json_error)
                return web.Response(
                    text=json.dumps({"error": f"JSON serialization error: {str(json_error)}"}),
                    status=500,
                    content_type="application/json"
                )
            
        except Exception as e:
            _LOGGER.error("API: Error getting entities: %s", e, exc_info=True)
            return web.Response(
                text=json.dumps({"error": f"Error getting entities: {str(e)}"}),
                status=500,
                content_type="application/json"
            )


class EntityManagerPanelView(HomeAssistantView):
    """View to serve the Entity Manager panel."""
    
    url = "/entity_manager"
    name = "entity_manager:panel"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Serve the Entity Manager panel."""
        hass = request.app["hass"]
        
        # Ler o arquivo HTML do painel
        panel_path = hass.config.path("custom_components", DOMAIN, "panel-v2.html")
        
        try:
            with open(panel_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            return web.Response(
                text=html_content,
                content_type="text/html"
            )
        except FileNotFoundError:
            _LOGGER.warning("Panel HTML file not found: %s", panel_path)
            return web.Response(
                text="<h1>Entity Manager Panel not found</h1><p>Panel file is missing. Please check the installation.</p>",
                status=404,
                content_type="text/html"
            )
        except Exception as e:
            _LOGGER.error("Error serving panel: %s", e)
            return web.Response(
                text=f"<h1>Error loading panel: {e}</h1>",
                status=500,
                content_type="text/html"
            )