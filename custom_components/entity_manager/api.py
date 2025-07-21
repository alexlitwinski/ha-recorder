"""API views for Entity Manager."""
import json
import logging
import os
from typing import Any, Dict

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry

from .const import DOMAIN, DEFAULT_RECORDER_DAYS, DEFAULT_DOMAIN_RECORDER_DAYS

_LOGGER = logging.getLogger(__name__)


def setup_api(hass: HomeAssistant) -> None:
    """Set up the API views."""
    _LOGGER.info("Setting up Entity Manager API views")
    
    try:
        # Basic views
        hass.http.register_view(EntityManagerStatusView())
        hass.http.register_view(EntityManagerConfigView())
        hass.http.register_view(EntityManagerEntitiesView())
        hass.http.register_view(EntityManagerPanelView())
        
        # Existing endpoints
        hass.http.register_view(EntityManagerIntelligentPurgeView())
        hass.http.register_view(EntityManagerRecorderReportView())
        hass.http.register_view(EntityManagerUpdateRecorderConfigView())
        hass.http.register_view(EntityManagerPurgeAllEntitiesView())
        hass.http.register_view(EntityManagerBulkUpdateRecorderExcludeView())
        
        # UPDATED DOMAIN ENDPOINTS
        hass.http.register_view(EntityManagerExcludeDomainView())
        hass.http.register_view(EntityManagerIncludeDomainView())
        hass.http.register_view(EntityManagerBulkExcludeDomainsView())
        hass.http.register_view(EntityManagerGetDomainsView())
        
        # NEW DOMAIN RECORDER DAYS ENDPOINTS
        hass.http.register_view(EntityManagerUpdateDomainRecorderDaysView())
        hass.http.register_view(EntityManagerBulkUpdateDomainRecorderDaysView())
        
        _LOGGER.info("Entity Manager API views registered successfully")
        
        # Log registered endpoints for debugging
        _LOGGER.debug("Registered API endpoints:")
        _LOGGER.debug("- GET /api/entity_manager/status")
        _LOGGER.debug("- GET/POST /api/entity_manager/config")
        _LOGGER.debug("- GET /api/entity_manager/entities")
        _LOGGER.debug("- GET /api/entity_manager/domains")
        _LOGGER.debug("- POST /api/entity_manager/exclude_domain")
        _LOGGER.debug("- POST /api/entity_manager/include_domain")
        _LOGGER.debug("- POST /api/entity_manager/bulk_exclude_domains")
        _LOGGER.debug("- POST /api/entity_manager/update_domain_recorder_days")
        _LOGGER.debug("- POST /api/entity_manager/bulk_update_domain_recorder_days")
        
    except Exception as e:
        _LOGGER.error("Failed to register Entity Manager API views: %s", e, exc_info=True)
        raise


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
        
        config_data = {
            "entities": manager._config,
            "domains": manager._domain_config
        }
        return web.Response(text=json.dumps(config_data), content_type="application/json")
    
    async def post(self, request: web.Request) -> web.Response:
        """Update entity manager configuration."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            if "entities" in data:
                manager._config.update(data["entities"])
                await manager.save_config()
            if "domains" in data:
                manager._domain_config.update(data["domains"])
                await manager.save_domain_config()
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
        """Update recorder configuration with excluded entities and domains."""
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


# UPDATED AND NEW API VIEWS FOR DOMAIN MANAGEMENT

class EntityManagerGetDomainsView(HomeAssistantView):
    """View to get all available domains with entity counts and recorder configuration."""
    
    url = "/api/entity_manager/domains"
    name = "api:entity_manager:domains"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Get all domains with entity counts, exclusion status, and recorder days configuration."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            entities = await manager.get_all_entities()
            domains = {}
            
            # Count entities and excluded entities per domain
            for entity in entities:
                domain = entity["domain"]
                if domain not in domains:
                    domains[domain] = {
                        "domain": domain,
                        "total_entities": 0,
                        "excluded_entities": 0,
                        "enabled_entities": 0,
                        "disabled_entities": 0,
                        "recorder_days": DEFAULT_DOMAIN_RECORDER_DAYS,
                        "has_domain_config": False
                    }
                
                domains[domain]["total_entities"] += 1
                
                if entity.get("recorder_exclude", False):
                    domains[domain]["excluded_entities"] += 1
                
                if entity.get("enabled", True):
                    domains[domain]["enabled_entities"] += 1
                else:
                    domains[domain]["disabled_entities"] += 1
            
            # Add domain configuration information
            for domain, domain_info in domains.items():
                domain_config = manager._domain_config.get(domain, {})
                if domain_config:
                    domain_info["has_domain_config"] = True
                    domain_info["recorder_days"] = domain_config.get("recorder_days", DEFAULT_DOMAIN_RECORDER_DAYS)
                    domain_info["domain_recorder_exclude"] = domain_config.get("recorder_exclude", False)
                else:
                    domain_info["domain_recorder_exclude"] = False
            
            # Calculate exclusion percentage and add status
            for domain_info in domains.values():
                total = domain_info["total_entities"]
                excluded = domain_info["excluded_entities"]
                domain_excluded = domain_info.get("domain_recorder_exclude", False)
                
                if domain_excluded:
                    # Domain is configured to be excluded
                    domain_info["exclusion_percentage"] = 100.0
                    domain_info["status"] = "fully_excluded"
                elif total > 0:
                    exclusion_percentage = (excluded / total) * 100
                    domain_info["exclusion_percentage"] = round(exclusion_percentage, 1)
                    
                    if exclusion_percentage >= 90:
                        domain_info["status"] = "fully_excluded"
                    elif exclusion_percentage >= 50:
                        domain_info["status"] = "partially_excluded"
                    else:
                        domain_info["status"] = "included"
                else:
                    domain_info["exclusion_percentage"] = 0
                    domain_info["status"] = "empty"
            
            # Sort by domain name
            sorted_domains = sorted(domains.values(), key=lambda x: x["domain"])
            
            return web.Response(text=json.dumps(sorted_domains), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error getting domains: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerExcludeDomainView(HomeAssistantView):
    """View to exclude a domain from recorder."""
    
    url = "/api/entity_manager/exclude_domain"
    name = "api:entity_manager:exclude_domain"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Exclude all entities from a domain with optional recorder days."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            domain = data.get("domain")
            recorder_exclude = data.get("recorder_exclude", True)
            recorder_days = data.get("recorder_days")
            
            if not domain:
                return web.Response(text=json.dumps({"error": "No domain provided"}), status=400, content_type="application/json")
            
            _LOGGER.info("API: Excluding domain %s from recorder: %s (days: %s)", domain, recorder_exclude, recorder_days)
            
            await manager.exclude_domain(domain, recorder_exclude, recorder_days)
            
            result = {
                "success": True,
                "message": f"Domain {domain} {'excluded from' if recorder_exclude else 'included in'} recorder",
                "domain": domain,
                "recorder_exclude": recorder_exclude,
                "recorder_days": recorder_days
            }
            
            return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error excluding domain: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerIncludeDomainView(HomeAssistantView):
    """View to include a domain in recorder."""
    
    url = "/api/entity_manager/include_domain"
    name = "api:entity_manager:include_domain"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Include all entities from a domain in recorder with optional recorder days."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            domain = data.get("domain")
            recorder_days = data.get("recorder_days")
            
            if not domain:
                return web.Response(text=json.dumps({"error": "No domain provided"}), status=400, content_type="application/json")
            
            _LOGGER.info("API: Including domain %s in recorder (days: %s)", domain, recorder_days)
            
            await manager.include_domain(domain, recorder_days)
            
            result = {
                "success": True,
                "message": f"Domain {domain} included in recorder",
                "domain": domain,
                "recorder_exclude": False,
                "recorder_days": recorder_days
            }
            
            return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error including domain: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerBulkExcludeDomainsView(HomeAssistantView):
    """View to bulk exclude/include multiple domains."""
    
    url = "/api/entity_manager/bulk_exclude_domains"
    name = "api:entity_manager:bulk_exclude_domains"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Bulk exclude/include multiple domains with optional recorder days."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            domains = data.get("domains", [])
            recorder_exclude = data.get("recorder_exclude", True)
            recorder_days = data.get("recorder_days")
            
            if not domains:
                return web.Response(text=json.dumps({"error": "No domains provided"}), status=400, content_type="application/json")
            
            _LOGGER.info("API: Bulk excluding %d domains from recorder: %s (days: %s)", len(domains), recorder_exclude, recorder_days)
            
            await manager.bulk_exclude_domains(domains, recorder_exclude, recorder_days)
            
            result = {
                "success": True,
                "message": f"{len(domains)} domains {'excluded from' if recorder_exclude else 'included in'} recorder",
                "domains": domains,
                "recorder_exclude": recorder_exclude,
                "recorder_days": recorder_days
            }
            
            return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error bulk excluding domains: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


# NEW API VIEWS FOR DOMAIN RECORDER DAYS MANAGEMENT

class EntityManagerUpdateDomainRecorderDaysView(HomeAssistantView):
    """View to update recorder days for a domain."""
    
    url = "/api/entity_manager/update_domain_recorder_days"
    name = "api:entity_manager:update_domain_recorder_days"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Update recorder days for a domain."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            domain = data.get("domain")
            recorder_days = data.get("recorder_days")
            
            if not domain:
                return web.Response(text=json.dumps({"error": "No domain provided"}), status=400, content_type="application/json")
            
            if recorder_days is None:
                return web.Response(text=json.dumps({"error": "No recorder_days provided"}), status=400, content_type="application/json")
            
            _LOGGER.info("API: Updating recorder days for domain %s: %d", domain, recorder_days)
            
            await manager.update_domain_recorder_days(domain, recorder_days)
            
            result = {
                "success": True,
                "message": f"Domain {domain} recorder days updated to {recorder_days}",
                "domain": domain,
                "recorder_days": recorder_days
            }
            
            return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error updating domain recorder days: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerBulkUpdateDomainRecorderDaysView(HomeAssistantView):
    """View to bulk update recorder days for multiple domains."""
    
    url = "/api/entity_manager/bulk_update_domain_recorder_days"
    name = "api:entity_manager:bulk_update_domain_recorder_days"
    requires_auth = True
    
    async def post(self, request: web.Request) -> web.Response:
        """Bulk update recorder days for multiple domains."""
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN)
        
        if not manager:
            return web.Response(text=json.dumps({"error": "Entity Manager not initialized"}), status=500, content_type="application/json")
        
        try:
            data = await request.json()
            domains = data.get("domains", [])
            recorder_days = data.get("recorder_days")
            
            if not domains:
                return web.Response(text=json.dumps({"error": "No domains provided"}), status=400, content_type="application/json")
            
            if recorder_days is None:
                return web.Response(text=json.dumps({"error": "No recorder_days provided"}), status=400, content_type="application/json")
            
            _LOGGER.info("API: Bulk updating recorder days for %d domains: %d", len(domains), recorder_days)
            
            await manager.bulk_update_domain_recorder_days(domains, recorder_days)
            
            result = {
                "success": True,
                "message": f"{len(domains)} domains recorder days updated to {recorder_days}",
                "domains": domains,
                "recorder_days": recorder_days
            }
            
            return web.Response(text=json.dumps(result), content_type="application/json")
            
        except Exception as e:
            _LOGGER.error("API: Error bulk updating domain recorder days: %s", e, exc_info=True)
            return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type="application/json")


class EntityManagerPanelView(HomeAssistantView):
    """View to serve the Entity Manager panel."""
    
    url = "/entity_manager"
    name = "entity_manager:panel"
    requires_auth = True
    
    async def get(self, request: web.Request) -> web.Response:
        """Serve the Entity Manager panel."""
        # Simplified implementation
        return web.Response(text="Panel HTML would be here", content_type="text/html")