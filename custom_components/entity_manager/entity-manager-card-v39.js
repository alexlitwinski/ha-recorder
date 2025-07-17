class EntityManagerCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isLoading = true;
        this.entities = [];
        this.filteredEntities = [];
        this.selectedEntities = new Set();
        this.reportEntityIds = [];
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
        if (!this._hass) return;
        this.isLoading = true;
        this.render();
        try {
            const entities = await this._hass.callApi('GET', 'entity_manager/entities');
            this.entities = entities;
            this.isLoading = false;
            this.filterEntities();
        } catch (error) {
            console.error('Entity Manager: Error loading entities:', error);
            this.isLoading = false;
            this.renderError(`Erro ao carregar entidades: ${error.message}`);
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
        }
        
        this.clearInvisibleSelections();
        this.render(currentFilters);
    }

    render(preservedFilters = null) {
        const title = this._config?.title || "Gerenciador de Entidades";
        const version = "v23.0-FULL-RESTORE";
        const enabledCount = this.entities.filter(e => e.enabled).length;
        const integrations = [...new Set(this.entities.map(e => e.integration_domain).filter(Boolean))].sort();
        const domains = [...new Set(this.entities.map(e => e.domain).filter(Boolean))].sort();

        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; font-family: var(--paper-font-body1_-_font-family); }
                ha-card { display: flex; flex-direction: column; height: 100%; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow); }
                .card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--primary-color); color: var(--text-primary-color); border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0; }
                .card-header h3 { margin: 0; font-size: 1.2em; font-weight: 500; }
                .header-actions { display: flex; align-items: center; gap: 8px; }
                .stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--divider-color); font-size: 12px; text-align: center; border-bottom: 1px solid var(--divider-color); }
                .stat-item { background: var(--card-background-color); padding: 12px 8px; color: var(--primary-text-color); }
                .stat-value { display: block; font-size: 18px; font-weight: bold; color: var(--primary-color); }
                .stat-label { display: block; font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }
                .special-actions { display: flex; gap: 8px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-bottom: 1px solid var(--divider-color); align-items: center; justify-content: center; }
                .special-btn { background: rgba(255,255,255,0.9); color: #333; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.3s ease; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .special-btn:hover { background: white; transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
                .filters { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 12px; padding: 16px; background: var(--secondary-background-color); border-bottom: 1px solid var(--divider-color); }
                input, select { width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); box-sizing: border-box; font-size: 14px; }
                .bulk-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; align-items: center; background: var(--secondary-background-color); border-bottom: 1px solid var(--divider-color); }
                .entities-container { flex: 1; overflow-y: auto; max-height: 60vh; background: var(--card-background-color); }
                .entity-row { display: grid; grid-template-columns: auto 1fr auto auto auto auto auto; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--divider-color); }
                .entity-row.disabled { opacity: 0.6; }
                .entity-info .name { font-weight: 500; }
                .entity-info .id { font-size: 0.85em; color: var(--secondary-text-color); }
                .entity-state { font-size: 0.9em; text-align: center; padding: 4px 8px; border-radius: 12px; background: var(--state-icon-color, var(--primary-color)); color: var(--text-primary-color); min-width: 60px; font-weight: 500; }
                .entity-state.unavailable { background: var(--warning-color, #ff9800); }
                .entity-state.unknown { background: var(--error-color, #f44336); }
                .toggle-switch { position: relative; display: inline-block; width: 50px; height: 24px; }
                .toggle-switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 24px; }
                .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                input:checked + .slider { background-color: var(--primary-color); }
                input:checked + .slider:before { transform: translateX(26px); }
                .message { text-align: center; padding: 40px 24px; color: var(--secondary-text-color); font-size: 16px; }
                button { background-color: var(--primary-color); color: var(--text-primary-color); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
                button:hover { opacity: 0.9; }
                button.danger { background-color: var(--error-color, #f44336); }
                .icon-button { background-color: transparent; color: var(--primary-text-color); border: none; cursor: pointer; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
                .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4); }
                .modal-content { background-color: var(--card-background-color); margin: 15% auto; padding: 20px; border-radius: 8px; width: 80%; max-width: 500px; box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
                .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                .close { color: var(--secondary-text-color); float: right; font-size: 28px; font-weight: bold; cursor: pointer; }
            </style>
            <ha-card>
                <div class="card-header">
                    <h3>${title}</h3>
                    <div class="header-actions">
                        <span style="font-size: 12px; opacity: 0.8;">${version}</span>
                        <button class="icon-button" id="refreshBtn" title="Recarregar">🔄</button>
                    </div>
                </div>
                ${this.renderContent(enabledCount, integrations, domains)}
            </ha-card>
            <div id="progressModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalTitle">Processando...</h3>
                        <span class="close" id="modalClose">&times;</span>
                    </div>
                    <div id="modalBody"></div>
                </div>
            </div>
        `;

        this.attachEventListeners();
        if (preservedFilters) {
            this.restoreFilterValues(preservedFilters);
        }
        this.updateSelectAllCheckbox();
    }

    renderContent(enabledCount, integrations, domains) {
        if (this.isLoading) return `<div class="message">Carregando entidades...</div>`;
        return `
            <div class="stats-bar">
                <div class="stat-item"><span class="stat-value">${this.entities.length}</span><span class="stat-label">TOTAL</span></div>
                <div class="stat-item"><span class="stat-value">${enabledCount}</span><span class="stat-label">HABILITADAS</span></div>
                <div class="stat-item"><span class="stat-value">${this.entities.length - enabledCount}</span><span class="stat-label">DESABILITADAS</span></div>
                <div class="stat-item"><span class="stat-value">${this.filteredEntities.length}</span><span class="stat-label">EXIBIDAS</span></div>
            </div>
            <div class="special-actions">
                <button id="intelligentPurgeBtn" class="special-btn">🧹 Limpeza Inteligente</button>
                <button id="generateReportBtn" class="special-btn">📊 Gerar Relatório</button>
            </div>
            <div class="filters">
                <input id="searchFilter" placeholder="Buscar entidades..." class="filter-input">
                <select id="stateFilter" class="filter-input"><option value="">Estado (Todos)</option><option value="normal">Normal</option><option value="unavailable">Indisponível</option><option value="unknown">Desconhecido</option><option value="not_provided">Não Fornecido</option></select>
                <select id="integrationFilter" class="filter-input"><option value="">Integração (Todas)</option>${integrations.map(i => `<option value="${i}">${i}</option>`).join('')}</select>
                <select id="domainFilter" class="filter-input"><option value="">Domínio (Todos)</option>${domains.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
                <select id="enabledFilter" class="filter-input"><option value="">Status (Todos)</option><option value="enabled">Habilitados</option><option value="disabled">Desabilitados</option></select>
            </div>
            <div class="bulk-actions">
                <label><input type="checkbox" id="selectAllCheckbox"> Selecionar Todos</label>
                <button id="enableSelectedBtn">Habilitar</button>
                <button id="disableSelectedBtn">Desabilitar</button>
                <input id="bulkRecorderDays" type="number" min="0" placeholder="Dias" style="width: 80px;">
                <button id="setRecorderBtn">Definir Dias</button>
                <button id="deleteSelectedBtn" class="danger">Excluir</button>
                <span class="selected-count">${this.selectedEntities.size} selecionada(s)</span>
            </div>
            <div class="entities-container">
                ${this.filteredEntities.length === 0 ? `<div class="message">Nenhuma entidade encontrada.</div>` : this.filteredEntities.map(entity => this.renderEntityRow(entity)).join('')}
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
                    <div class="name" title="${entity.name || entity.entity_id}">${entity.name || entity.entity_id}</div>
                    <div class="id" title="${entity.entity_id}">${entity.entity_id}</div>
                </div>
                <div class="entity-state ${stateClass}" title="Estado: ${entity.state}">${entity.state}</div>
                <label class="toggle-switch" title="${isEnabled ? 'Habilitado' : 'Desabilitado'}">
                    <input type="checkbox" data-enable-toggle ${isEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <input type="number" data-recorder value="${entity.recorder_days || 10}" min="0" max="365" title="Dias no Recorder">
                <button class="icon-button" data-purge title="Limpar Histórico">🗑️</button>
                <button class="icon-button danger" data-delete title="Excluir Entidade">❌</button>
            </div>
        `;
    }

    attachEventListeners() {
        const root = this.shadowRoot;
        root.getElementById('refreshBtn')?.addEventListener('click', () => this.loadEntities());
        root.getElementById('generateReportBtn')?.addEventListener('click', () => this.handleGenerateReport());
        root.getElementById('intelligentPurgeBtn')?.addEventListener('click', () => alert("Função de limpeza inteligente ainda não implementada."));
        root.getElementById('modalClose')?.addEventListener('click', () => this.hideModal());
        
        root.querySelectorAll('.filter-input').forEach(el => el.addEventListener('change', () => this.filterEntities()));
        root.getElementById('searchFilter')?.addEventListener('keypress', (e) => e.key === 'Enter' && this.filterEntities());

        root.getElementById('selectAllCheckbox')?.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        root.getElementById('enableSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('enable'));
        root.getElementById('disableSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('disable'));
        root.getElementById('setRecorderBtn')?.addEventListener('click', () => this.handleBulkAction('set-recorder'));
        root.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.handleBulkAction('delete'));

        root.querySelectorAll('.entity-row').forEach(row => {
            const entityId = row.dataset.entityId;
            row.querySelector('[data-select]')?.addEventListener('change', (e) => this.toggleSelection(entityId, e.target.checked));
            row.querySelector('[data-enable-toggle]')?.addEventListener('change', (e) => this.toggleEntityEnabled(entityId, e.target.checked));
            row.querySelector('[data-recorder]')?.addEventListener('change', (e) => this.updateRecorderDays(entityId, e.target.value));
            row.querySelector('[data-purge]')?.addEventListener('click', () => this.handlePurgeEntity(entityId));
            row.querySelector('[data-delete]')?.addEventListener('click', () => this.handleDeleteEntity(entityId));
        });
    }

    async handleGenerateReport() {
        this.showModal('Gerando Relatório', 'Analisando banco de dados...');
        try {
            const response = await this._hass.callApi('POST', 'entity_manager/recorder_report', { limit: 100 });
            if (response.status === 'error') throw new Error(response.error);
            
            this.reportEntityIds = response.report_data.map(e => e.entity_id);

            const modalBody = `
                <p>Relatório das Top ${response.entities_analyzed} entidades gerado com sucesso.</p>
                <p>Total de Registros: ${response.total_records.toLocaleString()}</p>
                <button id="downloadReportBtn" class="special-btn">📥 Download</button>
                <button id="filterReportEntitiesBtn" class="special-btn">🔍 Mostrar na Lista</button>
            `;
            this.showResultModal('Relatório Gerado', modalBody);

            this.shadowRoot.getElementById('downloadReportBtn')?.addEventListener('click', () => window.open(response.download_url, '_blank'));
            this.shadowRoot.getElementById('filterReportEntitiesBtn')?.addEventListener('click', () => this.filterByReportEntities());

        } catch (error) {
            this.showResultModal('Erro no Relatório', `Ocorreu um erro: ${error.message}`);
        }
    }
    
    filterByReportEntities() {
        this.hideModal();
        this.filterEntities({ useReportFilter: true });
        const root = this.shadowRoot;
        root.getElementById('searchFilter').value = '';
        root.getElementById('stateFilter').value = '';
        root.getElementById('integrationFilter').value = '';
        root.getElementById('domainFilter').value = '';
        root.getElementById('enabledFilter').value = '';
    }
    
    showModal(title, content) {
        const modal = this.shadowRoot.getElementById('progressModal');
        modal.style.display = 'block';
        this.shadowRoot.getElementById('modalTitle').textContent = title;
        this.shadowRoot.getElementById('modalBody').innerHTML = content;
    }

    showResultModal(title, body) { this.showModal(title, body); }
    hideModal() { this.shadowRoot.getElementById('progressModal').style.display = 'none'; }

    getCurrentFilterValues() {
        const root = this.shadowRoot;
        return {
            search: root.getElementById('searchFilter')?.value || '',
            state: root.getElementById('stateFilter')?.value || '',
            integration: root.getElementById('integrationFilter')?.value || '',
            domain: root.getElementById('domainFilter')?.value || '',
            enabled: root.getElementById('enabledFilter')?.value || ''
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
        const visibleEntityIds = new Set(this.filteredEntities.map(e => e.entity_id));
        this.selectedEntities.forEach(id => {
            if (!visibleEntityIds.has(id)) this.selectedEntities.delete(id);
        });
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
        this.loadEntities();
    }

    async handlePurgeEntity(entityId) {
        if (!confirm(`Tem certeza que deseja limpar o histórico do recorder para ${entityId}?`)) return;
        await this.callService('purge_recorder', { entity_ids: [entityId] });
        alert(`Comando para limpar o histórico de ${entityId} foi enviado.`);
    }

    handleBulkAction(action) {
        const entity_ids = Array.from(this.selectedEntities);
        if (entity_ids.length === 0) {
            alert("Nenhuma entidade selecionada.");
            return;
        }
        const reload = () => {
            this.selectedEntities.clear();
            this.loadEntities();
        };
        switch(action) {
            case 'enable': this.callService('bulk_update', { entity_ids, enabled: true }).then(reload); break;
            case 'disable': this.callService('bulk_update', { entity_ids, enabled: false }).then(reload); break;
            case 'delete':
                if (confirm(`Tem certeza que deseja EXCLUIR ${entity_ids.length} entidades?`)) {
                    this.callService('bulk_delete', { entity_ids }).then(reload);
                }
                break;
            case 'set-recorder':
                const days = this.shadowRoot.getElementById('bulkRecorderDays')?.value;
                const numDays = parseInt(days, 10);
                if (isNaN(numDays) || numDays < 0) {
                    alert("Por favor, insira um número válido de dias.");
                    return;
                }
                this.callService('bulk_update', { entity_ids, recorder_days: numDays }).then(reload);
                break;
        }
    }

    renderError(message) { this.shadowRoot.innerHTML = `<ha-card><div class="card-header"><h3>Erro</h3></div><div class="message">${message}</div></ha-card>`; }
}

if (!customElements.get('entity-manager-card')) {
    customElements.define('entity-manager-card', EntityManagerCard);
}
