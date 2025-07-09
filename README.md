# ha-recorder - Home Assistant Recorder Manager

Advanced Home Assistant integration for managing entities with recorder control and enhanced interface.

Integração personalizada para Home Assistant que fornece uma interface avançada para gerenciar entidades, com controle de habilitação/desabilitação e configuração do recorder por entidade.

## Funcionalidades

- **Interface Grid**: Lista todas as entidades em um grid organizado
- **Filtros Avançados**: Filtre por nome, ID, estado, domínio e status da entidade
- **Controle Individual**: Habilite/desabilite entidades individualmente
- **Configuração do Recorder**: Defina quantos dias cada entidade deve manter histórico
- **Operações em Lote**: Selecione múltiplas entidades para operações em massa
- **Purge Inteligente**: Execute limpeza do recorder respeitando as configurações individuais
- **Persistência**: Todas as configurações são salvas em arquivo JSON

## Instalação

1. Copie todos os arquivos para a pasta `custom_components/entity_manager/` no seu Home Assistant
2. Reinicie o Home Assistant
3. Vá em **Configurações > Dispositivos e Serviços > Adicionar Integração**
4. Procure por "Entity Manager" e configure

## Estrutura de Arquivos

```
custom_components/entity_manager/
├── __init__.py          # Arquivo principal da integração
├── manifest.json        # Manifesto da integração
├── const.py            # Constantes e configurações
├── config_flow.py      # Fluxo de configuração
├── services.yaml       # Definição dos serviços
├── sensor.py           # Sensor de estatísticas
├── api.py              # APIs para interface web
├── panel.html          # Interface web principal
└── README.md           # Esta documentação
```

## Interface Web

Acesse a interface através de: `http://[seu-ha]/entity_manager`

### Funcionalidades da Interface:

1. **Filtros**:
   - Busca por nome ou ID da entidade
   - Filtro por estado (ligado, desligado, indisponível)
   - Filtro por domínio
   - Filtro por status (habilitado/desabilitado)

2. **Operações em Lote**:
   - Seleção múltipla de entidades
   - Habilitar/desabilitar em massa
   - Definir dias do recorder em massa
   - Limpar histórico em massa
   - Selecionar todos/limpar seleção

3. **Controles Individuais**:
   - Toggle para habilitar/desabilitar entidade
   - Campo numérico para definir dias do recorder
   - Botão para limpar histórico individual

## Serviços Disponíveis

### `entity_manager.update_entity_state`
Habilita ou desabilita uma entidade específica.

**Parâmetros:**
- `entity_id`: ID da entidade
- `enabled`: true/false

### `entity_manager.update_recorder_days`
Define quantos dias o histórico da entidade deve ser mantido.

**Parâmetros:**
- `entity_id`: ID da entidade
- `recorder_days`: Número de dias (0 = não gravar)

### `entity_manager.bulk_update`
Atualiza múltiplas entidades de uma vez.

**Parâmetros:**
- `entity_ids`: Lista de IDs das entidades
- `enabled`: true/false (opcional)
- `recorder_days`: Número de dias (opcional)

### `entity_manager.purge_recorder`
Remove dados antigos do recorder baseado nas configurações.

**Parâmetros:**
- `entity_ids`: Lista de entidades (opcional, vazio = todas)
- `force_purge`: Força limpeza mesmo para entidades com recorder_days=0

### `entity_manager.reload_config`
Recarrega a configuração do arquivo.

## Configuração

As configurações são salvas automaticamente em:
`custom_components/entity_manager/entity_manager_config.json`

### Estrutura do Arquivo de Configuração:

```json
{
  "sensor.exemplo": {
    "enabled": true,
    "recorder_days": 30
  },
  "switch.outro_exemplo": {
    "enabled": false,
    "recorder_days": 0
  }
}
```

## Automações

Você pode usar os serviços em automações:

```yaml
# Exemplo: Desabilitar sensores não utilizados
action:
  - service: entity_manager.bulk_update
    data:
      entity_ids:
        - sensor.sensor1
        - sensor.sensor2
      enabled: false
      recorder_days: 0
```

## Sensor de Estatísticas

A integração cria um sensor `sensor.entity_manager_stats` com informações sobre:
- Total de entidades
- Entidades gerenciadas
- Entidades habilitadas/desabilitadas
- Contagem por domínio
- Configurações do recorder

## Troubleshooting

### Logs
Verifique os logs em **Configurações > Sistema > Logs** e procure por "entity_manager".

### Recarregar Configuração
Use o serviço `entity_manager.reload_config` se houver problemas com o arquivo de configuração.

### Permissões
Certifique-se que o Home Assistant tem permissão de escrita na pasta `custom_components/entity_manager/`.

## Licença

Este projeto é fornecido "como está" para uso pessoal e educacional.
