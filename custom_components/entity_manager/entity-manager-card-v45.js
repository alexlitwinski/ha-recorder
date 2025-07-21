/**
 * Entity Manager Card v44.0 - DOMAIN MANAGEMENT + RECORDER.YAML - FIXED
 * Versão com gestão de domínios, arquivo recorder.yaml separado e relatórios funcionais
 * Data: 2025-07-21 - VERSÃO CORRIGIDA
 */

class EntityManagerCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isLoading = true;
        this.entities = [];
        this.domains = [];
        this.filteredEntities = [];
        this.selectedEntities = new Set();
        this.selectedDomains = new Set();
        this.reportEntityIds = [];
        this.isProcessing = false;
        this.debugMode = true;
        this.currentView = 'entities'; // 'entities' or 'domains'
    }

    debug(message, data = null) {
        if (this.debugMode) {
            console.log(`[EntityManager Debug] ${message}`, data || '');
        }
    }

    setConfig(config) {
        this._config = config;
    }

    set hass(hass) {
        if (!this._hass) {
            this._hass = hass;
            this.loadData();
        }
        this._hass = hass;
    }

    connectedCallback() {
        if (this._hass && !this.entities.length) {
            this.loadData();
        }
        
        // Check if Entity Manager is available
        this.checkEntityManagerAvailability();
    }
    
    async checkEntityManagerAvailability() {
        try {
            const response = await this._hass.callApi('GET', 'entity_manager/status');
            this.debug("Entity Manager status check successful", response);
        } catch (error) {
            console.error('Entity Manager not available:', error);
            this.renderError(`
                <h3>Entity Manager não disponível</h3>
                <p>A integração Entity Manager não está instalada ou não está funcionando.</p>
                <p><strong>Passos para resolver:</strong></p>
                <ol>
                    <li>Verifique se o Entity Manager está instalado em <code>/config/custom_components/entity_manager/</code></li>
                    <li>Vá em <strong>Configurações > Integrações</strong></li>
                    <li>Procure por <strong>Entity Manager</strong> e configure se necessário</li>
                    <li>Reinicie o Home Assistant se necessário</li>
                </ol>
                <p>Erro técnico: ${error.message}</p>
            `);
        }
    }

    async loadData() {
        if (!this._hass) return;
        this.isLoading = true;
        this.render();
        
        try {
            // Load entities and domains in parallel
            const [entitiesResult, domainsResult] = await Promise.all([
                this.loadEntities(),
                this.loadDomains()
            ]);
            
            this.isLoading = false;
            this.filterEntities();
        } catch (error) {
            console.error('Entity Manager: Error loading data:', error);
            this.isLoading = false;
            this.renderError(`Erro ao carregar dados: ${error.message}`);
        }
    }

    async loadEntities() {
        try {
            this.debug("Attempting to load entities from API");
            const entities = await this._hass.callApi('GET', 'entity_manager/entities');
            this.debug("Entities loaded successfully", { count: entities.length });
            this.entities = entities;
            return entities;
        } catch (error) {
            console.error('Error loading entities:', error);
            this.debug("Failed to load entities", error);
            
            // Try alternative endpoint or show helpful error
            if (error.message.includes('404')) {
                console.warn('Entity Manager API not available. Is the integration installed and running?');
                this.renderError('Entity Manager não está instalado ou não está funcionando. Verifique se a integração está ativa em Configurações > Integrações.');
                return [];
            }
            throw error;
        }
    }

    async loadDomains() {
        try {
            this.debug("Attempting to load domains from API");
            const domains = await this._hass.callApi('GET', 'entity_manager/domains');
            this.debug("Domains loaded successfully", { count: domains.length });
            this.domains = domains;
            return domains;
        } catch (error) {
            console.error('Error loading domains:', error);
            this.debug("Failed to load domains", error);
            
            // Try alternative endpoint or show helpful error
            if (error.message.includes('404')) {
                console.warn('Entity Manager API not available. Is the integration installed and running?');
                return [];
            }
            throw error;
        }
    }

    filterEntities(options = {}) {
        const currentFilters = this.getCurrentFilterValues();
        
        if (options.useReportFilter) {
            const reportEntityIdsSet = new Set(this.reportEntityIds);
            this.filteredEntities = this.entities.filter(entity => reportEntityIdsSet.has(entity.entity_id));
        } else {
            const searchText = currentFilters.search.toLowerCase();
            const stateFilter = currentFilters.state;
            const integrationFilter = currentFilters.integration;
            const domainFilter = currentFilters.domain;
            const enabledFilter = currentFilters.enabled;
            const recorderFilter = currentFilters.recorder;

            this.filteredEntities = this.entities.filter(entity => {
                let matchesState = true;
                if (stateFilter) {
                    switch (stateFilter) {
                        case 'normal': matchesState = entity.state !== 'unavailable' && entity.state !== 'unknown' && entity.state !== 'disabled' && entity.state !== null && entity.state !== ''; break;
                        case 'unavailable': matchesState = entity.state === 'unavailable'; break;
                        case 'unknown': matchesState = entity.state === 'unknown'; break;
                        case 'disabled': matchesState = entity.state === 'disabled'; break;
                        case 'not_provided': matchesState = entity.state === null || entity.state === ''; break;
                    }
                }
                if (!matchesState) return false;
                if (enabledFilter && (enabledFilter === 'enabled' ? !entity.enabled : entity.enabled)) return false;
                if (recorderFilter && (recorderFilter === 'excluded' ? !entity.recorder_exclude : entity.recorder_exclude)) return false;
                if (integrationFilter && entity.integration_domain !== integrationFilter) return false;
                if (domainFilter && entity.domain !== domainFilter) return false;
                if (searchText && !entity.entity_id.includes(searchText) && !(entity.name || '').toLowerCase().includes(searchText)) return false;
                return true;
            });
        }
        
        this.clearInvisibleSelections();
        this.render(currentFilters);
    }

    render(preservedFilters = null) {
        const title = this._config?.title || "Gerenciador de Entidades";
        const version = "v44.0-DOMAIN-MANAGEMENT-RECORDER-YAML-FIXED";
        const enabledCount = this.entities.filter(e => e.enabled).length;
        const excludedCount = this.entities.filter(e => e.recorder_exclude).length;
        const integrations = [...new Set(this.entities.map(e => e.integration_domain).filter(Boolean))].sort();
        const domains = [...new Set(this.entities.map(e => e.domain).filter(Boolean))].sort();

        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; font-family: var(--paper-font-body1_-_font-family); position: relative; }
                ha-card { display: flex; flex-direction: column; height: 100%; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow); }
                .card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--primary-color); color: var(--text-primary-color); border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0; }
                .card-header h3 { margin: 0; font-size: 1.2em; font-weight: 500; }
                .header-actions { display: flex; align-items: center; gap: 8px; }
                
                /* VIEW TOGGLE */
                .view-toggle { display: flex; gap: 8px; padding: 16px; background: var(--secondary-background-color); border-bottom: 1px solid var(--divider-color); }
                .view-btn { background-color: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
                .view-btn.active { background-color: var(--primary-color); color: var(--text-primary-color); border-color: var(--primary-color); }
                .view-btn:hover:not(.active) { background-color: var(--divider-color); }
                
                .stats-bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; background: var(--divider-color); font-size: 12px; text-align: center; border-bottom: 1px solid var(--divider-color); }
                .stat-item { background: var(--card-background-color); padding: 12px 8px; color: var(--primary-text-color); }
                .stat-value { display: block; font-size: 18px; font-weight: bold; color: var(--primary-color); }
                .stat-label { display: block; font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }
                .special-actions { display: flex; gap: 8px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-bottom: 1px solid var(--divider-color); align-items: center; justify-content: center; flex-wrap: wrap; }
                .special-btn { background: rgba(255,255,255,0.9); color: #333; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.3s ease; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .special-btn:hover { background: white; transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
                .special-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                .special-btn.config { background: rgba(255,193,7,0.9); }
                .special-btn.purge { background: rgba(220,53,69,0.9); color: white; }
                
                /* DOMAIN VIEW STYLES */
                .domain-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; align-items: center; background: var(--secondary-background-color); border-bottom: 1px solid var(--divider-color); }
                .domain-container { flex: 1; overflow-y: auto; max-height: 60vh; background: var(--card-background-color); }
                .domain-row { display: grid; grid-template-columns: auto 1fr auto auto auto auto auto auto; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--divider-color); }
                .domain-row.fully-excluded { background: rgba(255, 152, 0, 0.1); }
                .domain-row.partially-excluded { background: rgba(255, 235, 59, 0.1); }
                .domain-info .domain-name { font-weight: 600; font-size: 16px; }
                .domain-info .domain-stats { font-size: 0.85em; color: var(--secondary-text-color); }
                .domain-info .domain-config { font-size: 0.8em; color: var(--accent-color); font-style: italic; }
                .domain-status { font-size: 0.9em; text-align: center; padding: 4px 8px; border-radius: 12px; min-width: 80px; font-weight: 500; }
                .domain-status.fully-excluded { background: #ff9800; color: white; }
                .domain-status.partially-excluded { background: #ffeb3b; color: #333; }
                .domain-status.included { background: #4caf50; color: white; }
                .domain-status.empty { background: #9e9e9e; color: white; }
                .exclusion-bar { width: 100px; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
                .exclusion-fill { height: 100%; background: linear-gradient(90deg, #4caf50, #ff9800); transition: width 0.3s ease; }
                
                .filters { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr; gap: 12px; padding: 16px; background: var(--secondary-background-color); border-bottom: 1px solid var(--divider-color); }
                input, select { width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); box-sizing: border-box; font-size: 14px; }
                .bulk-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; align-items: center; background: var(--secondary-background-color); border-bottom: 1px solid var(--divider-color); }
                .entities-container { flex: 1; overflow-y: auto; max-height: 60vh; background: var(--card-background-color); }
                .entity-row { display: grid; grid-template-columns: auto 1fr auto auto auto auto auto auto; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--divider-color); }
                .entity-row.disabled { opacity: 0.6; }
                .entity-row.excluded { background: rgba(255, 152, 0, 0.1); }
                .entity-info .name { font-weight: 500; }
                .entity-info .id { font-size: 0.85em; color: var(--secondary-text-color); }
                .entity-state { font-size: 0.9em; text-align: center; padding: 4px 8px; border-radius: 12px; background: var(--state-icon-color, var(--primary-color)); color: var(--text-primary-color); min-width: 60px; font-weight: 500; }
                .entity-state.unavailable { background: var(--warning-color, #ff9800); }
                .entity-state.unknown { background: var(--error-color, #f44336); }
                .entity-state.disabled { background: #9e9e9e; color: white; }
                .toggle-switch { position: relative; display: inline-block; width: 50px; height: 24px; }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 24px; }
                .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                input:checked + .slider { background-color: var(--primary-color); }
                input:checked + .slider:before { transform: translateX(26px); }
                .recorder-exclude-switch { position: relative; display: inline-block; width: 50px; height: 24px; }
                .recorder-exclude-switch input { opacity: 0; width: 0; height: 0; }
                .recorder-exclude-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4caf50; transition: .4s; border-radius: 24px; }
                .recorder-exclude-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                input:checked + .recorder-exclude-slider { background-color: #ff9800; }
                input:checked + .recorder-exclude-slider:before { transform: translateX(26px); }
                .message { text-align: center; padding: 40px 24px; color: var(--secondary-text-color); font-size: 16px; }
                button { background-color: var(--primary-color); color: var(--text-primary-color); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
                button:hover { opacity: 0.9; }
                button:disabled { opacity: 0.6; cursor: not-allowed; }
                button.danger { background-color: var(--error-color, #f44336); }
                button.recorder-exclude { background-color: #ff9800; }
                .icon-button { background-color: transparent; color: var(--primary-text-color); border: none; cursor: pointer; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
                .bulk-actions-disabled { pointer-events: none; opacity: 0.6; }
                
                /* PROGRESS MODAL STYLES */
                .progress-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background-color: rgba(0, 0, 0, 0.7);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                    font-family: var(--paper-font-body1_-_font-family);
                }
                
                .progress-modal.show {
                    display: flex !important;
                }
                
                .progress-modal-content {
                    background-color: var(--card-background-color, #fff);
                    border-radius: 12px;
                    padding: 24px;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    color: var(--primary-text-color, #333);
                }
                
                .progress-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--divider-color, #eee);
                    padding-bottom: 16px;
                }
                
                .progress-modal-title {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
                    color: var(--primary-color, #333);
                }
                
                .progress-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: var(--secondary-text-color, #666);
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                
                .progress-close:hover {
                    background-color: var(--divider-color, #eee);
                }
                
                .progress-bar-container {
                    margin: 20px 0;
                }
                
                .progress-bar-track {
                    width: 100%;
                    height: 24px;
                    background-color: var(--divider-color, #eee);
                    border-radius: 12px;
                    overflow: hidden;
                    position: relative;
                }
                
                .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #4caf50, #8bc34a);
                    width: 0%;
                    transition: width 0.3s ease;
                    border-radius: 12px;
                    position: relative;
                }
                
                .progress-bar-fill::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(45deg, transparent 35%, rgba(255,255,255,0.2) 50%, transparent 65%);
                    animation: shimmer 2s infinite;
                }
                
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                
                .progress-text {
                    text-align: center;
                    margin: 16px 0;
                    font-weight: 600;
                    font-size: 16px;
                    color: var(--primary-text-color, #333);
                }
                
                .progress-details {
                    font-size: 14px;
                    color: var(--secondary-text-color, #666);
                    text-align: center;
                    margin-top: 12px;
                    min-height: 20px;
                }
                
                .progress-status {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: var(--secondary-text-color, #666);
                    margin-top: 8px;
                }

                /* RESULT MODAL STYLES */
                .result-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background-color: rgba(0, 0, 0, 0.7);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                    font-family: var(--paper-font-body1_-_font-family);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                
                .result-modal.show {
                    display: flex !important;
                    opacity: 1;
                }
                
                .result-modal-content {
                    background-color: var(--card-background-color, #fff);
                    border-radius: 12px;
                    padding: 24px;
                    max-width: 600px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    color: var(--primary-text-color, #333);
                    transform: scale(0.9);
                    transition: transform 0.3s ease;
                }
                
                .result-modal.show .result-modal-content {
                    transform: scale(1);
                }
                
                .result-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--divider-color, #eee);
                    padding-bottom: 16px;
                }
                
                .result-modal-title {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
                    color: var(--primary-color, #333);
                }
                
                .result-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: var(--secondary-text-color, #666);
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: background-color 0.2s;
                }
                
                .result-close:hover {
                    background-color: var(--divider-color, #eee);
                }
                
                .result-modal-body {
                    line-height: 1.5;
                }
                
                .result-modal-body p {
                    margin: 12px 0;
                }
                
                .result-modal-body button {
                    margin: 8px 8px 8px 0;
                }

                /* DEBUG INFO */
                .debug-info {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: rgba(0,0,0,0.8);
                    color: white;
                    padding: 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    z-index: 10000;
                    max-width: 200px;
                }
            </style>
            
            <ha-card>
                <div class="card-header">
                    <h3>${title}</h3>
                    <div class="header-actions">
                        <span style="font-size: 12px; opacity: 0.8;">${version}</span>
                        <button class="icon-button" id="testProgressBtn" title="Testar Progresso">🧪</button>
                        <button class="icon-button" id="refreshBtn" title="Recarregar" ${this.isProcessing ? 'disabled' : ''}>🔄</button>
                    </div>
                </div>
                
                <!-- VIEW TOGGLE -->
                <div class="view-toggle">
                    <button class="view-btn ${this.currentView === 'entities' ? 'active' : ''}" id="entitiesViewBtn">🏠 Entidades</button>
                    <button class="view-btn ${this.currentView === 'domains' ? 'active' : ''}" id="domainsViewBtn">📁 Domínios</button>
                </div>
                
                ${this.renderContent(enabledCount, excludedCount, integrations, domains)}
            </ha-card>
            
            <!-- MODAL DE PROGRESSO -->
            <div class="progress-modal" id="progressModal">
                <div class="progress-modal-content">
                    <div class="progress-modal-header">
                        <h3 class="progress-modal-title" id="progressTitle">Processando...</h3>
                        <button class="progress-close" id="progressClose">&times;</button>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-track">
                            <div class="progress-bar-fill" id="progressFill"></div>
                        </div>
                        <div class="progress-status">
                            <span id="progressPercent">0%</span>
                            <span id="progressEta">Calculando...</span>
                        </div>
                    </div>
                    <div class="progress-text" id="progressText">Preparando...</div>
                    <div class="progress-details" id="progressDetails">Iniciando operação...</div>
                </div>
            </div>
            
            ${this.debugMode ? `<div class="debug-info" id="debugInfo">Debug: ${this.isProcessing ? 'Processando' : 'Pronto'}<br>View: ${this.currentView}</div>` : ''}
        `;

        this.attachEventListeners();
        if (preservedFilters) {
            this.restoreFilterValues(preservedFilters);
        }
        this.updateSelectAllCheckbox();
    }

    renderContent(enabledCount, excludedCount, integrations, domains) {
        if (this.isLoading) return `<div class="message">Carregando dados...</div>`;
        
        const statsBar = `
            <div class="stats-bar">
                <div class="stat-item"><span class="stat-value">${this.entities.length}</span><span class="stat-label">TOTAL</span></div>
                <div class="stat-item"><span class="stat-value">${enabledCount}</span><span class="stat-label">HABILITADAS</span></div>
                <div class="stat-item"><span class="stat-value">${this.entities.length - enabledCount}</span><span class="stat-label">DESABILITADAS</span></div>
                <div class="stat-item"><span class="stat-value">${excludedCount}</span><span class="stat-label">EXCLUÍDAS REC.</span></div>
                <div class="stat-item"><span class="stat-value">${this.currentView === 'entities' ? this.filteredEntities.length : this.domains.length}</span><span class="stat-label">EXIBIDAS</span></div>
            </div>
        `;
        
        const specialActions = `
            <div class="special-actions">
                <button id="intelligentPurgeBtn" class="special-btn" ${this.isProcessing ? 'disabled' : ''}>🧹 Limpeza Inteligente</button>
                <button id="generateReportBtn" class="special-btn" ${this.isProcessing ? 'disabled' : ''}>📊 Gerar Relatório</button>
                <button id="updateRecorderConfigBtn" class="special-btn config" ${this.isProcessing ? 'disabled' : ''}>⚙️ Atualizar recorder.yaml</button>
                <button id="purgeAllEntitiesBtn" class="special-btn purge" ${this.isProcessing ? 'disabled' : ''}>🗑️ Purge Entities</button>
            </div>
        `;

        if (this.currentView === 'domains') {
            return statsBar + specialActions + this.renderDomainsView();
        } else {
            return statsBar + specialActions + this.renderEntitiesView(integrations, domains);
        }
    }

    renderDomainsView() {
        return `
            <div class="domain-actions ${this.isProcessing ? 'bulk-actions-disabled' : ''}">
                <label><input type="checkbox" id="selectAllDomainsCheckbox" ${this.isProcessing ? 'disabled' : ''}> Selecionar Todos</label>
                <input id="bulkDomainRecorderDays" type="number" min="1" max="730" placeholder="Dias de retenção" style="width: 140px;" ${this.isProcessing ? 'disabled' : ''}>
                <button id="setDomainRecorderDaysBtn" ${this.isProcessing ? 'disabled' : ''}>Definir Dias</button>
                <button id="excludeSelectedDomainsBtn" class="recorder-exclude" ${this.isProcessing ? 'disabled' : ''}>Excluir do Recorder</button>
                <button id="includeSelectedDomainsBtn" ${this.isProcessing ? 'disabled' : ''}>Incluir no Recorder</button>
                <span class="selected-count">${this.selectedDomains.size} domínio(s) selecionado(s)</span>
            </div>
            <div class="domain-container">
                ${this.domains.length === 0 ? `<div class="message">Nenhum domínio encontrado.</div>` : this.domains.map(domain => this.renderDomainRow(domain)).join('')}
            </div>
        `;
    }

    renderEntitiesView(integrations, domains) {
        return `
            <div class="filters">
                <input id="searchFilter" placeholder="Buscar entidades..." class="filter-input" ${this.isProcessing ? 'disabled' : ''}>
                <select id="stateFilter" class="filter-input" ${this.isProcessing ? 'disabled' : ''}><option value="">Estado (Todos)</option><option value="normal">Normal</option><option value="unavailable">Indisponível</option><option value="unknown">Desconhecido</option><option value="disabled">Desabilitado</option><option value="not_provided">Não Fornecido</option></select>
                <select id="integrationFilter" class="filter-input" ${this.isProcessing ? 'disabled' : ''}><option value="">Integração (Todas)</option>${integrations.map(i => `<option value="${i}">${i}</option>`).join('')}</select>
                <select id="domainFilter" class="filter-input" ${this.isProcessing ? 'disabled' : ''}><option value="">Domínio (Todos)</option>${domains.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
                <select id="enabledFilter" class="filter-input" ${this.isProcessing ? 'disabled' : ''}><option value="">Status (Todos)</option><option value="enabled">Habilitados</option><option value="disabled">Desabilitados</option></select>
                <select id="recorderFilter" class="filter-input" ${this.isProcessing ? 'disabled' : ''}><option value="">Recorder (Todos)</option><option value="excluded">Excluídos</option><option value="included">Incluídos</option></select>
            </div>
            <div class="bulk-actions ${this.isProcessing ? 'bulk-actions-disabled' : ''}">
                <label><input type="checkbox" id="selectAllCheckbox" ${this.isProcessing ? 'disabled' : ''}> Selecionar Todos</label>
                <button id="enableSelectedBtn" ${this.isProcessing ? 'disabled' : ''}>Habilitar</button>
                <button id="disableSelectedBtn" ${this.isProcessing ? 'disabled' : ''}>Desabilitar</button>
                <input id="bulkRecorderDays" type="number" min="0" placeholder="Dias" style="width: 80px;" ${this.isProcessing ? 'disabled' : ''}>
                <button id="setRecorderBtn" ${this.isProcessing ? 'disabled' : ''}>Definir Dias</button>
                <button id="excludeRecorderBtn" class="recorder-exclude" ${this.isProcessing ? 'disabled' : ''}>Excluir Recorder</button>
                <button id="includeRecorderBtn" ${this.isProcessing ? 'disabled' : ''}>Incluir Recorder</button>
                <button id="deleteSelectedBtn" class="danger" ${this.isProcessing ? 'disabled' : ''}>Excluir</button>
                <span class="selected-count">${this.selectedEntities.size} selecionada(s)</span>
            </div>
            <div class="entities-container">
                ${this.filteredEntities.length === 0 ? `<div class="message">Nenhuma entidade encontrada.</div>` : this.filteredEntities.map(entity => this.renderEntityRow(entity)).join('')}
            </div>
        `;
    }

    renderDomainRow(domain) {
        const isSelected = this.selectedDomains.has(domain.domain);
        const statusClass = domain.status;
        const rowClass = statusClass === 'fully_excluded' ? 'fully-excluded' : 
                         statusClass === 'partially_excluded' ? 'partially-excluded' : '';
        
        return `
            <div class="domain-row ${rowClass}" data-domain="${domain.domain}">
                <input type="checkbox" data-select-domain ${isSelected ? 'checked' : ''} ${this.isProcessing ? 'disabled' : ''}>
                <div class="domain-info">
                    <div class="domain-name">${domain.domain}</div>
                    <div class="domain-stats">${domain.total_entities} entidades • ${domain.excluded_entities} excluídas • ${domain.enabled_entities} habilitadas</div>
                    <div class="domain-config">${domain.has_domain_config ? 'Configurado' : 'Usando padrão'} • ${domain.recorder_days || 10} dias de retenção</div>
                </div>
                <div class="domain-status ${statusClass.replace('_', '-')}">${this.getDomainStatusText(domain.status)}</div>
                <div class="exclusion-bar">
                    <div class="exclusion-fill" style="width: ${domain.exclusion_percentage}%"></div>
                </div>
                <div style="text-align: center; font-weight: 600;">${domain.exclusion_percentage}%</div>
                <input type="number" data-domain-recorder value="${domain.recorder_days || 10}" min="1" max="730" title="Dias de Retenção do Domínio" ${this.isProcessing ? 'disabled' : ''}>
                <button class="icon-button" data-exclude-domain title="Excluir Domínio" ${this.isProcessing ? 'disabled' : ''}>🚫</button>
                <button class="icon-button" data-include-domain title="Incluir Domínio" ${this.isProcessing ? 'disabled' : ''}>✅</button>
            </div>
        `;
    }

    getDomainStatusText(status) {
        switch(status) {
            case 'fully_excluded': return 'Totalmente Excluído';
            case 'partially_excluded': return 'Parcialmente Excluído';
            case 'included': return 'Incluído';
            case 'empty': return 'Vazio';
            default: return 'Desconhecido';
        }
    }

    renderEntityRow(entity) {
        const isSelected = this.selectedEntities.has(entity.entity_id);
        const isEnabled = entity.enabled;
        const isRecorderExcluded = entity.recorder_exclude;
        const stateClass = entity.state === 'unavailable' ? 'unavailable' : entity.state === 'unknown' ? 'unknown' : entity.state === 'disabled' ? 'disabled' : '';
        const rowClass = `${isEnabled ? '' : 'disabled'} ${isRecorderExcluded ? 'excluded' : ''}`;
        
        return `
            <div class="entity-row ${rowClass}" data-entity-id="${entity.entity_id}">
                <input type="checkbox" data-select ${isSelected ? 'checked' : ''} ${this.isProcessing ? 'disabled' : ''}>
                <div class="entity-info">
                    <div class="name" title="${entity.name || entity.entity_id}">${entity.name || entity.entity_id}</div>
                    <div class="id" title="${entity.entity_id}">${entity.entity_id}</div>
                </div>
                <div class="entity-state ${stateClass}" title="Estado: ${entity.state}">${entity.state}</div>
                <label class="toggle-switch" title="${isEnabled ? 'Habilitado' : 'Desabilitado'}">
                    <input type="checkbox" data-enable-toggle ${isEnabled ? 'checked' : ''} ${this.isProcessing ? 'disabled' : ''}>
                    <span class="slider"></span>
                </label>
                <input type="number" data-recorder value="${entity.recorder_days || 10}" min="0" max="365" title="Dias no Recorder" ${this.isProcessing ? 'disabled' : ''}>
                <label class="recorder-exclude-switch" title="${isRecorderExcluded ? 'Excluído do Recorder' : 'Incluído no Recorder'}">
                    <input type="checkbox" data-recorder-exclude-toggle ${isRecorderExcluded ? 'checked' : ''} ${this.isProcessing ? 'disabled' : ''}>
                    <span class="recorder-exclude-slider"></span>
                </label>
                <button class="icon-button" data-purge title="Limpar Histórico" ${this.isProcessing ? 'disabled' : ''}>🗑️</button>
                <button class="icon-button danger" data-delete title="Excluir Entidade" ${this.isProcessing ? 'disabled' : ''}>❌</button>
            </div>
        `;
    }

    attachEventListeners() {
        const root = this.shadowRoot;
        
        // View toggle
        root.getElementById('entitiesViewBtn')?.addEventListener('click', () => this.switchView('entities'));
        root.getElementById('domainsViewBtn')?.addEventListener('click', () => this.switchView('domains'));
        
        // Basic event listeners
        root.getElementById('refreshBtn')?.addEventListener('click', () => this.loadData());
        root.getElementById('generateReportBtn')?.addEventListener('click', () => this.handleGenerateReport());
        root.getElementById('intelligentPurgeBtn')?.addEventListener('click', () => alert("Função de limpeza inteligente ainda não implementada."));
        root.getElementById('updateRecorderConfigBtn')?.addEventListener('click', () => this.handleUpdateRecorderConfig());
        root.getElementById('purgeAllEntitiesBtn')?.addEventListener('click', () => this.handlePurgeAllEntities());
        
        // Modal event listeners
        root.getElementById('progressClose')?.addEventListener('click', () => this.hideProgressModal());
        root.getElementById('testProgressBtn')?.addEventListener('click', () => this.testProgressModal());
        
        if (this.currentView === 'entities') {
            this.attachEntityEventListeners();
        } else {
            this.attachDomainEventListeners();
        }
    }

    attachEntityEventListeners() {
        const root = this.shadowRoot;
        
        // Filters
        root.querySelectorAll('.filter-input').forEach(el => el.addEventListener('change', () => this.filterEntities()));
        root.getElementById('searchFilter')?.addEventListener('keypress', (e) => e.key === 'Enter' && this.filterEntities());

        // Bulk actions
        root.getElementById('selectAllCheckbox')?.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        root.getElementById('enableSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('enable'));
        root.getElementById('disableSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('disable'));
        root.getElementById('setRecorderBtn')?.addEventListener('click', () => this.handleBulkAction('set-recorder'));
        root.getElementById('excludeRecorderBtn')?.addEventListener('click', () => this.handleBulkAction('exclude-recorder'));
        root.getElementById('includeRecorderBtn')?.addEventListener('click', () => this.handleBulkAction('include-recorder'));
        root.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('delete'));

        // Entity rows
        root.querySelectorAll('.entity-row').forEach(row => {
            const entityId = row.dataset.entityId;
            row.querySelector('[data-select]')?.addEventListener('change', (e) => this.toggleSelection(entityId, e.target.checked));
            row.querySelector('[data-enable-toggle]')?.addEventListener('change', (e) => this.toggleEntityEnabled(entityId, e.target.checked));
            row.querySelector('[data-recorder]')?.addEventListener('change', (e) => this.updateRecorderDays(entityId, e.target.value));
            row.querySelector('[data-recorder-exclude-toggle]')?.addEventListener('change', (e) => this.toggleRecorderExclude(entityId, e.target.checked));
            row.querySelector('[data-purge]')?.addEventListener('click', () => this.handlePurgeEntity(entityId));
            row.querySelector('[data-delete]')?.addEventListener('click', () => this.handleDeleteEntity(entityId));
        });
    }

    attachDomainEventListeners() {
        const root = this.shadowRoot;
        
        // Domain bulk actions
        root.getElementById('selectAllDomainsCheckbox')?.addEventListener('change', (e) => this.toggleSelectAllDomains(e.target.checked));
        root.getElementById('excludeSelectedDomainsBtn')?.addEventListener('click', () => this.handleBulkDomainAction('exclude'));
        root.getElementById('includeSelectedDomainsBtn')?.addEventListener('click', () => this.handleBulkDomainAction('include'));
        root.getElementById('setDomainRecorderDaysBtn')?.addEventListener('click', () => this.handleBulkDomainAction('set-recorder-days'));
        
        // Domain rows
        root.querySelectorAll('.domain-row').forEach(row => {
            const domain = row.dataset.domain;
            row.querySelector('[data-select-domain]')?.addEventListener('change', (e) => this.toggleDomainSelection(domain, e.target.checked));
            row.querySelector('[data-domain-recorder]')?.addEventListener('change', (e) => this.updateDomainRecorderDays(domain, e.target.value));
            row.querySelector('[data-exclude-domain]')?.addEventListener('click', () => this.handleDomainAction(domain, 'exclude'));
            row.querySelector('[data-include-domain]')?.addEventListener('click', () => this.handleDomainAction(domain, 'include'));
        });
    }

    switchView(view) {
        if (view === this.currentView) return;
        
        this.currentView = view;
        this.selectedEntities.clear();
        this.selectedDomains.clear();
        this.render(this.getCurrentFilterValues());
    }

    // DOMAIN-RELATED METHODS

    toggleDomainSelection(domain, isSelected) {
        if (isSelected) {
            this.selectedDomains.add(domain);
        } else {
            this.selectedDomains.delete(domain);
        }
        this.render(this.getCurrentFilterValues());
    }

    toggleSelectAllDomains(selectAll) {
        this.domains.forEach(domain => {
            if (selectAll) {
                this.selectedDomains.add(domain.domain);
            } else {
                this.selectedDomains.delete(domain.domain);
            }
        });
        this.render(this.getCurrentFilterValues());
    }

    async updateDomainRecorderDays(domain, days) {
        const numDays = parseInt(days, 10);
        if (isNaN(numDays) || numDays < 1) return;
        
        try {
            await this._hass.callApi('POST', 'entity_manager/update_domain_recorder_days', { 
                domain: domain, 
                recorder_days: numDays 
            });
            
            // Update local domain data if available
            const domainData = this.domains.find(d => d.domain === domain);
            if (domainData) {
                domainData.recorder_days = numDays;
                domainData.has_domain_config = true;
            }
        } catch (error) {
            console.error('Erro ao atualizar dias do domínio:', error);
            alert(`Erro ao atualizar dias do domínio: ${error.message}`);
        }
    }

    async handleBulkDomainAction(action) {
        const selectedDomainsArray = Array.from(this.selectedDomains);
        
        if (selectedDomainsArray.length === 0) {
            alert("Nenhum domínio selecionado.");
            return;
        }
        
        let confirmMessage = '';
        let isExclude = false;
        let recorderDays = null;
        
        switch(action) {
            case 'exclude':
                isExclude = true;
                confirmMessage = `Excluir ${selectedDomainsArray.length} domínio(s) do recorder?`;
                break;
            case 'include':
                isExclude = false;
                confirmMessage = `Incluir ${selectedDomainsArray.length} domínio(s) no recorder?`;
                break;
            case 'set-recorder-days':
                const daysInput = this.shadowRoot.getElementById('bulkDomainRecorderDays')?.value;
                recorderDays = parseInt(daysInput, 10);
                if (isNaN(recorderDays) || recorderDays < 1) {
                    alert("Por favor, insira um número válido de dias (1-730).");
                    return;
                }
                confirmMessage = `Definir ${recorderDays} dias de retenção para ${selectedDomainsArray.length} domínio(s)?`;
                break;
        }
        
        if (!confirm(confirmMessage)) return;
        
        let actionTitle = '';
        switch(action) {
            case 'exclude': actionTitle = 'Excluindo Domínios'; break;
            case 'include': actionTitle = 'Incluindo Domínios'; break;
            case 'set-recorder-days': actionTitle = 'Definindo Dias de Retenção'; break;
        }
        
        this.showProgressModal(actionTitle, `Processando ${selectedDomainsArray.length} domínios...`);
        
        try {
            if (action === 'set-recorder-days') {
                await this._hass.callApi('POST', 'entity_manager/bulk_update_domain_recorder_days', {
                    domains: selectedDomainsArray,
                    domain_recorder_days: recorderDays
                });
            } else {
                await this._hass.callApi('POST', 'entity_manager/bulk_exclude_domains', {
                    domains: selectedDomainsArray,
                    recorder_exclude: isExclude
                });
            }
            
            this.updateProgress(100, 'Concluído!', 'Recarregando dados...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.selectedDomains.clear();
            await this.loadData();
            this.hideProgressModal();
        } catch (error) {
            console.error('Erro na ação bulk de domínios:', error);
            this.updateProgress(0, 'Erro!', `Erro: ${error.message}`);
            setTimeout(() => this.hideProgressModal(), 3000);
        }
    }

    async handleDomainAction(domain, action) {
        const isExclude = action === 'exclude';
        const confirmMessage = `${isExclude ? 'Excluir' : 'Incluir'} todas as entidades do domínio "${domain}" ${isExclude ? 'do' : 'no'} recorder?`;
        
        if (!confirm(confirmMessage)) return;
        
        this.showProgressModal(
            isExclude ? 'Excluindo Domínio' : 'Incluindo Domínio',
            `Processando todas as entidades do domínio ${domain}...`
        );
        
        try {
            const endpoint = isExclude ? 'exclude_domain' : 'include_domain';
            await this._hass.callApi('POST', `entity_manager/${endpoint}`, { domain });
            
            this.updateProgress(100, 'Concluído!', 'Recarregando dados...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await this.loadData();
            this.hideProgressModal();
        } catch (error) {
            console.error('Erro na ação do domínio:', error);
            this.updateProgress(0, 'Erro!', `Erro: ${error.message}`);
            setTimeout(() => this.hideProgressModal(), 3000);
        }
    }

    // PROGRESS MODAL METHODS

    async testProgressModal() {
        this.debug("Iniciando teste do modal de progresso");
        
        this.showProgressModal("Teste de Progresso", "Simulando operação em lote...");
        
        for (let i = 0; i <= 100; i += 10) {
            await new Promise(resolve => setTimeout(resolve, 300));
            this.updateProgress(i, `Processando... ${i}%`, `Simulando lote ${Math.floor(i/10) + 1} de 11`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.hideProgressModal();
        
        this.debug("Teste do modal concluído");
    }

    showProgressModal(title, details = '') {
        this.debug("Mostrando modal de progresso", { title, details });
        
        this.isProcessing = true;
        
        const modal = this.shadowRoot.getElementById('progressModal');
        const titleEl = this.shadowRoot.getElementById('progressTitle');
        const textEl = this.shadowRoot.getElementById('progressText');
        const detailsEl = this.shadowRoot.getElementById('progressDetails');
        const fillEl = this.shadowRoot.getElementById('progressFill');
        const percentEl = this.shadowRoot.getElementById('progressPercent');
        
        if (!modal) {
            this.debug("ERRO: Modal não encontrado!");
            return;
        }
        
        if (titleEl) titleEl.textContent = title;
        if (textEl) textEl.textContent = 'Iniciando...';
        if (detailsEl) detailsEl.textContent = details;
        if (fillEl) fillEl.style.width = '0%';
        if (percentEl) percentEl.textContent = '0%';
        
        modal.classList.add('show');
        this.updateDebugInfo();
        
        this.debug("Modal deveria estar visível agora");
    }

    updateProgress(percentage, text, details = '') {
        this.debug("Atualizando progresso", { percentage, text, details });
        
        const fillEl = this.shadowRoot.getElementById('progressFill');
        const textEl = this.shadowRoot.getElementById('progressText');
        const detailsEl = this.shadowRoot.getElementById('progressDetails');
        const percentEl = this.shadowRoot.getElementById('progressPercent');
        
        if (fillEl) fillEl.style.width = `${percentage}%`;
        if (textEl) textEl.textContent = text;
        if (detailsEl) detailsEl.textContent = details;
        if (percentEl) percentEl.textContent = `${Math.round(percentage)}%`;
        
        this.updateDebugInfo();
    }

    hideProgressModal() {
        this.debug("Escondendo modal de progresso");
        
        this.isProcessing = false;
        
        const modal = this.shadowRoot.getElementById('progressModal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        this.updateDebugInfo();
        this.render(this.getCurrentFilterValues());
    }

    updateDebugInfo() {
        if (this.debugMode) {
            const debugEl = this.shadowRoot.getElementById('debugInfo');
            if (debugEl) {
                const modal = this.shadowRoot.getElementById('progressModal');
                const isModalVisible = modal && modal.classList.contains('show');
                debugEl.innerHTML = `
                    Debug: ${this.isProcessing ? 'Processando' : 'Pronto'}<br>
                    Modal: ${isModalVisible ? 'Visível' : 'Oculto'}<br>
                    View: ${this.currentView}<br>
                    Entidades: ${this.selectedEntities.size}<br>
                    Domínios: ${this.selectedDomains.size}
                `;
            }
        }
    }

    // MODAL SYSTEM - FIXED

    showModal(title, content) {
        console.log(`Modal simples: ${title}`);
        // Create a proper modal for results
        this.showResultModal(title, content);
    }

    showResultModal(title, body) { 
        this.debug("Showing result modal", { title, body });
        
        // Create modal HTML
        const modalHtml = `
            <div class="result-modal" id="resultModal">
                <div class="result-modal-content">
                    <div class="result-modal-header">
                        <h3 class="result-modal-title">${title}</h3>
                        <button class="result-close" id="resultClose">&times;</button>
                    </div>
                    <div class="result-modal-body">
                        ${body}
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = this.shadowRoot.getElementById('resultModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to DOM
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = modalHtml;
        this.shadowRoot.appendChild(tempDiv.firstElementChild);
        
        // Show modal
        const modal = this.shadowRoot.getElementById('resultModal');
        if (modal) {
            modal.classList.add('show');
            
            // Add close event listener
            const closeBtn = this.shadowRoot.getElementById('resultClose');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hideModal());
            }
            
            // Close on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal();
                }
            });
            
            this.debug("Result modal should be visible now");
        }
    }
    
    hideModal() { 
        console.log("Escondendo modal simples");
        const modal = this.shadowRoot.getElementById('resultModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    // REPORT GENERATION - FIXED

    async handleGenerateReport() {
        this.debug("Iniciando geração de relatório");
        
        this.showProgressModal('Gerando Relatório', 'Analisando banco de dados...');
        
        try {
            this.debug("Chamando API do relatório");
            
            const response = await this._hass.callApi('POST', 'entity_manager/recorder_report', { 
                limit: 100 
            });
            
            this.debug("Resposta da API recebida", response);
            
            if (response.status === 'error') {
                throw new Error(response.error || response.message || 'Erro desconhecido na API');
            }
            
            this.reportEntityIds = response.report_data ? response.report_data.map(e => e.entity_id) : [];

            this.updateProgress(100, 'Concluído!', '');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.hideProgressModal();

            if (!response.entities_analyzed && !response.total_records) {
                throw new Error('Relatório gerado mas sem dados retornados');
            }

            const modalBody = `
                <p><strong>📊 Relatório das Top ${response.entities_analyzed || 100} entidades gerado com sucesso.</strong></p>
                <p><strong>Total de Registros:</strong> ${(response.total_records || 0).toLocaleString()}</p>
                <p><strong>Entidades Analisadas:</strong> ${response.entities_analyzed || 0}</p>
                ${response.download_url ? `
                    <p><strong>Download:</strong> <a href="${response.download_url}" target="_blank">📥 Baixar Relatório JSON</a></p>
                ` : ''}
                <div style="margin: 16px 0;">
                    <button id="downloadReportBtn" class="special-btn" ${response.download_url ? '' : 'disabled'}>📥 Download Relatório</button>
                    <button id="filterReportEntitiesBtn" class="special-btn" ${this.reportEntityIds.length > 0 ? '' : 'disabled'}>🔍 Mostrar na Lista</button>
                    <button id="viewReportDataBtn" class="special-btn">📋 Ver Dados do Relatório</button>
                </div>
                ${response.report_data && response.report_data.length > 0 ? `
                    <details style="margin-top: 16px;">
                        <summary style="cursor: pointer; font-weight: bold;">📈 Top 10 Entidades com Mais Registros</summary>
                        <div style="margin-top: 8px; max-height: 300px; overflow-y: auto;">
                            ${response.report_data.slice(0, 10).map((item, index) => `
                                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--divider-color);">
                                    <span style="font-family: monospace;">${index + 1}. ${item.entity_id}</span>
                                    <span style="font-weight: bold;">${item.record_count.toLocaleString()} registros</span>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                ` : ''}
            `;
            
            this.showResultModal('📊 Relatório Gerado', modalBody);

            // Adicionar event listeners após mostrar o modal
            setTimeout(() => {
                const downloadBtn = this.shadowRoot.getElementById('downloadReportBtn');
                const filterBtn = this.shadowRoot.getElementById('filterReportEntitiesBtn');
                const viewDataBtn = this.shadowRoot.getElementById('viewReportDataBtn');
                
                if (downloadBtn && response.download_url) {
                    downloadBtn.addEventListener('click', () => window.open(response.download_url, '_blank'));
                }
                
                if (filterBtn && this.reportEntityIds.length > 0) {
                    filterBtn.addEventListener('click', () => {
                        this.hideModal();
                        this.filterByReportEntities();
                    });
                }
                
                if (viewDataBtn) {
                    viewDataBtn.addEventListener('click', () => {
                        this.showReportDataModal(response.report_data || []);
                    });
                }
            }, 100);

        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            this.debug("Erro na geração do relatório", error);
            
            this.hideProgressModal();
            
            let errorMessage = 'Erro desconhecido';
            if (error.message) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            
            const errorBody = `
                <p><strong>❌ Erro ao gerar relatório:</strong></p>
                <p><code>${errorMessage}</code></p>
                <p><strong>Possíveis causas:</strong></p>
                <ul>
                    <li>Recorder não está ativo</li>
                    <li>Banco de dados não acessível</li>
                    <li>Entity Manager não configurado</li>
                    <li>Erro na API do relatório</li>
                </ul>
                <p><strong>Soluções:</strong></p>
                <ol>
                    <li>Verifique se o recorder está funcionando</li>
                    <li>Verifique os logs do Home Assistant</li>
                    <li>Reinicie a integração Entity Manager</li>
                </ol>
                <div style="margin: 16px 0;">
                    <button id="retryReportBtn" class="special-btn">🔄 Tentar Novamente</button>
                    <button id="checkRecorderBtn" class="special-btn">🔍 Verificar Recorder</button>
                </div>
            `;
            
            this.showResultModal('❌ Erro no Relatório', errorBody);
            
            // Adicionar event listeners para botões de erro
            setTimeout(() => {
                const retryBtn = this.shadowRoot.getElementById('retryReportBtn');
                const checkBtn = this.shadowRoot.getElementById('checkRecorderBtn');
                
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        this.hideModal();
                        this.handleGenerateReport();
                    });
                }
                
                if (checkBtn) {
                    checkBtn.addEventListener('click', () => {
                        this.hideModal();
                        this.checkRecorderStatus();
                    });
                }
            }, 100);
        }
    }
    
    showReportDataModal(reportData) {
        if (!reportData || reportData.length === 0) {
            this.showResultModal('📋 Dados do Relatório', '<p>Nenhum dado disponível no relatório.</p>');
            return;
        }
        
        const dataBody = `
            <p><strong>📋 Dados completos do relatório (${reportData.length} entidades):</strong></p>
            <div style="max-height: 400px; overflow-y: auto; margin: 16px 0;">
                <table style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px;">
                    <thead>
                        <tr style="background: var(--divider-color); position: sticky; top: 0;">
                            <th style="padding: 8px; text-align: left; border: 1px solid var(--divider-color);">#</th>
                            <th style="padding: 8px; text-align: left; border: 1px solid var(--divider-color);">Entity ID</th>
                            <th style="padding: 8px; text-align: right; border: 1px solid var(--divider-color);">Registros</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportData.map((item, index) => `
                            <tr style="border-bottom: 1px solid var(--divider-color);">
                                <td style="padding: 6px; border: 1px solid var(--divider-color);">${index + 1}</td>
                                <td style="padding: 6px; border: 1px solid var(--divider-color);">${item.entity_id}</td>
                                <td style="padding: 6px; text-align: right; border: 1px solid var(--divider-color); font-weight: bold;">${item.record_count.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin: 16px 0;">
                <button onclick="this.closest('.result-modal').querySelector('.result-close').click();" class="special-btn">✅ Fechar</button>
            </div>
        `;
        
        this.showResultModal('📋 Dados Completos do Relatório', dataBody);
    }
    
    async checkRecorderStatus() {
        this.showProgressModal('Verificando Recorder', 'Checando status do recorder...');
        
        try {
            // Tentar uma consulta simples para verificar se o recorder está funcionando
            const testResponse = await this._hass.callApi('GET', 'history/period?filter_entity_id=sun.sun&minimal_response&no_attributes');
            
            this.updateProgress(100, 'Concluído!', '');
            await new Promise(resolve => setTimeout(resolve, 500));
            this.hideProgressModal();
            
            if (testResponse && Array.isArray(testResponse)) {
                this.showResultModal('✅ Recorder Status', `
                    <p><strong>✅ Recorder está funcionando!</strong></p>
                    <p>O recorder está ativo e respondendo a consultas.</p>
                    <p><strong>Próximos passos:</strong></p>
                    <ol>
                        <li>Verifique se a integração Entity Manager está funcionando</li>
                        <li>Verifique os logs do Home Assistant para erros específicos</li>
                        <li>Tente gerar o relatório novamente</li>
                    </ol>
                    <div style="margin: 16px 0;">
                        <button id="retryAfterCheckBtn" class="special-btn">🔄 Tentar Relatório Novamente</button>
                    </div>
                `);
                
                setTimeout(() => {
                    const retryBtn = this.shadowRoot.getElementById('retryAfterCheckBtn');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => {
                            this.hideModal();
                            this.handleGenerateReport();
                        });
                    }
                }, 100);
            } else {
                throw new Error('Resposta inválida do recorder');
            }
            
        } catch (error) {
            this.hideProgressModal();
            
            this.showResultModal('❌ Problema no Recorder', `
                <p><strong>❌ Recorder não está respondendo!</strong></p>
                <p><strong>Erro:</strong> <code>${error.message}</code></p>
                <p><strong>Possíveis causas:</strong></p>
                <ul>
                    <li>Recorder não está configurado</li>
                    <li>Banco de dados corrompido ou inacessível</li>
                    <li>Configuração incorreta no recorder.yaml</li>
                </ul>
                <p><strong>Soluções:</strong></p>
                <ol>
                    <li>Verifique se <code>recorder:</code> está no configuration.yaml</li>
                    <li>Verifique se o banco de dados existe</li>
                    <li>Reinicie o Home Assistant</li>
                    <li>Verifique os logs para erros do recorder</li>
                </ol>
            `);
        }
    }
    
    filterByReportEntities() {
        this.hideModal();
        this.switchView('entities');
        this.filterEntities({ useReportFilter: true });
        const root = this.shadowRoot;
        root.getElementById('searchFilter').value = '';
        root.getElementById('stateFilter').value = '';
        root.getElementById('integrationFilter').value = '';
        root.getElementById('domainFilter').value = '';
        root.getElementById('enabledFilter').value = '';
        root.getElementById('recorderFilter').value = '';
    }

    // EXISTING METHODS (updated to avoid iteration issues)

    async handleBulkAction(action) {
        const entity_ids = Array.from(this.selectedEntities);
        
        this.debug("Iniciando operação em lote", { action, entityCount: entity_ids.length });
        
        if (entity_ids.length === 0) {
            alert("Nenhuma entidade selecionada.");
            return;
        }

        let confirmMessage = '';
        switch(action) {
            case 'enable': confirmMessage = `Habilitar ${entity_ids.length} entidades?`; break;
            case 'disable': confirmMessage = `Desabilitar ${entity_ids.length} entidades?`; break;
            case 'exclude-recorder': confirmMessage = `Excluir ${entity_ids.length} entidades do recorder?`; break;
            case 'include-recorder': confirmMessage = `Incluir ${entity_ids.length} entidades no recorder?`; break;
            case 'delete': confirmMessage = `EXCLUIR PERMANENTEMENTE ${entity_ids.length} entidades? Esta ação não pode ser desfeita!`; break;
            case 'set-recorder': 
                const days = this.shadowRoot.getElementById('bulkRecorderDays')?.value;
                const numDays = parseInt(days, 10);
                if (isNaN(numDays) || numDays < 0) {
                    alert("Por favor, insira um número válido de dias.");
                    return;
                }
                confirmMessage = `Definir ${numDays} dias de recorder para ${entity_ids.length} entidades?`;
                break;
        }

        if (!confirm(confirmMessage)) {
            this.debug("Operação cancelada pelo usuário");
            return;
        }

        let actionTitle = '';
        switch(action) {
            case 'enable': actionTitle = 'Habilitando Entidades'; break;
            case 'disable': actionTitle = 'Desabilitando Entidades'; break;
            case 'exclude-recorder': actionTitle = 'Excluindo do Recorder'; break;
            case 'include-recorder': actionTitle = 'Incluindo no Recorder'; break;
            case 'delete': actionTitle = 'Excluindo Entidades'; break;
            case 'set-recorder': actionTitle = 'Definindo Dias no Recorder'; break;
        }

        this.showProgressModal(actionTitle, `Processando ${entity_ids.length} entidades...`);

        try {
            await this.executeBulkActionWithProgress(action, entity_ids);
            this.updateProgress(100, 'Concluído!', 'Recarregando lista de entidades...');
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.selectedEntities.clear();
            await this.loadData();
            this.hideProgressModal();
            
            this.debug("Operação em lote concluída com sucesso");
            
        } catch (error) {
            console.error('Erro na operação em lote:', error);
            this.updateProgress(0, 'Erro!', `Erro: ${error.message}`);
            setTimeout(() => this.hideProgressModal(), 3000);
        }
    }

    async executeBulkActionWithProgress(action, entity_ids) {
        const batchSize = 10;
        const totalBatches = Math.ceil(entity_ids.length / batchSize);
        
        this.debug("Executando operação em lotes", { batchSize, totalBatches });
        
        for (let i = 0; i < totalBatches; i++) {
            const startIdx = i * batchSize;
            const endIdx = Math.min(startIdx + batchSize, entity_ids.length);
            const batchIds = entity_ids.slice(startIdx, endIdx);
            
            const progress = ((i + 1) / totalBatches) * 100;
            this.updateProgress(
                progress, 
                `Processando lote ${i + 1} de ${totalBatches}...`,
                `Entidades ${startIdx + 1}-${endIdx} de ${entity_ids.length}`
            );

            this.debug(`Processando lote ${i + 1}/${totalBatches}`, { batchIds: batchIds.length });

            try {
                await this.processBatch(action, batchIds);
                
                if (i < totalBatches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (error) {
                console.error(`Erro no lote ${i + 1}:`, error);
                this.debug(`Erro no lote ${i + 1}`, error);
            }
        }
    }

    async processBatch(action, batchIds) {
        switch(action) {
            case 'enable':
                await this.callService('bulk_update', { entity_ids: batchIds, enabled: true });
                break;
            case 'disable':
                await this.callService('bulk_update', { entity_ids: batchIds, enabled: false });
                break;
            case 'exclude-recorder':
                await this.callService('bulk_update_recorder_exclude', { entity_ids: batchIds, recorder_exclude: true });
                break;
            case 'include-recorder':
                await this.callService('bulk_update_recorder_exclude', { entity_ids: batchIds, recorder_exclude: false });
                break;
            case 'delete':
                await this.callService('bulk_delete', { entity_ids: batchIds });
                break;
            case 'set-recorder':
                const days = parseInt(this.shadowRoot.getElementById('bulkRecorderDays')?.value, 10);
                await this.callService('bulk_update', { entity_ids: batchIds, recorder_days: days });
                break;
        }
    }

    async handleUpdateRecorderConfig() {
        const excludedCount = this.entities.filter(e => e.recorder_exclude).length;
        if (excludedCount === 0) {
            alert("Nenhuma entidade marcada para exclusão do recorder.");
            return;
        }
        
        if (!confirm(`Atualizar recorder.yaml com ${excludedCount} entidades excluídas do recorder?`)) return;
        
        this.showProgressModal('Atualizando recorder.yaml', 'Modificando configuração do recorder...');
        try {
            const response = await this._hass.callApi('POST', 'entity_manager/update_recorder_config', { backup_config: true });
            if (response.status === 'error') throw new Error(response.message);
            
            this.updateProgress(100, 'Concluído!', '');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.hideProgressModal();
            
            const modalBody = `
                <p>${response.message}</p>
                <p>Entidades excluídas: ${response.excluded_entities.length}</p>
                <p>Domínios excluídos: ${response.excluded_domains.length}</p>
                <p><strong>⚠️ Reinicie o Home Assistant para aplicar as alterações!</strong></p>
                <p><small>Arquivo criado: recorder.yaml</small></p>
            `;
            this.showResultModal('recorder.yaml Atualizado', modalBody);
        } catch (error) {
            this.hideProgressModal();
            this.showResultModal('Erro na Configuração', `Ocorreu um erro: ${error.message}`);
        }
    }

    async handlePurgeAllEntities() {
        const excludedCount = this.entities.filter(e => e.recorder_exclude).length;
        if (excludedCount === 0) {
            alert("Nenhuma entidade marcada para limpeza do recorder.");
            return;
        }
        
        if (!confirm(`Executar recorder.purge_entities para ${excludedCount} entidades excluídas?`)) return;
        
        this.showProgressModal('Executando Purge', 'Limpando dados do recorder...');
        try {
            const response = await this._hass.callApi('POST', 'entity_manager/purge_all_entities', { force_purge: false });
            if (response.status === 'error') throw new Error(response.message);
            
            this.updateProgress(100, 'Concluído!', '');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.hideProgressModal();
            
            const modalBody = `
                <p>${response.message}</p>
                <p>Entidades processadas: ${response.purged_entities.length}</p>
            `;
            this.showResultModal('Purge Executado', modalBody);
        } catch (error) {
            this.hideProgressModal();
            this.showResultModal('Erro no Purge', `Ocorreu um erro: ${error.message}`);
        }
    }

    async toggleRecorderExclude(entityId, exclude) {
        await this.callService('update_recorder_exclude', { entity_id: entityId, recorder_exclude: exclude });
        const entity = this.entities.find(e => e.entity_id === entityId);
        if (entity) entity.recorder_exclude = exclude;
        this.filterEntities();
    }

    getCurrentFilterValues() {
        const root = this.shadowRoot;
        return {
            search: root.getElementById('searchFilter')?.value || '',
            state: root.getElementById('stateFilter')?.value || '',
            integration: root.getElementById('integrationFilter')?.value || '',
            domain: root.getElementById('domainFilter')?.value || '',
            enabled: root.getElementById('enabledFilter')?.value || '',
            recorder: root.getElementById('recorderFilter')?.value || ''
        };
    }
    
    restoreFilterValues(filters) {
        const root = this.shadowRoot;
        if (!filters) return;
        root.getElementById('searchFilter').value = filters.search;
        root.getElementById('stateFilter').value = filters.state;
        root.getElementById('integrationFilter').value = filters.integration;
        root.getElementById('domainFilter').value = filters.domain;
        root.getElementById('enabledFilter').value = filters.enabled;
        root.getElementById('recorderFilter').value = filters.recorder || '';
    }
    
    toggleSelectAll(selectAll) {
        const visibleEntityIds = this.filteredEntities.map(e => e.entity_id);
        visibleEntityIds.forEach(id => {
            if (selectAll) this.selectedEntities.add(id);
            else this.selectedEntities.delete(id);
        });
        this.render(this.getCurrentFilterValues());
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = this.shadowRoot.getElementById('selectAllCheckbox');
        if (!selectAllCheckbox) return;
        const visibleEntityIds = this.filteredEntities.map(e => e.entity_id);
        if (visibleEntityIds.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
            return;
        }
        const selectedVisibleCount = visibleEntityIds.filter(id => this.selectedEntities.has(id)).length;
        if (selectedVisibleCount === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedVisibleCount === visibleEntityIds.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
    
    clearInvisibleSelections() {
        if (this.currentView === 'entities') {
            const visibleEntityIds = new Set(this.filteredEntities.map(e => e.entity_id));
            this.selectedEntities.forEach(id => {
                if (!visibleEntityIds.has(id)) this.selectedEntities.delete(id);
            });
        }
    }

    toggleSelection(entityId, isSelected) {
        if (isSelected) this.selectedEntities.add(entityId);
        else this.selectedEntities.delete(entityId);
        this.render(this.getCurrentFilterValues());
    }

    async callService(service, data) {
        try {
            await this._hass.callService('entity_manager', service, data);
        } catch (err) {
            alert(`Erro ao executar ${service}: ${err.message}`);
            throw err;
        }
    }

    async toggleEntityEnabled(entityId, enabled) {
        await this.callService('update_entity_state', { entity_id: entityId, enabled: enabled });
        const entity = this.entities.find(e => e.entity_id === entityId);
        if (entity) entity.enabled = enabled;
        this.filterEntities();
    }

    async updateRecorderDays(entityId, days) {
        const numDays = parseInt(days, 10);
        if (isNaN(numDays) || numDays < 0) return;
        await this.callService('update_recorder_days', { entity_id: entityId, recorder_days: numDays });
    }

    async handleDeleteEntity(entityId) {
        if (!confirm(`Tem certeza que deseja EXCLUIR a entidade ${entityId}? Esta ação não pode ser desfeita.`)) return;
        await this.callService('delete_entity', { entity_id: entityId });
        this.loadData();
    }

    async handlePurgeEntity(entityId) {
        if (!confirm(`Tem certeza que deseja limpar o histórico do recorder para ${entityId}?`)) return;
        await this.callService('purge_recorder', { entity_ids: [entityId] });
        alert(`Comando para limpar o histórico de ${entityId} foi enviado.`);
    }

    renderError(message) { 
        this.shadowRoot.innerHTML = `<ha-card><div class="card-header"><h3>Erro</h3></div><div class="message">${message}</div></ha-card>`; 
    }
}

if (!customElements.get('entity-manager-card')) {
    customElements.define('entity-manager-card', EntityManagerCard);
}