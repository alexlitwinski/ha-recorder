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
            this.isLoading = false; // IMPORTANTE: Definir ANTES de filtrar
            
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
        console.log('Entity Manager: filterEntities() called, isLoading:', this.isLoading);
        
        const root = this.shadowRoot;
        if (!root) {
            console.error('Entity Manager: shadowRoot not available in filterEntities');
            return;
        }
        
        // Salvar valores atuais dos filtros ANTES de filtrar
        const currentFilters = this.getCurrentFilterValues();
        console.log('Entity Manager: Current filters:', currentFilters);
        
        const searchText = currentFilters.search.toLowerCase();
        const stateFilter = currentFilters.state;
        const integrationFilter = currentFilters.integration;
        const domainFilter = currentFilters.domain;
        const enabledFilter = currentFilters.enabled;

        console.log(`Entity Manager: Starting to filter ${this.entities.length} entities...`);
        
        this.filteredEntities = this.entities.filter(entity => {
            let matchesState = true;
            if (stateFilter) {
                switch (stateFilter) {
                    case 'normal': matchesState = entity.state !== 'unavailable' && entity.state !== 'unknown' && entity.state !== null && entity.state !== ''; break;
                    case 'unavailable': matchesState = entity.state === 'unavailable'; break;
                    case 'unknown': matchesState = entity.state === 'unknown'; break;
                    case 'not_provided': matchesState = entity.state === null || entity.state === ''; break;
                }
            }
            if (!matchesState) return false;
            if (enabledFilter && (enabledFilter === 'enabled' ? !entity.enabled : entity.enabled)) return false;
            if (integrationFilter && entity.integration_domain !== integrationFilter) return false;
            if (domainFilter && entity.domain !== domainFilter) return false;
            if (searchText && !entity.entity_id.includes(searchText) && !(entity.name || '').toLowerCase().includes(searchText)) return false;
            
            return true;
        });
        
        console.log(`Entity Manager: Filtered to ${this.filteredEntities.length} entities`);
        
        // Atualizar apenas o conteúdo principal, preservando filtros
        console.log('Entity Manager: Calling updateMainContent...');
        this.updateMainContent(currentFilters);
        console.log('Entity Manager: filterEntities completed');
    }

    updateMainContent(preserveFilters = null) {
        console.log('Entity Manager: updateMainContent() called');
        
        const enabledCount = this.entities.filter(e => e.enabled).length;
        const integrations = [...new Set(this.entities.map(e => e.integration_domain).filter(Boolean))].sort();
        const domains = [...new Set(this.entities.map(e => e.domain).filter(Boolean))].sort();
        
        console.log('Entity Manager: Stats calculated, looking for main-content element...');
        
        const mainContent = this.shadowRoot.getElementById('main-content');
        if (mainContent) {
            console.log('Entity Manager: Found main-content, rendering new content...');
            console.log('Entity Manager: isLoading =', this.isLoading, 'filteredEntities.length =', this.filteredEntities.length);
            
            mainContent.innerHTML = this.renderContent(enabledCount, integrations, domains);
            console.log('Entity Manager: Content updated in main-content');
            
            // Restaurar valores dos filtros se fornecidos
            if (preserveFilters) {
                console.log('Entity Manager: Restoring filter values...');
                setTimeout(() => this.restoreFilterValues(preserveFilters), 0);
            }
            
            // Re-anexar apenas os event listeners do conteúdo
            console.log('Entity Manager: Attaching event listeners...');
            this.attachContentEventListeners();
            console.log('Entity Manager: Event listeners attached');
        } else {
            console.error('Entity Manager: main-content element not found! Re-rendering entire card...');
            console.log('Entity Manager: Available elements in shadowRoot:', 
                Array.from(this.shadowRoot.querySelectorAll('*')).map(el => el.tagName + (el.id ? '#' + el.id : '')));
            
            // FALLBACK: Re-renderizar o card inteiro
            console.log('Entity Manager: Falling back to full render...');
            this.render();
        }
        
        console.log('Entity Manager: updateMainContent completed');
    }

    getCurrentFilterValues() {
        const root = this.shadowRoot;
        if (!root) {
            console.warn('Entity Manager: shadowRoot not available in getCurrentFilterValues, returning defaults');
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
            console.warn('Entity Manager: Error getting filter values:', error);
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
        if (!root) {
            console.warn('Entity Manager: shadowRoot not available in restoreFilterValues');
            return;
        }
        
        try {
            const searchInput = root.getElementById('searchFilter');
            if (searchInput) searchInput.value = filters.search;
            
            const stateSelect = root.getElementById('stateFilter');
            if (stateSelect) stateSelect.value = filters.state;
            
            const integrationSelect = root.getElementById('integrationFilter');
            if (integrationSelect) integrationSelect.value = filters.integration;
            
            const domainSelect = root.getElementById('domainFilter');
            if (domainSelect) domainSelect.value = filters.domain;
            
            const enabledSelect = root.getElementById('enabledFilter');
            if (enabledSelect) enabledSelect.value = filters.enabled;
            
            console.log('Entity Manager: Filter values restored successfully');
        } catch (error) {
            console.warn('Entity Manager: Error restoring filter values:', error);
        }
    }

    render() {
        const title = this._config?.title || "Gerenciador de Entidades";
        const version = "v19.1-LAYOUT-FIXED";

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
                
                .bulk-actions .spacer {
                    flex-grow: 1;
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
                
                @media (max-width: 768px) {
                    .filters {
                        grid-template-columns: 1fr;
                        gap: 8px;
                    }
                    
                    .search-group {
                        grid-column: 1;
                    }
                    
                    .bulk-actions {
                        flex-direction: column;
                        align-items: stretch;
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
        `;

        // Anexar event listeners após renderização
        this.attachEventListeners();
    }

    attachEventListeners() {
        const root = this.shadowRoot;
        
        // Botões do cabeçalho
        root.getElementById('exportBtn')?.addEventListener('click', () => this.exportEntities());
        root.getElementById('refreshBtn')?.addEventListener('click', () => this.loadEntities());
        
        this.attachContentEventListeners();
    }

    attachContentEventListeners() {
        const root = this.shadowRoot;
        
        // Filtros (exceto busca)
        root.querySelectorAll('select.filter-input').forEach(el => 
            el.addEventListener('change', () => this.filterEntities())
        );
        
        // Campo de busca - apenas detectar Enter, sem debounce
        const searchInput = root.getElementById('searchFilter');
        if (searchInput) {
            // Buscar ao pressionar Enter
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    console.log('Entity Manager: Search triggered by Enter key');
                    this.filterEntities();
                }
            });
            
            // Remover debounce - não buscar automaticamente
            // searchInput.addEventListener('input', ...) REMOVIDO
        }
        
        // Botão de busca
        const searchBtn = root.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                console.log('Entity Manager: Search triggered by button click');
                this.filterEntities();
            });
        }
        
        // Ações em massa
        root.getElementById('enableSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('enable'));
        root.getElementById('disableSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('disable'));
        root.getElementById('setRecorderBtn')?.addEventListener('click', () => this.handleBulkAction('set-recorder'));
        root.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('delete'));
        
        // Event listeners das entidades
        root.querySelectorAll('.entity-row').forEach(row => {
            const entityId = row.dataset.entityId;
            
            // Checkbox de seleção
            const checkbox = row.querySelector('[data-select]');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => 
                    this.toggleSelection(entityId, e.target.checked)
                );
            }
            
            // Toggle de habilitado/desabilitado
            const enableToggle = row.querySelector('[data-enable-toggle]');
            if (enableToggle) {
                enableToggle.addEventListener('change', (e) => 
                    this.toggleEntityEnabled(entityId, e.target.checked)
                );
            }
            
            // Input de dias do recorder
            const recorderInput = row.querySelector('[data-recorder]');
            if (recorderInput) {
                recorderInput.addEventListener('change', (e) => 
                    this.updateRecorderDays(entityId, e.target.value)
                );
            }
            
            // Botão de limpar histórico
            const purgeBtn = row.querySelector('[data-purge]');
            if (purgeBtn) {
                purgeBtn.addEventListener('click', () => this.handlePurgeEntity(entityId));
            }
            
            // Botão de deletar
            const deleteBtn = row.querySelector('[data-delete]');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.handleDeleteEntity(entityId));
            }
        });
    }

    loadMoreEntities() {
        console.log('Entity Manager: Loading more entities...');
        const currentCount = this.entities.length;
        const nextBatch = Math.min(currentCount + 500, this.allEntities.length);
        
        this.entities = this.allEntities.slice(0, nextBatch);
        
        if (nextBatch >= this.allEntities.length) {
            this.isLimitedView = false;
        }
        
        console.log(`Entity Manager: Now showing ${this.entities.length} of ${this.allEntities.length} entities`);
        this.filterEntities();
    }

    loadAllEntities() {
        console.log('Entity Manager: Loading ALL entities (this may be slow)...');
        if (confirm(`Tem certeza que deseja carregar todas as ${this.allEntities.length} entidades? Isso pode deixar a interface lenta.`)) {
            this.entities = this.allEntities;
            this.isLimitedView = false;
            console.log('Entity Manager: All entities loaded');
            this.filterEntities();
        }
    }

    renderMoreFilteredEntities() {
        console.log('Entity Manager: Rendering more filtered entities...');
        
        const container = this.shadowRoot.querySelector('.entities-container');
        if (!container) return;
        
        // Encontrar quantas entidades já estão renderizadas
        const currentRows = container.querySelectorAll('.entity-row').length;
        const nextBatch = Math.min(currentRows + 50, this.filteredEntities.length);
        
        console.log(`Entity Manager: Adding entities ${currentRows} to ${nextBatch}`);
        
        // Renderizar próximo lote
        let newHtml = '';
        for (let i = currentRows; i < nextBatch; i++) {
            newHtml += this.renderEntityRow(this.filteredEntities[i]);
        }
        
        // Remover botão de "carregar mais" existente
        const existingLoadMore = container.querySelector('.load-more-container');
        if (existingLoadMore) {
            existingLoadMore.remove();
        }
        
        // Adicionar novas entidades
        container.insertAdjacentHTML('beforeend', newHtml);
        
        // Adicionar novo botão se ainda há mais entidades
        if (nextBatch < this.filteredEntities.length) {
            const loadMoreHtml = `
                <div class="load-more-container">
                    <div style="margin-bottom: 8px; color: var(--secondary-text-color); font-size: 14px;">
                        Mostrando ${nextBatch} de ${this.filteredEntities.length} entidades filtradas
                    </div>
                    <button id="renderMoreBtn" class="btn-load-more">
                        📄 Carregar mais entidades (${this.filteredEntities.length - nextBatch} restantes)
                    </button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', loadMoreHtml);
            
            // Re-anexar listener do novo botão
            const newBtn = container.querySelector('#renderMoreBtn');
            if (newBtn) {
                newBtn.addEventListener('click', () => this.renderMoreFilteredEntities());
            }
        }
        
        // Anexar event listeners para as novas linhas
        const newRows = container.querySelectorAll('.entity-row:not([data-listeners-attached])');
        newRows.forEach(row => {
            row.setAttribute('data-listeners-attached', 'true');
            const entityId = row.dataset.entityId;
            
            // Anexar listeners
            const checkbox = row.querySelector('[data-select]');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => 
                    this.toggleSelection(entityId, e.target.checked)
                );
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
        
        console.log(`Entity Manager: Successfully added ${nextBatch - currentRows} more entities`);
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

    renderLimitationWarning() {
        return `
            <div class="limitation-warning">
                <div class="warning-content">
                    ⚠️ <strong>Dataset Grande Detectado:</strong> Exibindo ${this.entities.length} de ${this.allEntities.length} entidades para melhor performance.
                    <div class="warning-actions">
                        <button id="loadMoreBtn" class="btn-warning">📄 Carregar Mais 500</button>
                        <button id="loadAllBtn" class="btn-warning">🚀 Carregar Todas (pode ser lento)</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderEntitiesList() {
        console.log(`Entity Manager: Rendering entities list (${this.filteredEntities.length} filtered entities)...`);
        const startTime = performance.now();
        
        // Para datasets muito grandes, renderizar apenas um subconjunto inicialmente
        const maxToRender = 50; // Reduzido para 50 para melhor performance inicial
        const entitiesToRender = this.filteredEntities.slice(0, maxToRender);
        
        console.log(`Entity Manager: Rendering ${entitiesToRender.length} entities (max ${maxToRender})`);
        
        let html = '';
        
        // Renderizar entidades em lotes para evitar travamento
        for (let i = 0; i < entitiesToRender.length; i++) {
            html += this.renderEntityRow(entitiesToRender[i]);
        }
        
        // Adicionar botão para carregar mais se necessário
        if (this.filteredEntities.length > maxToRender) {
            html += `
                <div class="load-more-container">
                    <div style="margin-bottom: 8px; color: var(--secondary-text-color); font-size: 14px;">
                        Mostrando ${maxToRender} de ${this.filteredEntities.length} entidades filtradas
                    </div>
                    <button id="renderMoreBtn" class="btn-load-more">
                        📄 Carregar mais entidades (${this.filteredEntities.length - maxToRender} restantes)
                    </button>
                </div>
            `;
        }
        
        const renderTime = performance.now() - startTime;
        console.log(`Entity Manager: Entities list rendered in ${renderTime.toFixed(2)}ms`);
        
        return html;
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
    
    // Função de exportação
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
    
    // Funções de lógica
    toggleSelection(entityId, isSelected) {
        if (isSelected) {
            this.selectedEntities.add(entityId);
        } else {
            this.selectedEntities.delete(entityId);
        }
        
        const countEl = this.shadowRoot.querySelector('.selected-count');
        if (countEl) {
            countEl.textContent = `${this.selectedEntities.size} selecionada(s)`;
        }
    }

    async callService(service, data) {
        try {
            console.log(`Calling service entity_manager.${service} with data:`, data);
            await this._hass.callService('entity_manager', service, data);
            console.log(`Successfully called service: entity_manager.${service}`);
        } catch (err) {
            console.error(`Erro ao chamar o serviço entity_manager.${service}:`, err);
            
            // Melhor tratamento de erro para acesso remoto
            let errorMessage = `Erro ao executar ${service}: `;
            
            if (err.message.includes('not found')) {
                errorMessage += `Serviço não encontrado. Verifique se a integração Entity Manager está instalada e o Home Assistant foi reiniciado.`;
            } else if (err.message.includes('connection')) {
                errorMessage += `Problema de conexão. Verifique sua conexão com o Home Assistant.`;
            } else {
                errorMessage += err.message;
            }
            
            alert(errorMessage);
            throw err;
        }
    }

    async toggleEntityEnabled(entityId, isEnabled) {
        await this.callService('update_entity_state', { entity_id: entityId, enabled: isEnabled });
        const entity = this.entities.find(e => e.entity_id === entityId);
        if (entity) {
            entity.enabled = isEnabled;
        }
        
        // Atualizar visualmente a linha
        const row = this.shadowRoot.querySelector(`[data-entity-id="${entityId}"]`);
        if (row) {
            row.classList.toggle('disabled', !isEnabled);
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
        if (confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE a entidade ${entityId}?`)) {
            await this.callService('delete_entity', { entity_id: entityId });
            this.loadEntities();
        }
    }

    async handlePurgeEntity(entityId) {
        if (confirm(`Tem certeza que deseja limpar o histórico do recorder para ${entityId}?`)) {
            await this.callService('purge_recorder', { entity_ids: [entityId] });
            alert(`Comando para limpar o histórico de ${entityId} foi enviado.`);
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
                this.callService('bulk_update', { entity_ids, enabled: true }).then(() => this.loadEntities());
                break;
            case 'disable':
                this.callService('bulk_update', { entity_ids, enabled: false }).then(() => this.loadEntities());
                break;
            case 'delete':
                if (confirm(`Tem certeza que deseja EXCLUIR ${entity_ids.length} entidades permanentemente?`)) {
                    this.callService('bulk_delete', { entity_ids }).then(() => this.loadEntities());
                }
                break;
            case 'set-recorder':
                const days = this.shadowRoot.getElementById('bulkRecorderDays')?.value;
                const numDays = parseInt(days, 10);
                if (isNaN(numDays) || numDays < 0) {
                    alert("Por favor, insira um número válido de dias.");
                    return;
                }
                this.callService('bulk_update', { entity_ids, recorder_days: numDays }).then(() => this.loadEntities());
                break;
        }
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
                .error-message {
                    margin-bottom: 16px;
                }
                .diagnostic-buttons {
                    display: flex;
                    gap: 12px;
                    margin-top: 16px;
                }
                button {
                    background: var(--primary-color);
                    color: var(--text-primary-color);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                }
                button:hover { opacity: 0.9; }
                .diagnostic-info {
                    background: var(--secondary-background-color);
                    padding: 12px;
                    border-radius: 6px;
                    margin-top: 16px;
                    font-size: 12px;
                    color: var(--secondary-text-color);
                }
            </style>
            <ha-card>
                <div class="card-header">
                    <h3>Erro - Entity Manager</h3>
                    <span>v19.4-DEBUG</span>
                </div>
                <div class="error-content">
                    <div class="error-message">${message}</div>
                    
                    <div class="diagnostic-buttons">
                        <button onclick="this.parentElement.parentElement.parentElement.parentElement.host.tryReload()">
                            🔄 Tentar Novamente
                        </button>
                        <button onclick="this.parentElement.parentElement.parentElement.parentElement.host.runDiagnostic()">
                            🔍 Diagnóstico
                        </button>
                    </div>
                    
                    <div class="diagnostic-info">
                        <strong>Possíveis soluções:</strong><br>
                        1. Verifique se a integração Entity Manager está instalada em custom_components/<br>
                        2. Reinicie o Home Assistant completamente<br>
                        3. Verifique os logs do Home Assistant<br>
                        4. Certifique-se de que todos os arquivos estão no lugar correto<br>
                        5. Teste via Ferramentas do Desenvolvedor > Estados
                    </div>
                </div>
            </ha-card>
        `;
    }

    tryReload() {
        console.log('Entity Manager: Manual reload triggered');
        this.loadEntities();
    }

    async runDiagnostic() {
        console.log('Entity Manager: Running diagnostic...');
        
        let diagnosticInfo = "=== DIAGNÓSTICO ENTITY MANAGER ===\n\n";
        
        try {
            // Testar se HASS está disponível
            diagnosticInfo += `✅ HASS disponível: ${this._hass ? 'Sim' : 'Não'}\n`;
            
            if (this._hass) {
                // Testar URLs da API
                const baseUrl = this._hass.hassUrl();
                diagnosticInfo += `🌐 Base URL: ${baseUrl}\n`;
                
                // Testar status da integração
                try {
                    const statusResponse = await this._hass.callApi('GET', 'entity_manager/status');
                    diagnosticInfo += `✅ API Status: ${JSON.stringify(statusResponse, null, 2)}\n`;
                } catch (statusError) {
                    diagnosticInfo += `❌ API Status Error: ${statusError.message}\n`;
                }
                
                // Testar entidades
                try {
                    const entitiesResponse = await this._hass.callApi('GET', 'entity_manager/entities');
                    diagnosticInfo += `✅ Entities API: ${entitiesResponse.length} entidades retornadas\n`;
                } catch (entitiesError) {
                    diagnosticInfo += `❌ Entities API Error: ${entitiesError.message}\n`;
                }
                
                // Verificar se há entidades do entity_manager
                const states = this._hass.states;
                const entityManagerEntities = Object.keys(states).filter(key => key.startsWith('sensor.entity_manager'));
                diagnosticInfo += `📊 Sensores Entity Manager encontrados: ${entityManagerEntities.length}\n`;
                entityManagerEntities.forEach(entity => {
                    diagnosticInfo += `   - ${entity}\n`;
                });
                
                // Verificar serviços
                const services = this._hass.services;
                const entityManagerServices = services.entity_manager || {};
                diagnosticInfo += `🔧 Serviços Entity Manager: ${Object.keys(entityManagerServices).length}\n`;
                Object.keys(entityManagerServices).forEach(service => {
                    diagnosticInfo += `   - entity_manager.${service}\n`;
                });
            }
            
        } catch (error) {
            diagnosticInfo += `❌ Erro durante diagnóstico: ${error.message}\n`;
        }
        
        diagnosticInfo += `\n⏰ Timestamp: ${new Date().toLocaleString()}\n`;
        
        console.log(diagnosticInfo);
        alert("Diagnóstico executado! Verifique o console do navegador (F12) para detalhes completos.");
    }
}

// Verificar se o custom element já foi definido para evitar erros
if (!customElements.get('entity-manager-card')) {
    try {
        customElements.define('entity-manager-card', EntityManagerCard);
        console.log('Entity Manager Card: Successfully registered custom element');
    } catch (error) {
        console.error('Entity Manager Card: Failed to register custom element:', error);
    }
} else {
    console.warn('Entity Manager Card: Custom element already defined, skipping registration');
    
    // Força recriação do card se necessário
    try {
        // Remover instâncias existentes se houver
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