# ZapHub CRM — um número de WhatsApp, vários atendentes

## O que o sistema faz

- **1 número de WhatsApp conectado uma única vez** (por QR Code, como o WhatsApp Web). Todos os atendentes usam essa mesma conexão.
- **1 administrador + até 5 atendentes** (limite configurável em `MAX_AGENTS`).
- **Administrador vê todas as conversas**, tem um Quadro (kanban por atendente) e pode passar qualquer conversa para qualquer pessoa ou para a *Fila de entrada*.
- **Atendente vê somente as conversas atribuídas a ele.**
- **Passar a conversa = arrastar.** Na lista, arraste a conversa até o colega que aparece na barra inferior (ou use o botão *Passar conversa*). Depois de passada, ela **some para quem passou** (tela e tempo real) e aparece para o colega.
- **Nada se perde:** mensagens, fotos, áudios, documentos, notas internas e o histórico de transferências pertencem à *conversa*, não ao usuário. Transferir só troca o responsável. O banco ainda tem *triggers* que **proíbem apagar** mensagens, mídias, conversas e transferências.
- **Banco de dados:** um único arquivo SQLite (`data/crm.db`) guarda tudo, inclusive os arquivos de mídia. Backup completo em um clique (Equipe → *Baixar backup*) ou copiando o arquivo.

## Como rodar (Windows)

1. Instale o **Node.js 22.13 ou superior** (https://nodejs.org) e o **Git** (a biblioteca do WhatsApp baixa uma dependência pelo Git).
2. Dê dois cliques em **`iniciar-demo.bat`** para experimentar sem WhatsApp real (dados de exemplo, respostas simuladas).
   - admin: `admin@crm.local` / `admin123`
   - atendentes: `ana@crm.local`, `bruno@crm.local`, `carla@crm.local`, `diego@crm.local`, `elisa@crm.local` / `demo123`
3. Para uso real, dê dois cliques em **`iniciar.bat`**. No primeiro acesso, crie o nome, e-mail e senha do administrador na tela inicial do CRM. O cadastro é gravado no banco SQLite e a sessão é iniciada automaticamente. Depois, abra **WhatsApp** no menu e escaneie o QR Code (WhatsApp do celular → Aparelhos conectados → Conectar um aparelho).
4. Em **Equipe**, use **Adicionar acesso** para criar uma conta para cada e-mail autorizado. Defina nome e senha; a pessoa acessa pelo endereço “Na rede local” mostrado no terminal (ex.: `http://192.168.0.10:3000`). Contas desativadas deixam de poder entrar.

Pelo terminal: `npm install` e depois `npm start` (ou `npm run demo`).

## Publicar no Render

O GitHub armazena o código, mas o GitHub Pages não executa a API, o Socket.IO nem a conexão contínua com o WhatsApp. Para uso real, publique o serviço Node.js no Render:

1. No Render, crie um **Blueprint** e conecte este repositório. O arquivo `render.yaml` configura o serviço, a verificação de saúde e um disco persistente em `/var/data`.
2. Informe `ADMIN_EMAIL` e `ADMIN_PASSWORD` quando o Render solicitar as variáveis secretas. Use uma senha forte e exclusiva. Elas criam o administrador no primeiro início; mudar as variáveis depois não altera uma conta já gravada no banco.
3. Faça o deploy e abra a URL `.onrender.com` indicada pelo Render. A interface e a API são servidas juntas; não publique apenas a pasta `public/` no GitHub Pages.
4. Entre com o administrador, crie os acessos da equipe e conecte o WhatsApp pelo QR Code. Faça backups periódicos em **Equipe → Baixar backup**.

O disco persistente é necessário para preservar o banco, as conversas e a sessão do WhatsApp entre deploys e reinicializações. O plano configurado no Blueprint é `starter`, pois o serviço precisa de disco persistente; consulte os preços atuais do Render. Mantenha o serviço e o disco no mesmo Blueprint e não remova o disco, pois isso apaga os dados armazenados nele.

## Variáveis opcionais

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | 3000 | porta |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | opcional; configure ambos para provisionar o administrador pelo ambiente em vez da tela inicial |
| `MAX_AGENTS` | 5 | máximo de atendentes ativos |
| `DATA_DIR` | `./data` | onde ficam o banco e a sessão do WhatsApp |
| `COOKIE_SECURE` | — | `1` quando atrás de HTTPS (já definido no Render) |

## Avisos importantes

- A conexão usa a biblioteca **Baileys** (WhatsApp Web não oficial). Ela funciona bem para equipes pequenas, mas **não é a API oficial da Meta**: existe risco de o número ser restringido se for usado para spam/disparo em massa. Use para atendimento de clientes que escrevem para você. Para operação crítica, considere migrar para a WhatsApp Cloud API.
- Só conversas individuais são tratadas (grupos e status são ignorados).
- Na internet, publique atrás de HTTPS (o Render fornece HTTPS) — na rede local HTTP simples é suficiente.
- Guarde a pasta `data/` com cuidado: ela contém todas as conversas e a sessão do WhatsApp.

## Estrutura

```
src/server.js     API REST + arquivos estáticos
src/realtime.js   Socket.io (quem recebe o quê, por dono atual da conversa)
src/services.js   regras de negócio (mensagens, transferência, visibilidade)
src/whatsapp.js   Baileys (real) e modo demonstração
src/db.js         esquema SQLite + triggers anti-exclusão
public/           interface (HTML/CSS/JS puro, sem build)
```
