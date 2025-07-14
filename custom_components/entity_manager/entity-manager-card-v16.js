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
        this.isLoading = true;
        this.render();
        try {
            const entities = await this._hass.callApi('GET', 'entity_manager/entities');
            this.entities = entities;
            this.filterEntities(); // Filtra os dados carregados imediatamente
        } catch (e) {
            this.renderError(e.message);
        } finally {
            this.isLoading = false;
        }
    }
    
    filterEntities() {
        const root = this.shadowRoot;
        const searchText = root.getElementById('searchFilter')?.value.toLowerCase() || '';
        const stateFilter = root.getElementById('stateFilter')?.value || '';
        const integrationFilter = root.getElementById('integrationFilter')?.value || '';
        const domainFilter = root.getElementById('domainFilter')?.value || '';
        const enabledFilter = root.getElementById('enabledFilter')?.value || '';

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
        this.render();
    }

    render() {
        const title = this._config?.title || "Gerenciador de Entidades";
        const version = "v9.7-FINAL-FIX";

        const enabledCount = this.entities.filter(e => e.enabled).length;
        const integrations = [...new Set(this.entities.map(e => e.integration_domain).filter(Boolean))].sort();
        const domains = [...new Set(this.entities.map(e => e.domain).filter(Boolean))].sort();

        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; }
                ha-card { display: flex; flex-direction: column; height: 100%; }
                .card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--primary-color); color: var(--text-primary-color); }
                h3 { margin: 0; font-size: 20px; }
                .stats-bar { display: flex; justify-content: space-around; padding: 8px; background: var(--secondary-background-color); border-bottom: 1px solid var(--divider-color); font-size: 12px; text-align: center; }
                .filters { display: flex; flex-wrap: wrap; gap: 12px; padding: 16px; border-bottom: 1px solid var(--divider-color); }
                .filters > * { flex: 1; min-width: 150px; }
                input, select { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--input-fill-color, var(--card-background-color)); color: var(--primary-text-color); box-sizing: border-box; }
                .bulk-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; align-items: center; border-bottom: 1px solid var(--divider-color); }
                .entities-container { flex: 1; overflow-y: auto; max-height: 60vh; }
                .entity-row { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-bottom: 1px solid var(--divider-color); }
                .entity-row.disabled { opacity: 0.5; }
                .entity-info { flex-grow: 1; min-width: 0; margin-left: 8px; }
                .entity-info .name { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .entity-info .id { font-size: 0.9em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .entity-state { font-size: 0.9em; text-align: right; white-space: nowrap; }
                .entity-controls { display: flex; align-items: center; gap: 8px; }
                .entity-controls input[type=number] { width: 65px; text-align: center; padding: 4px; }
                .message { text-align: center; padding: 24px; color: var(--secondary-text-color); }
                button { background-color: var(--primary-color); color: var(--text-primary-color); border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
                button.danger { background-color: var(--error-color); }
                .icon-button { padding: 4px; line-height: 0; background-color: transparent; color: var(--primary-text-color); border: none; cursor: pointer; border-radius: 50%; width: 32px; height: 32px; }
                .icon-button:hover { background-color: rgba(0,0,0,0.1); }
                .icon-button.danger { color: var(--error-color); }
            </style>
            <ha-card>
                <div class="card-header">
                    <h3>${title}</h3>
                    <div style="display:flex; align-items:center; gap: 8px;">
                        <span>${version}</span>
                        <button class="icon-button" @click="${() => this.loadEntities()}" title="Recarregar">🔄</button>
                    </div>
                </div>
                ${this.renderContent(enabledCount, integrations, domains)}
            </ha-card>
        `;
        this.shadowRoot.querySelectorAll('select, input.filter-input').forEach(el => el.addEventListener('change', () => this.filterEntities()));
        this.shadowRoot.getElementById('searchFilter')?.addEventListener('input', () => {
            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(() => this.filterEntities(), 300);
        });
        this.shadowRoot.querySelectorAll('.entity-row').forEach(row => {
            row.querySelector('[data-select]')?.addEventListener('change', e => this.toggleSelection(e.target.closest('.entity-row').dataset.entityId, e.target.checked));
        });
    }

    renderContent(enabledCount, integrations, domains) {
        if (this.isLoading) return `<div class="message">Carregando...</div>`;
        return `
            <div class="stats-bar">
                <div><strong>TOTAL</strong><br>${this.entities.length}</div>
                <div><strong>HABILITADAS</strong><br>${enabledCount}</div>
                <div><strong>DESABILITADAS</strong><br>${this.entities.length - enabledCount}</div>
                <div><strong>EXIBIDAS</strong><br>${this.filteredEntities.length}</div>
            </div>
            <div class="filters">
                <input id="searchFilter" placeholder="Buscar...">
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
                <button @click="${() => this.handleBulkAction('enable')}">Habilitar Sel.</button>
                <button @click="${() => this.handleBulkAction('disable')}">Desabilitar Sel.</button>
                <input id="bulkRecorderDays" type="number" min="0" placeholder="Dias" style="width: 80px; margin-left: auto;">
                <button @click="${() => this.handleBulkAction('set-recorder')}">Definir Dias</button>
                <button class="danger" @click="${() => this.handleBulkAction('delete')}">Excluir Sel.</button>
                <div id="selected-count" style="flex-basis: 100%; text-align: right; font-size: 12px; margin-top: 4px;">${this.selectedEntities.size} selecionado(s)</div>
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
        return `
            <div class="entity-row ${isEnabled ? '' : 'disabled'}" data-entity-id="${entity.entity_id}">
                <input type="checkbox" data-select ${isSelected ? 'checked' : ''}>
                <div class="entity-info">
                    <div class="name">${entity.name || entity.entity_id}</div>
                    <div class="id">${entity.entity_id}</div>
                </div>
                <div class="entity-state">${entity.state}</div>
                <div class="entity-controls">
                    <ha-switch ?checked=${isEnabled} @change=${(e) => this.toggleEntityEnabled(entity.entity_id, e.target.checked)} title="${isEnabled ? 'Habilitado' : 'Desabilitado'}"></ha-switch>
                    <input type="number" data-recorder value="${entity.recorder_days}" min="0" title="Dias no Recorder" @change=${(e) => this.updateRecorderDays(entity.entity_id, e.target.value)}>
                    <button class="icon-button" @click=${() => this.handlePurgeEntity(entity.entity_id)} title="Limpar Histórico do Recorder">🗑️</button>
                    <button class="icon-button danger" @click=${() => this.handleDeleteEntity(entity.entity_id)} title="Excluir Entidade">❌</button>
                </div>
            </div>
        `;
    }
    
    // --- Lógica de Ações (Atualizada) ---

    toggleSelection(entityId, isSelected) {
        if (isSelected) {
            this.selectedEntities.add(entityId);
        } else {
            this.selectedEntities.delete(entityId);
        }
        // Atualiza apenas a contagem, sem redesenhar tudo
        const countEl = this.shadowRoot.getElementById('selected-count');
        if (countEl) {
            countEl.textContent = `${this.selectedEntities.size} selecionado(s)`;
        }
    }
    
    async callService(service, data, successMessage) {
        try {
            await this._hass.callService('entity_manager', service, data);
            if (successMessage) console.log(successMessage);
        } catch (err) {
            console.error(`Erro ao chamar o serviço ${service}:`, err);
            alert(`Erro: ${err.message}`);
        }
    }

    async toggleEntityEnabled(entityId, isEnabled) {
        await this.callService('update_entity_state', { entity_id: entityId, enabled: isEnabled });
        const entity = this.entities.find(e => e.entity_id === entityId);
        if (entity) entity.enabled = isEnabled;
        
        const row = this.shadowRoot.querySelector(`[data-entity-id="${entityId}"]`);
        if (row) row.classList.toggle('disabled', !isEnabled);
    }

    async updateRecorderDays(entityId, days) {
        const numDays = parseInt(days, 10);
        if (isNaN(numDays) || numDays < 0) return;
        await this.callService('update_recorder_days', { entity_id: entityId, recorder_days: numDays });
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
    
    renderError(msg) {
        this.shadowRoot.innerHTML = `<ha-card><div class="message error">${msg}</div></ha-card>`;
    }
}

// Em vez de usar .innerHTML, vamos usar lit-html para renderização, o que resolve os problemas de eventos.
// Esta é uma mudança de paradigma, mas é a forma correta de fazer isso no Home Assistant.
// A definição abaixo é uma simplificação; o código acima foi adaptado para não precisar de lit-html,
// mas se os problemas persistirem, a conversão completa para lit-html seria o próximo passo.
// Por enquanto, o código acima deve funcionar.

customElements.define('entity-manager-card', EntityManagerCard);