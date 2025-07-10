class EntityManagerCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.entities = [];
        this.selectedEntities = new Set();
        this.filteredEntities = [];
        this.isLoading = false;
    }

    setConfig(config) {
        this.config = {
            title: config.title || 'Entity Manager',
            show_filters: config.show_filters !== false,
            show_bulk_actions: config.show_bulk_actions !== false,
            domains: config.domains || [],
            max_entities: config.max_entities || 100,
            auto_refresh: config.auto_refresh || false,
            ...config
        };
    }

    set hass(hass) {
        this._hass = hass;
        if (!this.isLoading && this.entities.length === 0) {
            this.loadEntities();
        }
    }

    async loadEntities() {
        if (!this._hass || this.isLoading) return;

        this.isLoading = true;
        
        try {
            // Corrigir a chamada da API
            const response = await fetch('/api/entity_manager/entities', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            let entities = await response.json();

            // Aplicar filtros de configuração
            if (this.config.domains.length > 0) {
                entities = entities.filter(entity => 
                    this.config.domains.includes(entity.domain)
                );
            }

            // Limitar número de entidades
            if (this.config.max_entities > 0) {
                entities = entities.slice(0, this.config.max_entities);
            }

            this.entities = entities;
            this.filteredEntities = [...this.entities];
            this.render();
            
        } catch (error) {
            console.error('Error loading entities:', error);
            this.showError('Erro ao carregar entidades: ' + error.message);
        } finally {
            this.isLoading = false;
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: var(--card-background-color);
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: var(--shadow-elevation-medium);
                }
                
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                    background: var(--primary-color);
                    color: var(--text-primary-color);
                }
                
                .card-header h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 500;
                }
                
                .refresh-btn {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: var(--text-primary-color);
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                
                .refresh-btn:hover {
                    background: rgba(255,255,255,0.3);
                }
                
                .filters {
                    display: flex;
                    gap: 12px;
                    padding: 16px;
                    background: var(--card-background-color);
                    border-bottom: 1px solid var(--divider-color);
                    flex-wrap: wrap;
                }
                
                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 120px;
                }
                
                .filter-group label {
                    font-size: 12px;
                    color: var(--secondary-text-color);
                    font-weight: 500;
                }
                
                .filter-group input,
                .filter-group select {
                    padding: 6px 8px;
                    border: 1px solid var(--divider-color);
                    border-radius: 4px;
                    background: var(--card-background-color);
                    color: var(--primary-text-color);
                    font-size: 12px;
                }
                
                .bulk-actions {
                    display: flex;
                    gap: 8px;
                    padding: 12px 16px;
                    background: var(--card-background-color);
                    border-bottom: 1px solid var(--divider-color);
                    align-items: center;
                    flex-wrap: wrap;
                }
                
                .bulk-actions button {
                    padding: 6px 12px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: opacity 0.2s;
                }
                
                .btn-primary { background: var(--primary-color); color: var(--text-primary-color); }
                .btn-success { background: #4caf50; color: white; }
                .btn-danger { background: #f44336; color: white; }
                .btn-warning { background: #ff9800; color: white; }
                
                .btn-primary:hover, .btn-success:hover, .btn-danger:hover, .btn-warning:hover {
                    opacity: 0.8;
                }
                
                .entities-container {
                    max-height: 400px;
                    overflow-y: auto;
                    padding: 8px;
                    background: var(--card-background-color);
                }
                
                .entity-row {
                    display: flex;
                    align-items: center;
                    padding: 12px;
                    border: 1px solid var(--divider-color);
                    border-radius: 6px;
                    margin-bottom: 8px;
                    background: var(--card-background-color);
                    transition: background-color 0.2s;
                }
                
                .entity-row:hover {
                    background: var(--secondary-background-color);
                }
                
                .entity-row.disabled {
                    opacity: 0.6;
                }
                
                .entity-info {
                    flex: 1;
                    margin-right: 12px;
                }
                
                .entity-name {
                    font-weight: 500;
                    color: var(--primary-text-color);
                    margin-bottom: 2px;
                    font-size: 14px;
                }
                
                .entity-id {
                    font-size: 11px;
                    color: var(--secondary-text-color);
                    font-family: monospace;
                }
                
                .entity-state {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    margin-right: 12px;
                    color: white;
                    white-space: nowrap;
                }
                
                .entity-state.on { background: #4caf50; }
                .entity-state.off { background: #f44336; }
                .entity-state.unavailable { background: #9e9e9e; }
                .entity-state.not_provided { background: #ff9800; }
                .entity-state.unknown { background: #607d8b; }
                
                .entity-controls {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    flex-wrap: wrap;
                }
                
                .control-group {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .control-group label {
                    font-size: 11px;
                    color: var(--secondary-text-color);
                    white-space: nowrap;
                }
                
                .entity-controls input[type="checkbox"] {
                    transform: scale(1.1);
                    cursor: pointer;
                }
                
                .entity-controls input[type="number"] {
                    width: 60px;
                    padding: 4px 6px;
                    border: 1px solid var(--divider-color);
                    border-radius: 4px;
                    background: var(--card-background-color);
                    color: var(--primary-text-color);
                    font-size: 11px;
                }
                
                .toggle-btn {
                    padding: 4px 8px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 11px;
                    background: var(--primary-color);
                    color: var(--text-primary-color);
                }
                
                .selected-count {
                    font-size: 12px;
                    color: var(--secondary-text-color);
                    margin-right: 8px;
                }
                
                .error {
                    padding: 16px;
                    background: #ffebee;
                    color: #c62828;
                    border-radius: 4px;
                    margin: 8px;
                    border-left: 4px solid #c62828;
                }
                
                .success {
                    padding: 16px;
                    background: #e8f5e8;
                    color: #2e7d32;
                    border-radius: 4px;
                    margin: 8px;
                    border-left: 4px solid #2e7d32;
                }
                
                .loading {
                    text-align: center;
                    padding: 40px;
                    color: var(--secondary-text-color);
                }
                
                .no-entities {
                    text-align: center;
                    padding: 40px;
                    color: var(--secondary-text-color);
                }
                
                .stats {
                    display: flex;
                    justify-content: space-around;
                    padding: 12px 16px;
                    background: var(--secondary-background-color);
                    border-bottom: 1px solid var(--divider-color);
                    font-size: 12px;
                }
                
                .stat-item {
                    text-align: center;
                    color: var(--secondary-text-color);
                }
                
                .stat-number {
                    font-weight: bold;
                    color: var(--primary-text-color);
                    display: block;
                }
            </style>
            
            <div class="card-header">
                <h3>${this.config.title}</h3>
                <button class="refresh-btn" id="refreshBtn">🔄 Recarregar</button>
            </div>
            
            ${this.renderStats()}
            ${this.config.show_filters ? this.renderFilters() : ''}
            ${this.config.show_bulk_actions ? this.renderBulkActions() : ''}
            
            <div id="message-area"></div>
            
            <div class="entities-container">
                ${this.renderEntities()}
            </div>
        `;
        
        this.setupEventListeners();
    }
    
    renderStats() {
        if (this.entities.length === 0) return '';
        
        const enabled = this.entities.filter(e => e.enabled).length;
        const disabled = this.entities.length - enabled;
        
        return `
            <div class="stats">
                <div class="stat-item">
                    <span class="stat-number">${this.entities.length}</span>
                    Total
                </div>
                <div class="stat-item">
                    <span class="stat-number">${enabled}</span>
                    Habilitadas
                </div>
                <div class="stat-item">
                    <span class="stat-number">${disabled}</span>
                    Desabilitadas
                </div>
                <div class="stat-item">
                    <span class="stat-number">${this.filteredEntities.length}</span>
                    Exibidas
                </div>
            </div>
        `;
    }
    
    renderFilters() {
        const domains = [...new Set(this.entities.map(e => e.domain))].sort();
        
        return `
            <div class="filters">
                <div class="filter-group">
                    <label>Buscar:</label>
                    <input type="text" id="searchFilter" placeholder="Nome ou ID..." />
                </div>
                <div class="filter-group">
                    <label>Estado:</label>
                    <select id="stateFilter">
                        <option value="">Todos</option>
                        <option value="on">Ligado (on)</option>
                        <option value="off">Desligado (off)</option>
                        <option value="unavailable">Indisponível</option>
                        <option value="not_provided">Não Fornecido</option>
                        <option value="unknown">Desconhecido</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Domínio:</label>
                    <select id="domainFilter">
                        <option value="">Todos</option>
                        ${domains.map(domain => `<option value="${domain}">${domain}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Status:</label>
                    <select id="enabledFilter">
                        <option value="">Todos</option>
                        <option value="enabled">Habilitados</option>
                        <option value="disabled">Desabilitados</option>
                    </select>
                </div>
            </div>
        `;
    }
    
    renderBulkActions() {
        return `
            <div class="bulk-actions">
                <span class="selected-count">Selecionados: <span id="selectedCount">0</span></span>
                <button class="btn-success" id="bulkEnableBtn">✅ Habilitar</button>
                <button class="btn-danger" id="bulkDisableBtn">❌ Desabilitar</button>
                <input type="number" id="bulkRecorderDays" placeholder="Dias" min="0" max="365" style="width: 60px;">
                <button class="btn-primary" id="bulkRecorderBtn">📊 Definir Dias</button>
                <button class="btn-warning" id="bulkPurgeBtn">🗑️ Limpar</button>
                <button class="btn-primary" id="selectAllBtn">☑️ Todos</button>
                <button class="btn-primary" id="selectNoneBtn">☐ Limpar</button>
            </div>
        `;
    }
    
    renderEntities() {
        if (this.isLoading) {
            return '<div class="loading">Carregando entidades...</div>';
        }
        
        if (this.entities.length === 0) {
            return '<div class="loading">Nenhuma entidade encontrada.</div>';
        }
        
        if (this.filteredEntities.length === 0) {
            return '<div class="no-entities">Nenhuma entidade corresponde aos filtros.</div>';
        }
        
        return this.filteredEntities.map(entity => this.renderEntityRow(entity)).join('');
    }
    
    renderEntityRow(entity) {
        const isSelected = this.selectedEntities.has(entity.entity_id);
        
        return `
            <div class="entity-row ${!entity.enabled ? 'disabled' : ''}" data-entity-id="${entity.entity_id}">
                <div class="entity-info">
                    <div class="entity-name">${entity.name}</div>
                    <div class="entity-id">${entity.entity_id}</div>
                </div>
                <div class="entity-state ${entity.state}">
                    ${entity.state}
                </div>
                <div class="entity-controls">
                    <div class="control-group">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                               data-select="${entity.entity_id}">
                        <label>Sel.</label>
                    </div>
                    <div class="control-group">
                        <input type="checkbox" ${entity.enabled ? 'checked' : ''} 
                               data-enabled="${entity.entity_id}">
                        <label>${entity.enabled ? 'Hab.' : 'Des.'}</label>
                    </div>
                    <div class="control-group">
                        <label>Dias:</label>
                        <input type="number" value="${entity.recorder_days}" min="0" max="365"
                               data-recorder="${entity.entity_id}">
                    </div>
                    <button class="toggle-btn" data-purge="${entity.entity_id}">🗑️</button>
                </div>
            </div>
        `;
    }
    
    setupEventListeners() {
        // Botão refresh
        const refreshBtn = this.shadowRoot.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadEntities());
        }
        
        // Filtros
        if (this.config.show_filters) {
            ['searchFilter', 'stateFilter', 'domainFilter', 'enabledFilter'].forEach(id => {
                const element = this.shadowRoot.getElementById(id);
                if (element) {
                    element.addEventListener('input', () => this.filterEntities());
                    element.addEventListener('change', () => this.filterEntities());
                }
            });
        }
        
        // Ações em lote
        if (this.config.show_bulk_actions) {
            const bulkActions = {
                'bulkEnableBtn': () => this.bulkEnable(),
                'bulkDisableBtn': () => this.bulkDisable(),
                'bulkRecorderBtn': () => this.bulkUpdateRecorder(),
                'bulkPurgeBtn': () => this.bulkPurge(),
                'selectAllBtn': () => this.selectAll(),
                'selectNoneBtn': () => this.selectNone()
            };
            
            Object.entries(bulkActions).forEach(([id, handler]) => {
                const element = this.shadowRoot.getElementById(id);
                if (element) {
                    element.addEventListener('click', handler);
                }
            });
        }
        
        // Event delegation para controles das entidades
        this.shadowRoot.addEventListener('change', (e) => {
            const target = e.target;
            
            if (target.hasAttribute('data-select')) {
                const entityId = target.getAttribute('data-select');
                this.toggleSelection(entityId, target.checked);
            } else if (target.hasAttribute('data-enabled')) {
                const entityId = target.getAttribute('data-enabled');
                this.toggleEntity(entityId, target.checked);
            } else if (target.hasAttribute('data-recorder')) {
                const entityId = target.getAttribute('data-recorder');
                this.updateRecorderDays(entityId, target.value);
            }
        });
        
        // Event delegation para botões
        this.shadowRoot.addEventListener('click', (e) => {
            const target = e.target;
            
            if (target.hasAttribute('data-purge')) {
                const entityId = target.getAttribute('data-purge');
                this.purgeEntity(entityId);
            }
        });
    }
    
    filterEntities() {
        const searchText = this.shadowRoot.getElementById('searchFilter')?.value.toLowerCase() || '';
        const stateFilter = this.shadowRoot.getElementById('stateFilter')?.value || '';
        const domainFilter = this.shadowRoot.getElementById('domainFilter')?.value || '';
        const enabledFilter = this.shadowRoot.getElementById('enabledFilter')?.value || '';
        
        this.filteredEntities = this.entities.filter(entity => {
            const matchesSearch = !searchText || 
                entity.entity_id.toLowerCase().includes(searchText) || 
                entity.name.toLowerCase().includes(searchText);
            
            const matchesState = !stateFilter || entity.state === stateFilter;
            const matchesDomain = !domainFilter || entity.domain === domainFilter;
            const matchesEnabled = !enabledFilter || 
                (enabledFilter === 'enabled' && entity.enabled) ||
                (enabledFilter === 'disabled' && !entity.enabled);
            
            return matchesSearch && matchesState && matchesDomain && matchesEnabled;
        });
        
        this.render();
    }
    
    toggleSelection(entityId, checked) {
        if (checked) {
            this.selectedEntities.add(entityId);
        } else {
            this.selectedEntities.delete(entityId);
        }
        this.updateSelectedCount();
    }
    
    updateSelectedCount() {
        const countElement = this.shadowRoot.getElementById('selectedCount');
        if (countElement) {
            countElement.textContent = this.selectedEntities.size;
        }
    }
    
    selectAll() {
        this.selectedEntities.clear();
        this.filteredEntities.forEach(entity => {
            this.selectedEntities.add(entity.entity_id);
        });
        this.render();
    }
    
    selectNone() {
        this.selectedEntities.clear();
        this.render();
    }
    
    async toggleEntity(entityId, enabled) {
        try {
            await this._hass.callService('entity_manager', 'update_entity_state', {
                entity_id: entityId,
                enabled: enabled
            });
            
            const entity = this.entities.find(e => e.entity_id === entityId);
            if (entity) {
                entity.enabled = enabled;
            }
            
            this.showMessage(`Entidade ${enabled ? 'habilitada' : 'desabilitada'} com sucesso!`, 'success');
            this.render();
        } catch (error) {
            this.showMessage('Erro ao alterar entidade: ' + error.message, 'error');
        }
    }
    
    async updateRecorderDays(entityId, days) {
        try {
            await this._hass.callService('entity_manager', 'update_recorder_days', {
                entity_id: entityId,
                recorder_days: parseInt(days)
            });
            
            const entity = this.entities.find(e => e.entity_id === entityId);
            if (entity) {
                entity.recorder_days = parseInt(days);
            }
            
            this.showMessage('Dias do recorder atualizados!', 'success');
        } catch (error) {
            this.showMessage('Erro ao atualizar dias: ' + error.message, 'error');
        }
    }
    
    async bulkEnable() {
        if (this.selectedEntities.size === 0) {
            this.showMessage('Selecione pelo menos uma entidade', 'error');
            return;
        }
        
        try {
            await this._hass.callService('entity_manager', 'bulk_update', {
                entity_ids: Array.from(this.selectedEntities),
                enabled: true
            });
            
            this.showMessage(`${this.selectedEntities.size} entidades habilitadas!`, 'success');
            this.loadEntities();
        } catch (error) {
            this.showMessage('Erro na atualização em lote: ' + error.message, 'error');
        }
    }
    
    async bulkDisable() {
        if (this.selectedEntities.size === 0) {
            this.showMessage('Selecione pelo menos uma entidade', 'error');
            return;
        }
        
        try {
            await this._hass.callService('entity_manager', 'bulk_update', {
                entity_ids: Array.from(this.selectedEntities),
                enabled: false
            });
            
            this.showMessage(`${this.selectedEntities.size} entidades desabilitadas!`, 'success');
            this.loadEntities();
        } catch (error) {
            this.showMessage('Erro na atualização em lote: ' + error.message, 'error');
        }
    }
    
    async bulkUpdateRecorder() {
        if (this.selectedEntities.size === 0) {
            this.showMessage('Selecione pelo menos uma entidade', 'error');
            return;
        }
        
        const days = this.shadowRoot.getElementById('bulkRecorderDays').value;
        if (!days) {
            this.showMessage('Digite o número de dias', 'error');
            return;
        }
        
        try {
            await this._hass.callService('entity_manager', 'bulk_update', {
                entity_ids: Array.from(this.selectedEntities),
                recorder_days: parseInt(days)
            });
            
            this.showMessage(`Dias atualizados para ${this.selectedEntities.size} entidades!`, 'success');
            this.loadEntities();
        } catch (error) {
            this.showMessage('Erro na atualização: ' + error.message, 'error');
        }
    }
    
    async bulkPurge() {
        if (this.selectedEntities.size === 0) {
            this.showMessage('Selecione pelo menos uma entidade', 'error');
            return;
        }
        
        if (!confirm(`Limpar histórico de ${this.selectedEntities.size} entidades?`)) {
            return;
        }
        
        try {
            await this._hass.callService('entity_manager', 'purge_recorder', {
                entity_ids: Array.from(this.selectedEntities)
            });
            
            this.showMessage(`Histórico limpo para ${this.selectedEntities.size} entidades!`, 'success');
        } catch (error) {
            this.showMessage('Erro ao limpar histórico: ' + error.message, 'error');
        }
    }
    
    async purgeEntity(entityId) {
        if (!confirm(`Limpar histórico da entidade ${entityId}?`)) {
            return;
        }
        
        try {
            await this._hass.callService('entity_manager', 'purge_recorder', {
                entity_ids: [entityId]
            });
            
            this.showMessage('Histórico limpo!', 'success');
        } catch (error) {
            this.showMessage('Erro ao limpar: ' + error.message, 'error');
        }
    }
    
    showMessage(message, type) {
        const messageArea = this.shadowRoot.getElementById('message-area');
        if (messageArea) {
            messageArea.innerHTML = `<div class="${type}">${message}</div>`;
            setTimeout(() => {
                messageArea.innerHTML = '';
            }, 3000);
        }
    }
    
    showError(message) {
        this.shadowRoot.innerHTML = `<div class="error">${message}</div>`;
    }
    
    getCardSize() {
        return 6;
    }
    
    static get properties() {
        return {
            hass: { type: Object },
            config: { type: Object }
        };
    }
}

customElements.define('entity-manager-card', EntityManagerCard);

// Registrar no Lovelace
window.customCards = window.customCards || [];
window.customCards.push({
    type: 'entity-manager-card',
    name: 'Entity Manager Card',
    description: 'Gerenciador avançado de entidades com controle de recorder',
    preview: true,
    documentationURL: 'https://github.com/alexlitwinski/ha-recorder',
});

// Adicionar ao console para debugging
console.info(
    '%c ENTITY-MANAGER-CARD %c v1.0.2 ',
    'color: orange; font-weight: bold; background: black',
    'color: white; font-weight: bold; background: dimgray'
);