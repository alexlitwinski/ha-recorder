class EntityManagerCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isLoading = true;
        this.entities = [];
        this.filteredEntities = [];
        this.selectedEntities = new Set();
    }

    setConfig(config) {
        this._config = config;
    }

    set hass(hass) {
        if (!this._hass) {
            this._hass = hass;
            this.loadEntities();
        }
        this._hass = hass;
    }

    connectedCallback() {
        if (this._hass && !this.entities.length) {
            this.loadEntities();
        }
    }

    async loadEntities() {
        if (!this._hass) {
            console.error('Entity Manager: HASS not available');
            return;
        }
        
        console.log('Entity Manager: Starting to load entities...');
        this.isLoading = true;
        this.render();
        
        try {
            console.log('Entity Manager: Loading entities...');
            const entities = await this._hass.callApi('GET', 'entity_manager/entities');
            console.log('Entity Manager: Loaded entities:', entities.length, 'entities');
            
            this.entities = entities;
            this.isLoading = false;
            
            console.log('Entity Manager: Starting to filter entities...');
            this.filterEntities();
            console.log('Entity Manager: Entities filtered and rendered successfully');
            
        } catch (error) {
            console.error('Entity Manager: Error loading entities:', error);
            this.isLoading = false;
            this.renderError(`Erro ao carregar entidades: ${error.message}`);
        }
    }

    filterEntities() {
        const root = this.shadowRoot;
        if (!root) {
            console.error('Entity Manager: shadowRoot not available in filterEntities');
            return;
        }
        
        const currentFilters = this.getCurrentFilterValues();
        
        const searchText = currentFilters.search.toLowerCase();
        const stateFilter = currentFilters.state;
        const integrationFilter = currentFilters.integration;
        const domainFilter = currentFilters.domain;
        const enabledFilter = currentFilters.enabled;

        this.filteredEntities = this.entities.filter(entity => {
            let matchesState = true;
            if (stateFilter) {
                switch (stateFilter) {
                    case 'normal': 
                        matchesState = entity.state !== 'unavailable' && entity.state !== 'unknown' && entity.state !== null && entity.state !== ''; 
                        break;
                    case 'unavailable': 
                        matchesState = entity.state === 'unavailable'; 
                        break;
                    case 'unknown': 
                        matchesState = entity.state === 'unknown'; 
                        break;
                    case 'not_provided': 
                        matchesState = entity.state === null || entity.state === ''; 
                        break;
                }
            }
            if (!matchesState) return false;
            if (enabledFilter && (enabledFilter === 'enabled' ? !entity.enabled : entity.enabled)) return false;
            if (integrationFilter && entity.integration_domain !== integrationFilter) return false;
            if (domainFilter && entity.domain !== domainFilter) return false;
            if (searchText && !entity.entity_id.includes(searchText) && !(entity.name || '').toLowerCase().includes(searchText)) return false;
            
            return true;
        });
        
        this.clearInvisibleSelections();
        this.updateMainContent(currentFilters);
    }

    render() {
        const title = this._config?.title || "Gerenciador de Entidades";
        const version = "v20.0-NEW-FEATURES";

        const enabledCount = this.entities.filter(e => e.enabled).length;
        const integrations = [...new Set(this.entities.map(e => e.integration_domain).filter(Boolean))].sort();
        const domains = [...new Set(this.entities.map(e => e.domain).filter(Boolean))].sort();

        this.shadowRoot.innerHTML = `
            <style>
                :host { 
                    display: block; 
                    font-family: var(--paper-font-body1_-_font-family);
                }
                
                ha-card { 
                    display: flex; 
                    flex-direction: column; 
                    height: 100%; 
                    overflow: hidden;
                    border-radius: var(--ha-card-border-radius, 12px);
                    box-shadow: var(--ha-card-box-shadow);
                }
                
                .card-header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    padding: 16px; 
                    background: var(--primary-color); 
                    color: var(--text-primary-color);
                    border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0;
                }
                
                .card-header h3 { 
                    margin: 0; 
                    font-size: 1.2em; 
                    font-weight: 500;
                }
                
                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .stats-bar { 
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1px;
                    background: var(--divider-color);
                    font-size: 12px; 
                    text-align: center;
                    border-bottom: 1px solid var(--divider-color);
                }
                
                .stat-item {
                    background: var(--card-background-color);
                    padding: 12px 8px;
                    color: var(--primary-text-color);
                }
                
                .stat-value {
                    display: block;
                    font-size: 18px;
                    font-weight: bold;
                    color: var(--primary-color);
                }
                
                .stat-label {
                    display: block;
                    font-size: 11px;
                    color: var(--secondary-text-color);
                    margin-top: 2px;
                }
                
                .filters { 
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
                    gap: 12px; 
                    padding: 16px; 
                    background: var(--secondary-background-color);
                    border-bottom: 1px solid var(--divider-color);
                }
                
                .search-group {
                    display: flex;
                    gap: 0;
                    align-items: stretch;
                }
                
                .search-input {
                    flex: 1;
                    border-top-right-radius: 0;
                    border-bottom-right-radius: 0;
                    border-right: none;
                }
                
                .search-btn {
                    background: var(--primary-color);
                    color: var(--text-primary-color);
                    border: 1px solid var(--divider-color);
                    border-left: none;
                    border-top-left-radius: 0;
                    border-bottom-left-radius: 0;
                    border-top-right-radius: 6px;
                    border-bottom-right-radius: 6px;
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                
                .search-btn:hover {
                    background: var(--primary-color);
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                
                input, select { 
                    width: 100%; 
                    padding: 8px 12px; 
                    border-radius: 6px; 
                    border: 1px solid var(--divider-color); 
                    background: var(--card-background-color); 
                    color: var(--primary-text-color); 
                    box-sizing: border-box;
                    font-size: 14px;
                }
                
                input:focus, select:focus {
                    outline: none;
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 2px rgba(var(--rgb-primary-color), 0.2);
                }
                
                .bulk-actions { 
                    display: flex; 
                    flex-wrap: wrap; 
                    gap: 8px; 
                    padding: 16px; 
                    align-items: center; 
                    background: var(--secondary-background-color);
                    border-bottom: 1px solid var(--divider-color);
                }
                
                .select-all-group {
                    margin-right: 16px;
                }
                
                .select-all-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    color: var(--primary-text-color);
                    user-select: none;
                }
                
                .select-all-checkbox {
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                }
                
                .bulk-actions .spacer {
                    flex-grow: 1;
                }
                
                /* Novos estilos para os botões especiais */
                .special-actions {
                    display: flex;
                    gap: 8px;
                    padding: 16px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-bottom: 1px solid var(--divider-color);
                    align-items: center;
                    justify-content: center;
                }
                
                .special-btn {
                    background: rgba(255,255,255,0.9);
                    color: #333;
                    border: none;
                    padding: 12px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .special-btn:hover {
                    background: white;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                }
                
                .special-btn.purge {
                    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
                    color: white;
                }
                
                .special-btn.report {
                    background: linear-gradient(135deg, #4834d4, #667eea);
                    color: white;
                }
                
                .special-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .entities-container { 
                    flex: 1; 
                    overflow-y: auto; 
                    max-height: 60vh;
                    background: var(--card-background-color);
                }
                
                .entity-row { 
                    display: grid;
                    grid-template-columns: auto 1fr auto auto auto auto auto;
                    align-items: center; 
                    gap: 12px; 
                    padding: 12px 16px; 
                    border-bottom: 1px solid var(--divider-color);
                    transition: background-color 0.2s;
                }
                
                .entity-row:hover {
                    background: var(--table-row-background-color, rgba(0,0,0,0.04));
                }
                
                .entity-row.disabled {
                    opacity: 0.6;
                }
                
                .entity-info { 
                    min-width: 0;
                    overflow: hidden;
                }
                
                .entity-info .name { 
                    font-weight: 500; 
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis;
                    color: var(--primary-text-color);
                    margin-bottom: 2px;
                }
                
                .entity-info .id { 
                    font-size: 0.85em; 
                    color: var(--secondary-text-color); 
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis;
                    font-family: var(--code-font-family, monospace);
                }
                
                .entity-state { 
                    font-size: 0.9em; 
                    text-align: center;
                    padding: 4px 8px;
                    border-radius: 12px;
                    background: var(--state-icon-color, var(--primary-color));
                    color: var(--text-primary-color);
                    min-width: 60px;
                    font-weight: 500;
                }
                
                .entity-state.unavailable {
                    background: var(--warning-color, #ff9800);
                    color: var(--text-primary-color);
                }
                
                .entity-state.unknown {
                    background: var(--error-color, #f44336);
                    color: var(--text-primary-color);
                }
                
                .entity-controls { 
                    display: flex; 
                    align-items: center; 
                    gap: 8px;
                }
                
                .entity-controls input[type=number] { 
                    width: 65px; 
                    text-align: center; 
                    padding: 6px;
                    border-radius: 4px;
                    border: 1px solid var(--divider-color);
                }
                
                .message { 
                    text-align: center; 
                    padding: 40px 24px; 
                    color: var(--secondary-text-color);
                    font-size: 16px;
                }
                
                button { 
                    background-color: var(--primary-color); 
                    color: var(--text-primary-color); 
                    border: none; 
                    padding: 8px 16px; 
                    border-radius: 6px; 
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                }
                
                button:hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                
                button:active {
                    transform: translateY(0);
                }
                
                button.danger { 
                    background-color: var(--error-color, #f44336);
                }
                
                .icon-button { 
                    padding: 8px; 
                    line-height: 0; 
                    background-color: transparent; 
                    color: var(--primary-text-color); 
                    border: none; 
                    cursor: pointer; 
                    border-radius: 50%; 
                    width: 36px; 
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background-color 0.2s;
                }
                
                .icon-button:hover { 
                    background-color: rgba(var(--rgb-primary-color), 0.1);
                }
                
                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 50px;
                    height: 24px;
                }

                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #ccc;
                    transition: .4s;
                    border-radius: 24px;
                }

                .slider:before {
                    position: absolute;
                    content: "";
                    height: 18px;
                    width: 18px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    transition: .4s;
                    border-radius: 50%;
                }

                input:checked + .slider {
                    background-color: var(--primary-color);
                }

                input:checked + .slider:before {
                    transform: translateX(26px);
                }
                
                .selected-count {
                    font-size: 12px;
                    color: var(--secondary-text-color);
                    margin-left: 16px;
                }
                
                /* Modal styles */
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    overflow: auto;
                    background-color: rgba(0,0,0,0.4);
                }
                
                .modal-content {
                    background-color: var(--card-background-color);
                    margin: 15% auto;
                    padding: 20px;
                    border-radius: 8px;
                    width: 80%;
                    max-width: 500px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .close {
                    color: var(--secondary-text-color);
                    float: right;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                }
                
                .close:hover {
                    color: var(--primary-text-color);
                }
                
                .progress-bar {
                    width: 100%;
                    height: 20px;
                    background-color: var(--divider-color);
                    border-radius: 10px;
                    overflow: hidden;
                    margin: 10px 0;
                }
                
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, var(--primary-color), var(--accent-color));
                    width: 0%;
                    transition: width 0.3s ease;
                }
                
                @media (max-width: 768px) {
                    .filters {
                        grid-template-columns: 1fr;
                        gap: 8px;
                    }
                    
                    .search-group {
                        grid-column: 1;
                    }
                    
                    .bulk-actions, .special-actions {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 12px;
                    }
                    
                    .select-all-group {
                        margin-right: 0;
                        margin-bottom: 8px;
                    }
                    
                    .entity-row {
                        grid-template-columns: auto 1fr;
                        gap: 8px;
                    }
                    
                    .entity-controls {
                        grid-column: 1 / -1;
                        justify-content: space-between;
                        margin-top: 8px;
                        padding-top: 8px;
                        border-top: 1px solid var(--divider-color);
                    }
                }
            </style>
            <ha-card>
                <div class="card-header">
                    <h3>${title}</h3>
                    <div class="header-actions">
                        <span style="font-size: 12px; opacity: 0.8;">${version}</span>
                        <button class="icon-button" id="exportBtn" title="Exportar Entidades">📄</button>
                        <button class="icon-button" id="refreshBtn" title="Recarregar">🔄</button>
                    </div>
                </div>

                ${this.renderContent(enabledCount, integrations, domains)}
            </ha-card>
            
            <!-- Modal para progresso -->
            <div id="progressModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalTitle">Processando...</h3>
                        <span class="close" id="modalClose">&times;</span>
                    </div>
                    <div id="modalBody">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill"></div>
                        </div>
                        <div id="progressText">Iniciando...</div>
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    renderContent(enabledCount, integrations, domains) {
        if (this.isLoading) return `<div class="message">Carregando entidades...</div>`;
        
        return `
            <div class="stats-bar">
                <div class="stat-item">
                    <span class="stat-value">${this.entities.length}</span>
                    <span class="stat-label">TOTAL</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${enabledCount}</span>
                    <span class="stat-label">HABILITADAS</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${this.entities.length - enabledCount}</span>
                    <span class="stat-label">DESABILITADAS</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${this.filteredEntities.length}</span>
                    <span class="stat-label">EXIBIDAS</span>
                </div>
            </div>
            
            <!-- Nova seção para ações especiais -->
            <div class="special-actions">
                <button id="intelligentPurgeBtn" class="special-btn purge">
                    🧹 Limpeza Inteligente do Recorder
                </button>
                <button id="generateReportBtn" class="special-btn report">
                    📊 Relatório Top 100 Entidades
                </button>
            </div>
            
            <div class="filters">
                <div class="search-group">
                    <input id="searchFilter" placeholder="Buscar entidades..." class="filter-input search-input">
                    <button id="searchBtn" class="search-btn" title="Filtrar">🔍</button>
                </div>
                <select id="stateFilter" class="filter-input">
                    <option value="">Estado (Todos)</option>
                    <option value="normal">Normal</option>
                    <option value="unavailable">Indisponível</option>
                    <option value="unknown">Desconhecido</option>
                    <option value="not_provided">Não Fornecido</option>
                </select>
                <select id="integrationFilter" class="filter-input">
                    <option value="">Integração (Todas)</option>
                    ${integrations.map(i => `<option value="${i}">${i}</option>`).join('')}
                </select>
                <select id="domainFilter" class="filter-input">
                    <option value="">Domínio (Todos)</option>
                    ${domains.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
                <select id="enabledFilter" class="filter-input">
                    <option value="">Status (Todos)</option>
                    <option value="enabled">Habilitados</option>
                    <option value="disabled">Desabilitados</option>
                </select>
            </div>
            
            <div class="bulk-actions">
                <div class="select-all-group">
                    <label class="select-all-label">
                        <input type="checkbox" id="selectAllCheckbox" class="select-all-checkbox">
                        <span>Selecionar Todos</span>
                    </label>
                </div>
                <button id="enableSelectedBtn">Habilitar Selecionadas</button>
                <button id="disableSelectedBtn">Desabilitar Selecionadas</button>
                <div class="spacer"></div>
                <input id="bulkRecorderDays" type="number" min="0" placeholder="Dias" style="width: 80px;">
                <button id="setRecorderBtn">Definir Dias</button>
                <button id="deleteSelectedBtn" class="danger">Excluir Selecionadas</button>
                <span class="selected-count">${this.selectedEntities.size} selecionada(s)</span>
            </div>
            
            <div class="entities-container">
                ${this.filteredEntities.length === 0
                    ? `<div class="message">Nenhuma entidade encontrada.</div>`
                    : this.filteredEntities.map(entity => this.renderEntityRow(entity)).join('')
                }
            </div>
        `;
    }

    renderEntityRow(entity) {
        const isSelected = this.selectedEntities.has(entity.entity_id);
        const isEnabled = entity.enabled;
        const stateClass = entity.state === 'unavailable' ? 'unavailable' : entity.state === 'unknown' ? 'unknown' : '';
        
        return `
            <div class="entity-row ${isEnabled ? '' : 'disabled'}" data-entity-id="${entity.entity_id}">
                <input type="checkbox" data-select ${isSelected ? 'checked' : ''}>
                
                <div class="entity-info">
                    <div class="name" title="${entity.name || entity.entity_id}">
                        ${entity.name || entity.entity_id}
                    </div>
                    <div class="id" title="${entity.entity_id}">
                        ${entity.entity_id}
                    </div>
                </div>
                
                <div class="entity-state ${stateClass}" title="Estado: ${entity.state}">
                    ${entity.state}
                </div>
                
                <label class="toggle-switch" title="${isEnabled ? 'Habilitado' : 'Desabilitado'}">
                    <input type="checkbox" data-enable-toggle ${isEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                
                <input type="number" data-recorder value="${entity.recorder_days || 10}" min="0" max="365" title="Dias no Recorder">
                
                <button class="icon-button" data-purge title="Limpar Histórico do Recorder">🗑️</button>
                
                <button class="icon-button danger" data-delete title="Excluir Entidade">❌</button>
            </div>
        `;
    }

    attachEventListeners() {
        const root = this.shadowRoot;
        
        root.getElementById('exportBtn')?.addEventListener('click', () => this.exportEntities());
        root.getElementById('refreshBtn')?.addEventListener('click', () => this.loadEntities());
        
        // Novos event listeners para os botões especiais
        root.getElementById('intelligentPurgeBtn')?.addEventListener('click', () => this.handleIntelligentPurge());
        root.getElementById('generateReportBtn')?.addEventListener('click', () => this.handleGenerateReport());
        
        // Modal
        root.getElementById('modalClose')?.addEventListener('click', () => this.hideModal());
        
        this.attachContentEventListeners();
    }

    attachContentEventListeners() {
        const root = this.shadowRoot;
        
        root.querySelectorAll('select.filter-input').forEach(el => 
            el.addEventListener('change', () => this.filterEntities())
        );
        
        const searchInput = root.getElementById('searchFilter');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.filterEntities();
                }
            });
        }
        
        const searchBtn = root.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.filterEntities());
        }
        
        const selectAllCheckbox = root.getElementById('selectAllCheckbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });
        }
        
        root.getElementById('enableSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('enable'));
        root.getElementById('disableSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('disable'));
        root.getElementById('setRecorderBtn')?.addEventListener('click', () => this.handleBulkAction('set-recorder'));
        root.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('delete'));
        
        root.querySelectorAll('.entity-row').forEach(row => {
            const entityId = row.dataset.entityId;
            
            const checkbox = row.querySelector('[data-select]');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.toggleSelection(entityId, e.target.checked);
                    this.updateSelectAllCheckbox();
                });
            }
            
            const enableToggle = row.querySelector('[data-enable-toggle]');
            if (enableToggle) {
                enableToggle.addEventListener('change', (e) => 
                    this.toggleEntityEnabled(entityId, e.target.checked)
                );
            }
            
            const recorderInput = row.querySelector('[data-recorder]');
            if (recorderInput) {
                recorderInput.addEventListener('change', (e) => 
                    this.updateRecorderDays(entityId, e.target.value)
                );
            }
            
            const purgeBtn = row.querySelector('[data-purge]');
            if (purgeBtn) {
                purgeBtn.addEventListener('click', () => this.handlePurgeEntity(entityId));
            }
            
            const deleteBtn = row.querySelector('[data-delete]');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.handleDeleteEntity(entityId));
            }
        });
    }

    // NOVOS MÉTODOS PARA AS FUNCIONALIDADES SOLICITADAS

    async handleIntelligentPurge() {
        const confirmMessage = `
🧹 LIMPEZA INTELIGENTE DO RECORDER

Esta operação irá:
• Analisar todas as entidades configuradas no Entity Manager
• Executar limpeza baseada nos dias configurados para cada entidade
• Pular entidades com 0 dias (a menos que force)

Deseja continuar?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        this.showModal('Limpeza Inteligente', 'Preparando limpeza...');
        
        try {
            this.updateProgress(20, 'Analisando configurações...');
            
            const response = await fetch('/api/entity_manager/intelligent_purge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this._hass.auth.data.access_token}`
                },
                body: JSON.stringify({
                    force_purge: false
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.updateProgress(60, 'Executando limpeza...');
            const result = await response.json();
            
            this.updateProgress(100, 'Limpeza concluída!');
            
            setTimeout(() => {
                this.hideModal();
                this.showResultModal('Limpeza Inteligente Concluída', `
                    ✅ <strong>Limpeza executada com sucesso!</strong><br><br>
                    📊 <strong>Resultados:</strong><br>
                    • Entidades processadas: ${result.purged_count}<br>
                    • Entidades ignoradas: ${result.skipped_count}<br>
                    • Erros: ${result.error_count}<br><br>
                    ${result.errors.length > 0 ? 
                        `⚠️ <strong>Erros encontrados:</strong><br>${result.errors.map(e => `• ${e.entity_id}: ${e.error}`).join('<br>')}` 
                        : '✨ Nenhum erro encontrado!'}
                `);
            }, 1000);

        } catch (error) {
            console.error('Erro na limpeza inteligente:', error);
            this.hideModal();
            alert(`Erro na limpeza inteligente: ${error.message}`);
        }
    }

    async handleGenerateReport() {
        this.showModal('Gerando Relatório', 'Analisando banco de dados...');
        
        try {
            this.updateProgress(30, 'Contando registros por entidade...');
            
            const response = await fetch('/api/entity_manager/recorder_report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this._hass.auth.data.access_token}`
                },
                body: JSON.stringify({
                    limit: 100,
                    days_back: 30
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.updateProgress(70, 'Processando dados...');
            const result = await response.json();
            
            this.updateProgress(100, 'Relatório gerado!');
            
            setTimeout(() => {
                this.hideModal();
                this.showResultModal('Relatório Gerado', `
                    📊 <strong>Relatório das Top 100 Entidades</strong><br><br>
                    📈 <strong>Estatísticas:</strong><br>
                    • Entidades analisadas: ${result.entities_analyzed}<br>
                    • Total de registros: ${result.total_records.toLocaleString()}<br>
                    • Período: últimos 30 dias<br><br>
                    📁 <strong>Arquivo:</strong> ${result.report_file}<br><br>
                    <button onclick="window.open('${result.download_url}', '_blank')" 
                            style="background: var(--primary-color); color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                        📥 Download do Relatório
                    </button>
                `);
            }, 1000);

        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            this.hideModal();
            alert(`Erro ao gerar relatório: ${error.message}`);
        }
    }

    showModal(title, content) {
        const modal = this.shadowRoot.getElementById('progressModal');
        const modalTitle = this.shadowRoot.getElementById('modalTitle');
        const modalBody = this.shadowRoot.getElementById('modalBody');
        
        modalTitle.textContent = title;
        modalBody.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div id="progressText">${content}</div>
        `;
        
        modal.style.display = 'block';
    }

    showResultModal(title, content) {
        const modal = this.shadowRoot.getElementById('progressModal');
        const modalTitle = this.shadowRoot.getElementById('modalTitle');
        const modalBody = this.shadowRoot.getElementById('modalBody');
        
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        
        modal.style.display = 'block';
    }

    hideModal() {
        const modal = this.shadowRoot.getElementById('progressModal');
        modal.style.display = 'none';
    }

    updateProgress(percentage, text) {
        const progressFill = this.shadowRoot.getElementById('progressFill');
        const progressText = this.shadowRoot.getElementById('progressText');
        
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = text;
        }
    }

    // MÉTODOS EXISTENTES (mantidos inalterados)
    getCurrentFilterValues() {
        const root = this.shadowRoot;
        if (!root) {
            return {
                search: '',
                state: '',
                integration: '',
                domain: '',
                enabled: ''
            };
        }
        
        try {
            return {
                search: root.getElementById('searchFilter')?.value || '',
                state: root.getElementById('stateFilter')?.value || '',
                integration: root.getElementById('integrationFilter')?.value || '',
                domain: root.getElementById('domainFilter')?.value || '',
                enabled: root.getElementById('enabledFilter')?.value || ''
            };
        } catch (error) {
            return {
                search: '',
                state: '',
                integration: '',
                domain: '',
                enabled: ''
            };
        }
    }

    restoreFilterValues(filters) {
        const root = this.shadowRoot;
        if (!root) return;
        
        try {
            const searchInput = root.getElementById('searchFilter');
            if (searchInput && filters.search !== undefined) {
                searchInput.value = filters.search;
            }
            
            const stateSelect = root.getElementById('stateFilter');
            if (stateSelect && filters.state !== undefined) {
                stateSelect.value = filters.state;
            }
            
            const integrationSelect = root.getElementById('integrationFilter');
            if (integrationSelect && filters.integration !== undefined) {
                integrationSelect.value = filters.integration;
            }
            
            const domainSelect = root.getElementById('domainFilter');
            if (domainSelect && filters.domain !== undefined) {
                domainSelect.value = filters.domain;
            }
            
            const enabledSelect = root.getElementById('enabledFilter');
            if (enabledSelect && filters.enabled !== undefined) {
                enabledSelect.value = filters.enabled;
            }
        } catch (error) {
            console.warn('Entity Manager: Error restoring filter values:', error);
        }
    }

    updateMainContent(preserveFilters = null) {
        const enabledCount = this.entities.filter(e => e.enabled).length;
        const integrations = [...new Set(this.entities.map(e => e.integration_domain).filter(Boolean))].sort();
        const domains = [...new Set(this.entities.map(e => e.domain).filter(Boolean))].sort();
        
        const mainContent = this.shadowRoot.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = this.renderContent(enabledCount, integrations, domains);
            
            if (preserveFilters) {
                setTimeout(() => {
                    this.restoreFilterValues(preserveFilters);
                    setTimeout(() => this.updateSelectAllCheckbox(), 50);
                }, 10);
            } else {
                setTimeout(() => this.updateSelectAllCheckbox(), 50);
            }
            
            this.attachContentEventListeners();
        } else {
            this.render();
        }
    }

    toggleSelectAll(selectAll) {
        if (selectAll) {
            this.filteredEntities.forEach(entity => {
                this.selectedEntities.add(entity.entity_id);
            });
        } else {
            this.filteredEntities.forEach(entity => {
                this.selectedEntities.delete(entity.entity_id);
            });
        }
        
        const root = this.shadowRoot;
        root.querySelectorAll('.entity-row [data-select]').forEach(checkbox => {
            const entityId = checkbox.closest('.entity-row').dataset.entityId;
            checkbox.checked = this.selectedEntities.has(entityId);
        });
        
        this.updateSelectedCount();
    }

    updateSelectAllCheckbox() {
        const root = this.shadowRoot;
        const selectAllCheckbox = root.getElementById('selectAllCheckbox');
        if (!selectAllCheckbox) return;
        
        const visibleEntityIds = this.filteredEntities.map(e => e.entity_id);
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
        const visibleEntityIds = new Set(this.filteredEntities.map(e => e.entity_id));
        const currentSelected = Array.from(this.selectedEntities);
        
        currentSelected.forEach(entityId => {
            if (!visibleEntityIds.has(entityId)) {
                this.selectedEntities.delete(entityId);
            }
        });
    }

    clearAllSelections() {
        this.selectedEntities.clear();
        this.updateSelectedCount();
        this.updateSelectAllCheckbox();
    }

    updateSelectedCount() {
        const countEl = this.shadowRoot.querySelector('.selected-count');
        if (countEl) {
            countEl.textContent = `${this.selectedEntities.size} selecionada(s)`;
        }
    }

    toggleSelection(entityId, isSelected) {
        if (isSelected) {
            this.selectedEntities.add(entityId);
        } else {
            this.selectedEntities.delete(entityId);
        }
        
        this.updateSelectedCount();
        this.updateSelectAllCheckbox();
    }

    async callService(service, data) {
        try {
            await this._hass.callService('entity_manager', service, data);
        } catch (err) {
            let errorMessage = `Erro ao executar ${service}: `;
            
            if (err.message.includes('not found')) {
                errorMessage += `Serviço não encontrado. Verifique se a integração Entity Manager está instalada e o Home Assistant foi reiniciado.`;
            } else if (err.message.includes('connection')) {
                errorMessage += `Problema de conexão. Verifique sua conexão com o Home Assistant.`;
            } else if (err.message.includes('disabled_by must be a RegistryEntryDisabler')) {
                errorMessage += `Problema de compatibilidade com a versão do Home Assistant. Verifique os logs do HA para mais detalhes.`;
            } else {
                errorMessage += err.message;
            }
            
            alert(errorMessage);
            throw err;
        }
    }

    async toggleEntityEnabled(entityId, enabled) {
        await this.callService('update_entity_state', { entity_id: entityId, enabled: enabled });
        const entity = this.entities.find(e => e.entity_id === entityId);
        if (entity) {
            entity.enabled = enabled;
        }
        
        const row = this.shadowRoot.querySelector(`[data-entity-id="${entityId}"]`);
        if (row) {
            row.classList.toggle('disabled', !enabled);
        }
    }

    async updateRecorderDays(entityId, days) {
        const numDays = parseInt(days, 10);
        if (isNaN(numDays) || numDays < 0) return;
        await this.callService('update_recorder_days', { entity_id: entityId, recorder_days: numDays });
        
        const entity = this.entities.find(e => e.entity_id === entityId);
        if (entity) {
            entity.recorder_days = numDays;
        }
    }

    async handleDeleteEntity(entityId) {
        if (!confirm('Tem certeza que deseja excluir esta entidade? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            await this.callService('delete_entity', { entity_id: entityId });
            this.loadEntities();
        } catch (error) {
            console.error('Erro ao excluir entidade:', error);
        }
    }

    async handlePurgeEntity(entityId) {
        if (!confirm(`Tem certeza que deseja limpar o histórico do recorder para ${entityId}?`)) {
            return;
        }

        try {
            await this.callService('purge_recorder', { entity_ids: [entityId] });
            alert(`Comando para limpar o histórico de ${entityId} foi enviado.`);
        } catch (error) {
            console.error('Erro ao limpar histórico:', error);
        }
    }

    handleBulkAction(action) {
        const entity_ids = Array.from(this.selectedEntities);
        if (entity_ids.length === 0) {
            alert("Nenhuma entidade selecionada.");
            return;
        }

        switch(action) {
            case 'enable':
                this.callService('bulk_update', { entity_ids, enabled: true })
                    .then(() => {
                        this.clearAllSelections();
                        this.loadEntities();
                    });
                break;
            case 'disable':
                this.callService('bulk_update', { entity_ids, enabled: false })
                    .then(() => {
                        this.clearAllSelections();
                        this.loadEntities();
                    });
                break;
            case 'delete':
                if (confirm(`Tem certeza que deseja EXCLUIR ${entity_ids.length} entidades permanentemente?`)) {
                    this.callService('bulk_delete', { entity_ids })
                        .then(() => {
                            this.clearAllSelections();
                            this.loadEntities();
                        });
                }
                break;
            case 'set-recorder':
                const days = this.shadowRoot.getElementById('bulkRecorderDays')?.value;
                const numDays = parseInt(days, 10);
                if (isNaN(numDays) || numDays < 0) {
                    alert("Por favor, insira um número válido de dias.");
                    return;
                }
                this.callService('bulk_update', { entity_ids, recorder_days: numDays })
                    .then(() => {
                        this.clearAllSelections();
                        this.loadEntities();
                    });
                break;
        }
    }

    exportEntities() {
        if (this.filteredEntities.length === 0) {
            alert('Nenhuma entidade para exportar (baseado nos filtros atuais).');
            return;
        }

        let content = `# Exportação de Entidades - Entity Manager\n`;
        content += `# Data: ${new Date().toLocaleString('pt-BR')}\n`;
        content += `# Total de entidades exportadas: ${this.filteredEntities.length}\n\n`;

        this.filteredEntities.forEach(entity => {
            content += `- entity_id: ${entity.entity_id}\n`;
            content += `  name: "${entity.name}"\n`;
            content += `  state: ${entity.state}\n`;
            content += `  domain: ${entity.domain}\n`;
            content += `  integration: ${entity.integration_domain}\n`;
            content += `  enabled: ${entity.enabled}\n\n`;
        });

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `export_entidades_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    renderError(message) {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; }
                ha-card { 
                    border-radius: var(--ha-card-border-radius, 12px);
                    box-shadow: var(--ha-card-box-shadow);
                    overflow: hidden;
                }
                .card-header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    padding: 16px; 
                    background: var(--error-color, #f44336); 
                    color: white;
                }
                .error-content {
                    padding: 24px;
                    background: var(--card-background-color);
                    color: var(--primary-text-color);
                    line-height: 1.5;
                }
            </style>
            <ha-card>
                <div class="card-header">
                    <h3>Erro - Entity Manager</h3>
                </div>
                <div class="error-content">
                    ${message}
                </div>
            </ha-card>
        `;
    }
}

if (!customElements.get('entity-manager-card')) {
    try {
        customElements.define('entity-manager-card', EntityManagerCard);
        console.log('Entity Manager Card: Successfully registered custom element with new features');
    } catch (error) {
        console.error('Entity Manager Card: Failed to register custom element:', error);
    }
} else {
    console.warn('Entity Manager Card: Custom element already defined, skipping registration');
    
    try {
        const existingCards = document.querySelectorAll('entity-manager-card');
        existingCards.forEach(card => {
            if (card.loadEntities) {
                console.log('Entity Manager Card: Reloading existing card instance');
                card.loadEntities();
            }
        });
    } catch (error) {
        console.warn('Entity Manager Card: Could not reload existing instances:', error);
    }
}