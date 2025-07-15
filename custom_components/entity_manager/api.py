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
        
        # Novos endpoints
        hass.http.register_view(EntityManagerIntelligentPurgeView)
        hass.http.register_view(EntityManagerRecorderReportView)
        hass.http.register_view(EntityManagerDownloadReportView)
        
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
            _LOGGER.error("Entity Manager not found in hass.data")
            return web.Response(
                text=json.dumps({
                    "status": "error",
                    "message": "Entity Manager not initialized",
                    "integration_loaded": False
                }),
                status=500,
                content_type="application/json"
            )
        
        return web.Response(
            text=json.dumps({
                "status": "ok",
                "message": "Entity Manager is running",
                "integration_loaded": True,
                "version": "1.2.0"
            }),
            content_type="application/json"
        )


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
            _LOGGER.error("Entity Manager not found in hass.data for config request")
            return web.Response(
                text=json.dumps({"error": "Entity Manager not initialized"}),
                status=500,
                content_type="application/json"
            )
        
        try:
            _LOGGER.debug("Returning Entity Manager configuration")
            return web.Response(
                text=json.dumps(manager._config),
                content_type="application/json"
            )
        except Exception as e:
            _LOGGER.error("Error getting config: %s", e, exc_info=True)
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
            _LOGGER.error("Entity Manager not found in hass.data for config update")
            return web.Response(
                text=json.dumps({"error": "Entity Manager not initialized"}),
                status=500,
                content_type="application/json"
            )
        
        try:
            data = await request.json()
            manager._config.update(data)
            await manager.save_config()
            
            _LOGGER.info("Entity Manager configuration updated successfully")
            return web.Response(
                text=json.dumps({"success": True}),
                content_type="application/json"
            )
        except Exception as e:
            _LOGGER.error("Error updating config: %s", e, exc_info=True)
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
            _LOGGER.error("Entity Manager not found in hass.data for entities request")
            return web.Response(
                text=json.dumps({
                    "error": "Entity Manager not initialized",
                    "details": "Integration may not be installed or loaded properly"
                }),
                status=500,
                content_type="application/json"
            )
        
        try:
            _LOGGER.debug("API: Getting all entities from manager")
            
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
                    text=json.dumps({
                        "error": f"JSON serialization error: {str(json_error)}",
                        "entity_count": len(entities)
                    }),
                    status=500,
                    content_type="application/json"
                )
            
        except Exception as e:
            _LOGGER.error("API: Error getting entities: %s", e, exc_info=True)
            return web.Response(
                text=json.dumps({
                    "error": f"Error getting entities: {str(e)}",
                    "integration_status": "loaded" if manager else "not_loaded"
                }),
                status=500,
                content_type="application/json"
            )


class EntityManagerIntelligentPurgeView(HomeAssistantView):
    """View to execute intelligent purge."""
    
    url = "/api/entity_manager/intelligent_purge"
    name = "api:entity_manager:intelligent_purge"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Execute intelligent purge."""
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
            force_purge = data.get("force_purge", False)
            
            _LOGGER.info("API: Starting intelligent purge (force_purge=%s)", force_purge)
            
            result = await manager.intelligent_purge(force_purge)
            
            return web.Response(
                text=json.dumps(result),
                content_type="application/json"
            )
            
        except Exception as e:
            _LOGGER.error("API: Error in intelligent purge: %s", e, exc_info=True)
            return web.Response(
                text=json.dumps({"error": str(e)}),
                status=500,
                content_type="application/json"
            )


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
            return web.Response(
                text=json.dumps({"error": "Entity Manager not initialized"}),
                status=500,
                content_type="application/json"
            )
        
        try:
            data = await request.json()
            limit = data.get("limit", 100)
            days_back = data.get("days_back", 30)
            
            _LOGGER.info("API: Generating recorder report (limit=%d, days_back=%d)", limit, days_back)
            
            result = await manager.generate_recorder_report(limit, days_back)
            
            # Não retornar o report_data completo na resposta da API para economizar bandwidth
            response_data = {
                "status": result["status"],
                "entities_analyzed": result["entities_analyzed"],
                "total_records": result["total_records"],
                "report_file": os.path.basename(result["report_file"]),  # Apenas o nome do arquivo
                "download_url": f"/api/entity_manager/download_report/{os.path.basename(result['report_file'])}"
            }
            
            return web.Response(
                text=json.dumps(response_data),
                content_type="application/json"
            )
            
        except Exception as e:
            _LOGGER.error("API: Error generating recorder report: %s", e, exc_info=True)
            return web.Response(
                text=json.dumps({"error": str(e)}),
                status=500,
                content_type="application/json"
            )


class EntityManagerDownloadReportView(HomeAssistantView):
    """View to download recorder report."""
    
    url = "/api/entity_manager/download_report/{filename}"
    name = "api:entity_manager:download_report"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Download recorder report."""
        hass = request.app["hass"]
        filename = request.match_info["filename"]
        
        # Validar nome do arquivo por segurança
        if not filename.startswith("recorder_report_") or not filename.endswith(".json"):
            return web.Response(
                text="Invalid filename",
                status=400
            )
        
        report_path = hass.config.path("custom_components", DOMAIN, filename)
        
        if not os.path.exists(report_path):
            return web.Response(
                text="Report file not found",
                status=404
            )
        
        try:
            with open(report_path, 'r', encoding='utf-8') as f:
                report_content = f.read()
            
            return web.Response(
                text=report_content,
                content_type="application/json",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )
            
        except Exception as e:
            _LOGGER.error("Error downloading report: %s", e)
            return web.Response(
                text=f"Error reading report: {e}",
                status=500
            )


class EntityManagerPanelView(HomeAssistantView):
    """View to serve the Entity Manager panel."""
    
    url = "/entity_manager"
    name = "entity_manager:panel"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Serve the Entity Manager panel."""
        hass = request.app["hass"]
        
        # Verificar se a integração está carregada
        manager = hass.data.get(DOMAIN)
        if not manager:
            _LOGGER.warning("Entity Manager not loaded, but serving panel anyway")
        
        # Ler o arquivo HTML do painel
        panel_path = hass.config.path("custom_components", DOMAIN, "panel-v5.html")
        
        try:
            with open(panel_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            _LOGGER.debug("Successfully served Entity Manager panel")
            return web.Response(
                text=html_content,
                content_type="text/html"
            )
        except FileNotFoundError:
            _LOGGER.error("Panel HTML file not found: %s", panel_path)
            error_html = f"""
            <html>
            <head><title>Entity Manager - Erro</title></head>
            <body>
                <h1>Entity Manager - Arquivo do Painel Não Encontrado</h1>
                <p>O arquivo do painel não foi encontrado em: <code>{panel_path}</code></p>
                <p>Verifique se a integração foi instalada corretamente.</p>
                <h2>Troubleshooting:</h2>
                <ul>
                    <li>Verifique se todos os arquivos estão na pasta <code>custom_components/entity_manager/</code></li>
                    <li>Reinicie o Home Assistant</li>
                    <li>Verifique os logs para mais detalhes</li>
                </ul>
            </body>
            </html>
            """
            return web.Response(
                text=error_html,
                status=404,
                content_type="text/html"
            )
        except Exception as e:
            _LOGGER.error("Error serving panel: %s", e, exc_info=True)
            error_html = f"""
            <html>
            <head><title>Entity Manager - Erro</title></head>
            <body>
                <h1>Entity Manager - Erro ao Carregar Painel</h1>
                <p>Erro: {str(e)}</p>
                <p>Verifique os logs do Home Assistant para mais detalhes.</p>
            </body>
            </html>
            """
            return web.Response(
                text=error_html,
                status=500,
                content_type="text/html"
            )