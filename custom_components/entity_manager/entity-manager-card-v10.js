class EntityManagerCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._listenersAttached = false;
    }

    setConfig(config) {
        // ... (função setConfig permanece a mesma)
        this.config = {
            title: config.title || 'Entity Manager',
            ...config
        };
        this.entities = [];
        this.selectedEntities = new Set();
        this.filteredEntities = [];
        this.isLoading = true;
        
        if (this.shadowRoot) {
            this.render();
            this.loadEntities();
        }
    }

    set hass(hass) {
        this._hass = hass;
    }

    connectedCallback() {
        if (this._listenersAttached) return;

        // A lógica de listeners permanece a mesma
        this.shadowRoot.addEventListener('click', (e) => {
            // ...
        });
        this.shadowRoot.addEventListener('change', (e) => {
            // ...
            if (e.target.matches('.filter-input')) {
                this.filterEntities();
            }
        });
        this.shadowRoot.addEventListener('input', (e) => {
            if (e.target.matches('#searchFilter')) {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => this.filterEntities(), 300);
            }
        });

        this._listenersAttached = true;
    }

    async loadEntities() {
        // ... (função loadEntities permanece a mesma)
        if (!this._hass) return;
        this.isLoading = true;
        this.render();

        try {
            const entities = await this._hass.callApi('GET', 'entity_manager/entities');
            this.entities = entities;
            this.filteredEntities = [...this.entities];
            this.isLoading = false;
            this.render();
        } catch (error) {
            this.isLoading = false;
            this.renderError(`Erro ao carregar entidades: ${error.message}`);
            console.error(error);
        }
    }

    render() {
        // Atualize a versão para refletir a nova funcionalidade
        const version = "v9.2-INTEGRATION-FILTER";

        this.shadowRoot.innerHTML = `
            <style>
                /* Cole seu CSS aqui, ele não precisa de alterações */
                :host { display: block; background: var(--card-background-color, white); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow, 0px 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12)); }
                .card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--primary-color); color: var(--text-primary-color); }
                h3 { margin: 0; }
                .filter-group input, .filter-group select, .filter-input { color: var(--primary-text-color); }
                /* ... resto do seu CSS ... */
            </style>
            
            <div class="card-header">
                <h3>${this.config.title}</h3>
                <div>${version}</div>
            </div>

            ${this.renderControls()}
            <div class="entities-container">
                ${this.isLoading 
                    ? `<div class="loading">Carregando...</div>`
                    : (this.filteredEntities.length === 0 ? `<div class="no-entities">Nenhuma entidade encontrada.</div>` : this.filteredEntities.map(e => this.renderEntityRow(e)).join(''))
                }
            </div>
        `;
    }
    
    renderControls() {
        const domains = [...new Set(this.entities.map(e => e.domain))].sort();
        // --- LÓGICA PARA OBTER A LISTA DE INTEGRAÇÕES ---
        const integrations = [...new Set(this.entities.map(e => e.integration_domain).filter(i => i))].sort();

        return `
            <div style="padding: 16px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center;">
                <input id="searchFilter" class="filter-input" placeholder="Buscar..." style="flex-grow: 1;">
                
                <select class="filter-input" id="stateTypeFilter">
                    <option value="">Estado (Todos)</option>
                    <option value="normal">Normal</option>
                    <option value="unavailable">Indisponível</option>
                    <option value="unknown">Desconhecido</option>
                    <option value="not_provided">Não Fornecido</option>
                </select>

                <select class="filter-input" id="integrationFilter">
                    <option value="">Integração (Todas)</option>
                    ${integrations.map(i => `<option value="${i}">${i}</option>`).join('')}
                </select>
                
                <select class="filter-input" id="domainFilter">
                    <option value="">Domínio (Todos)</option>
                    ${domains.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
                
                <select class="filter-input" id="enabledFilter">
                    <option value="">Status (Todos)</option>
                    <option value="enabled">Habilitados</option>
                    <option value="disabled">Desabilitados</option>
                </select>
                <button data-action="refresh" title="Recarregar">🔄</button>
            </div>
            `;
    }

    filterEntities() {
        const root = this.shadowRoot;
        const searchText = root.getElementById('searchFilter')?.value.toLowerCase() || '';
        const stateTypeFilter = root.getElementById('stateTypeFilter')?.value || '';
        const domainFilter = root.getElementById('domainFilter')?.value || '';
        const enabledFilter = root.getElementById('enabledFilter')?.value || '';
        // --- LER VALOR DO NOVO FILTRO ---
        const integrationFilter = root.getElementById('integrationFilter')?.value || '';

        this.filteredEntities = this.entities.filter(entity => {
            // Lógica do filtro de estado (permanece a mesma)
            const state = entity.state;
            let matchesStateType = true;
            // ... (switch case para stateTypeFilter)

            // --- ATUALIZAR CONDIÇÃO DE FILTRO ---
            return (
                (searchText === '' || entity.name.toLowerCase().includes(searchText) || entity.entity_id.toLowerCase().includes(searchText)) &&
                matchesStateType &&
                (integrationFilter === '' || entity.integration_domain === integrationFilter) && // <-- CONDIÇÃO ADICIONADA
                (domainFilter === '' || entity.domain === domainFilter) &&
                (enabledFilter === '' || (enabledFilter === 'enabled' && entity.enabled) || (enabledFilter === 'disabled' && !entity.enabled))
            );
        });
        
        // Re-renderiza apenas o container das entidades para manter a performance
        const container = this.shadowRoot.querySelector('.entities-container');
        if (container) {
            container.innerHTML = this.isLoading 
                ? `<div class="loading">Carregando...</div>`
                : (this.filteredEntities.length === 0 ? `<div class="no-entities">Nenhuma entidade encontrada para os filtros aplicados.</div>` : this.filteredEntities.map(e => this.renderEntityRow(e)).join(''));
        }
    }
    
    // Todas as outras funções (renderEntityRow, deleteEntity, etc.) permanecem as mesmas
    // ...
}

customElements.define('entity-manager-card', EntityManagerCard);