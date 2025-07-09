class EntityManagerCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.entities = [];
        this.selectedEntities = new Set();
        this.filteredEntities = [];
    }

    setConfig(config) {
        this.config = {
            title: config.title || 'Entity Manager',
            show_filters: config.show_filters !== false,
            show_bulk_actions: config.show_bulk_actions !== false,
            domains: config.domains || [],
            max_entities: config.max_entities || 50,
            ...config
        };
    }

    set hass(hass) {
        this._hass = hass;
        this.loadEntities();
    }

    async loadEntities() {
        if (!this._hass) return;

        try {
            // Buscar entidades do registry
            const entityRegistry = await this._hass.callWS({
                type: 'config/entity_registry/list'
            });

            // Buscar configurações do entity manager
            let entityConfigs = {};
            try {
                const response = await this._hass.callApi('GET', 'entity_manager/config');
                entityConfigs = response || {};
            } catch (e) {
                console.log('No existing config found, using defaults');
            }

            // Combinar dados
            this.entities = entityRegistry
                .filter(entity => {
                    if (this.config.domains.length > 0) {
                        return this.config.domains.includes(entity.entity_id.split('.')[0]);
                    }
                    return true;
                })
                .slice(0, this.config.max_entities)
                .map(entity => {
                    const state = this._hass.states[entity.entity_id];
                    const config = entityConfigs[entity.entity_id] || {};
                    
                    return {
                        entity_id: entity.entity_id,
                        name: entity.name || entity.entity_id,
                        domain: entity.entity_id.split('.')[0],
                        platform: entity.platform,
                        enabled: !entity.disabled_by,
                        state: state ? state.state : 'unavailable',
                        attributes: state ? state.attributes : {},
                        recorder_days: config.recorder_days || 10
                    };
                });

            this.filteredEntities = [...this.entities];
            this.render();
        } catch (error) {
            console.error('Error loading entities:', error);
            this.showError('Erro ao carregar entidades: ' + error.message);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                    background: var(--primary-color);
                    color: var(--text-primary-color);
                    border-radius: 8px 8px 0 0;
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
                    transition: background-color 0.2s;
                }
                
                .btn-primary { background: var(--primary-color); color: var(--text-primary-color); }
                .btn-success { background: #4caf50; color: white; }
                .btn-danger { background: #f44336; color: white; }
                .btn-warning { background: #ff9800; color: white; }
                
                .btn-primary:hover { background: var(--primary-color); opacity: 0.8; }
                .btn-success:hover { background: #45a049; }
                .btn-danger:hover { background: #da190b; }
                .btn-warning:hover { background: #e68900; }
                
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
                }
                
                .entity-id {
                    font-size: 12px;
                    color: var(--secondary-text-color);
                }
                
                .entity-state {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    margin-right: 12px;
                    background: var(--state-color, var(--secondary-background-color));
                    color: var(--primary-text-color);
                }
                
                .entity-controls {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                
                .entity-controls input[type="checkbox"] {
                    transform: scale(1.2);
                    margin-right: 8px;
                }
                
                .entity-controls input[type="number"] {
                    width: 60px;
                    padding: 4px 6px;
                    border: 1px solid var(--divider-color);
                    border-radius: 4px;
                    background: var(--card-background-color);
                    color: var(--primary-text-color);
                    font-size: 12px;
                }
                
                .entity-controls label {
                    font-size: 12px;
                    color: var(--secondary-text-color);
                    margin-right: 4px;
                }
                
                .toggle-btn {
                    padding: 4px 8px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
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
                }
                
                .success {
                    padding: 16px;
                    background: #e8f5e8;
                    color: #2e7d32;
                    border-radius: 4px;
                    margin: 8px;
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
            </style>
            
            <div class="card-header">
                <h3>${this.config.title}</h3>
                <button class="btn-primary" onclick="this.getRootNode().host.loadEntities()">🔄</button>
            </div>
            
            ${this.config.show_filters ? this.renderFilters() : ''}
            ${this.config.show_bulk_actions ? this.renderBulkActions() : ''}
            
            <div id="message-area"></div>
            
            <div class="entities-container">
                ${this.renderEntities()}
            </div>
        `;
        
        this.setupEventListeners();
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
                <button class="btn-success" onclick="this.getRootNode().host.bulkEnable()">✅ Habilitar</button>
                <button class="btn-danger" onclick="this.getRootNode().host.bulkDisable()">❌ Desabilitar</button>
                <input type="number" id="bulkRecorderDays" placeholder="Dias" min="0" max="365" style="width: 60px;">
                <button class="btn-primary" onclick="this.getRootNode().host.bulkUpdateRecorder()">📊 Definir Dias</button>
                <button class="btn-warning" onclick="this.getRootNode().host.bulkPurge()">🗑️ Limpar</button>
            </div>
        `;
    }
    
    renderEntities() {
        if (this.entities.length === 0) {
            return '<div class="loading">Carregando entidades...</div>';
        }
        
        if (this.filteredEntities.length === 0) {
            return '<div class="no-entities">Nenhuma entidade encontrada.</div>';
        }
        
        return this.filteredEntities.map(entity => this.renderEntityRow(entity)).join('');
    }
    
    renderEntityRow(entity) {
        const isSelected = this.selectedEntities.has(entity.entity_id);
        const stateColor = this.getStateColor(entity.state);
        
        return `
            <div class="entity-row ${!entity.enabled ? 'disabled' : ''}" data-entity-id="${entity.entity_id}">
                <div class="entity-info">
                    <div class="entity-name">${entity.name}</div>
                    <div class="entity-id">${entity.entity_id}</div>
                </div>
                <div class="entity-state" style="background-color: ${stateColor}">
                    ${entity.state}
                </div>
                <div class="entity-controls">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="this.getRootNode().host.toggleSelection('${entity.entity_id}')">
                    <label>Ativo:</label>
                    <input type="checkbox" ${entity.enabled ? 'checked' : ''} 
                           onchange="this.getRootNode().host.toggleEntity('${entity.entity_id}', this.checked)">
                    <label>Dias:</label>
                    <input type="number" value="${entity.recorder_days}" min="0" max="365"
                           onchange="this.getRootNode().host.updateRecorderDays('${entity.entity_id}', this.value)">
                    <button class="toggle-btn" onclick="this.getRootNode().host.purgeEntity('${entity.entity_id}')">🗑️</button>
                </div>
            </div>
        `;
    }
    
    getStateColor(state) {
        const colors = {
            'on': '#4caf50',
            'off': '#f44336',
            'unavailable': '#9e9e9e',
            'unknown': '#ff9800'
        };
        return colors[state] || '#2196f3';
    }
    
    setupEventListeners() {
        if (!this.config.show_filters) return;
        
        const searchFilter = this.shadowRoot.getElementById('searchFilter');
        const domainFilter = this.shadowRoot.getElementById('domainFilter');
        const enabledFilter = this.shadowRoot.getElementById('enabledFilter');
        
        if (searchFilter) {
            searchFilter.addEventListener('input', () => this.filterEntities());
        }
        if (domainFilter) {
            domainFilter.addEventListener('change', () => this.filterEntities());
        }
        if (enabledFilter) {
            enabledFilter.addEventListener('change', () => this.filterEntities());
        }
    }
    
    filterEntities() {
        const searchText = this.shadowRoot.getElementById('searchFilter')?.value.toLowerCase() || '';
        const domainFilter = this.shadowRoot.getElementById('domainFilter')?.value || '';
        const enabledFilter = this.shadowRoot.getElementById('enabledFilter')?.value || '';
        
        this.filteredEntities = this.entities.filter(entity => {
            const matchesSearch = !searchText || 
                entity.entity_id.toLowerCase().includes(searchText) || 
                entity.name.toLowerCase().includes(searchText);
            
            const matchesDomain = !domainFilter || entity.domain === domainFilter;
            const matchesEnabled = !enabledFilter || 
                (enabledFilter === 'enabled' && entity.enabled) ||
                (enabledFilter === 'disabled' && !entity.enabled);
            
            return matchesSearch && matchesDomain && matchesEnabled;
        });
        
        this.render();
    }
    
    toggleSelection(entityId) {
        if (this.selectedEntities.has(entityId)) {
            this.selectedEntities.delete(entityId);
        } else {
            this.selectedEntities.add(entityId);
        }
        this.updateSelectedCount();
    }
    
    updateSelectedCount() {
        const countElement = this.shadowRoot.getElementById('selectedCount');
        if (countElement) {
            countElement.textContent = this.selectedEntities.size;
        }
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
    '%c ENTITY-MANAGER-CARD %c v1.0.0 ',
    'color: orange; font-weight: bold; background: black',
    'color: white; font-weight: bold; background: dimgray'
);
