"""Config flow for Entity Manager integration."""
import logging
from typing import Any, Dict, Optional

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, DEFAULT_RECORDER_DAYS, CONF_DEFAULT_RECORDER_DAYS

_LOGGER = logging.getLogger(__name__)

DATA_SCHEMA = vol.Schema({
    vol.Optional(CONF_DEFAULT_RECORDER_DAYS, default=DEFAULT_RECORDER_DAYS): vol.All(
        int, vol.Range(min=0, max=365)
    ),
})


class EntityManagerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Entity Manager."""

    VERSION = 1

    async def async_step_user(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: Dict[str, str] = {}

        if user_input is not None:
            # Check if already configured
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()

            return self.async_create_entry(
                title="Entity Manager",
                data=user_input,
            )

        return self.async_show_form(
            step_id="user",
            data_schema=DATA_SCHEMA,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Create the options flow."""
        return EntityManagerOptionsFlowHandler(config_entry)


class EntityManagerOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow for Entity Manager."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        options_schema = vol.Schema({
            vol.Optional(
                CONF_DEFAULT_RECORDER_DAYS,
                default=self.config_entry.options.get(
                    CONF_DEFAULT_RECORDER_DAYS, DEFAULT_RECORDER_DAYS
                ),
            ): vol.All(int, vol.Range(min=0, max=365)),
        })

        return self.async_show_form(
            step_id="init",
            data_schema=options_schema,
        )
