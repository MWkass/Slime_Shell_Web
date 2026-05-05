# Slime Shell // Web

<div>
  <img src="https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB" alt="React" />
  <img src="https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="TailwindCSS" />
</div>
<br>

Slime Shell // Web (V3.0) é a evolução definitiva do ecossistema Slime Shell. Agora com uma arquitetura separada em Backend Assíncrono (FastAPI) e Frontend Reativo (React), o sistema atua como um orquestrador definitivo para busca, extração e reprodução de animes. Ele utiliza técnicas avançadas de bypass de segurança (Cloudflare) e injeta conteúdo diretamente em um reprodutor de alto desempenho (mpv) com suporte a upscaling de hardware via Vulkan e Anime4K.

> **Status do Projeto:** Estável (V3.0)  
> **Tema Visual:** <span style="color: #00FFFF;">Cyan Neon / Cyberpunk TUI</span>  
> **Arquitetura:** Frontend (React/Vite) + Backend (FastAPI/Python) + Engine MPV

---

## 📸 Screenshot (Página Inicial)

![Menu](https://github.com/MWkass/Slime_Shell_Web/blob/main/pagina_inicial.png)

---

## 🛠️ Funcionalidades de Elite

* **<span style="color: #00FFFF;">Motor de Bypass Híbrido:</span>** Integração com `DrissionPage` e `Cloudscraper` controlando um navegador Brave fantasma para resolver desafios do Cloudflare dinamicamente.
* **<span style="color: #00FFFF;">Player Engine de Alta Performance (MPV):</span>** Reprodução de altíssima performance forçando a `API Vulkan` e upscaling em tempo real `Anime4K`.
* **<span style="color: #00FFFF;">Smart Persistence & "Geladeira":</span>** Salva seu progresso no milissegundo exato, gera capas de episódios automaticamente via `FFmpeg` e alerta sobre animes pausados.
* **<span style="color: #00FFFF;">Metadados Aprimorados (AniList/Kitsu):</span>** Integração com AniList e Kitsu para extrair sinopses (com tradução automática) e posteres em alta definição.
* **<span style="color: #00FFFF;">UI/UX Reativa e Imersiva:</span>** Frontend construído em React com máscaras de rolagem, efeitos 3D, blur dinâmico e feedback de servidor em tempo real.

---

## 🏗️ Arquitetura do Sistema
O projeto adota uma abordagem Decoupled (Desacoplada):

* Frontend (React + Vite + TailwindCSS): Roda na porta `:5173` Gerencia o estado de busca, a biblioteca visual, o histórico e a comunicação com as APIs.

* Backend (FastAPI + Python): Roda na porta `:8000` Atua como orquestrador `orchestrator.py`, controlando os módulos de extração `animefire.py`, `animesdrive.py`, o serviço do `mpv` local `player.py` e o banco JSON `storage.py`.

---

## 📂 Estrutura de Diretórios (Visão Geral)
`main_api.py`: Roteador principal FastAPI e Background Tasks (Radares).

`api/`: Diretório contendo os scrapers `animefire.py`, `animesdrive.py` e a interface base `base.py`.

`player.py`: Script responsável pelo subprocesso do `mpv`, injeção de shaders e controle do `FFmpeg`.

`storage.py`: Sistema de banco de dados baseado em arquivos locais `.json`, com expiração dinâmica.

`App.jsx`, `EpisodeScreen.jsx`, `AnimeCard.jsx`: Interface visual, sensores de rolagem, modais e integração com a API.

`temp_input.conf` / `temp_chapters.txt`: Arquivos gerados dinamicamente em tempo de execução para atalhos do MPV.

---

## 🚀 Instalação

Siga rigorosamente os passos abaixo para configurar o ambiente no seu sistema Linux.

### 1. Pré-requisitos do Sistema
O sistema exige ferramentas de processamento de vídeo e um navegador específico para o motor de bypass funcionar corretamente.

```bash
# Atualize os repositórios
sudo apt update && sudo apt upgrade -y

# Instale as ferramentas de mídia
sudo apt install mpv ffmpeg -y

# Instale o Navegador Brave (Obrigatório para o DrissionPage)
sudo apt install curl -y
sudo curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg] https://brave-browser-apt-release.s3.brave.com/ stable main"|sudo tee /etc/apt/sources.list.d/brave-browser-release.list
sudo apt update && sudo apt install brave-browser -y
```

### 2. Configuração do Backend (Python/FastAPI)

```bash
git clone https://github.com/MWkass/Slime_Shell_Web.git
cd Slime_Shell_Web

# Configuração do ambiente virtual e dependências
python3 -m venv slime_web_virtual
source slime_web_virtual/bin/activate
pip install -r requirements.txt

# Configuração de variáveis de ambiente
cd backend
echo "IMGBB_API_KEY=sua_chave_aqui" > .env
echo "PASTA_SCREENSHOTS=./screenshots" > .env
```

### 3. Configuração do Frontend (Node/React)
**Requisito Importante:** Requer Node.js versão **20.19+** ou **22.12+**.

```bash
# Na raiz do projeto, entre na pasta frontend (SEM o ambiente virtual python)
cd frontend

# Instale os pacotes
npm install

# Configure o endereço da API
echo "VITE_API_BASE_URL=http://127.0.0.1:8000/api" > .env
```

<!--
### 4. Configuração de Shaders (Alta Performance)
Para ativar o upscaling **Anime4K** (injetado automaticamente pelo `player.py`), você deve colocar os arquivos `.glsl` na pasta `shaders/` dentro da pasta `backend`.

1. No terminal dentro da pasta backend execute `mkdir shaders` para criar a pasta

2. Baixe os shaders oficiais do [Anime4K](https://github.com/bloc97/Anime4K/releases).
-->

---

### 🔧 Solução de Problemas (Troubleshooting)
Caso enfrente erros ao iniciar o Frontend, verifique o seguinte:

**Erro "npm: command not found" (Node.js não instalado):** O projeto precisa do Node.js (que já inclui o `npm`). A forma mais segura de instalar no Linux é via NVM. Rode os comandos abaixo:
```bash
# Baixa e instala o NVM
curl -o- [https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh](https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh) | bash

# Recarrega as configurações do terminal
source ~/.bashrc

# Instala o Node.js na versão 22 (ideal para o projeto)
nvm install 22
```

**Erro de versão do Node (CustomEvent is not defined):** O Vite exige versões recentes do Node (20.19+ ou 22+). Se o seu Node for muito antigo e você já usa o NVM, basta atualizar: `nvm install 22` e depois `nvm use 22`.

**Erro de Binding Nativo (Cannot find native binding):** Ocorre ao atualizar a versão do Node.js com dependências antigas instaladas. Para resolver, vá até a pasta `frontend` e rode:

```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

---

## ▶️ Execução

### 1. Execução na IDE
Para iniciar o sistema no terminal de uma IDE, você precisará de dois terminais ativos para rodar o projeto:

* **Terminal 1 (Backend):** Na pasta `backend` com o `slime_web_virtual` ativo, rode: `uvicorn main_api:app --reload`
* **Terminal 2 (Frontend):** Na pasta `frontend`, rode: `npm run dev`
* Acesse `http://localhost:5173` no navegador.


### 2. Execução em qualquer terminal
Para iniciar o sistema em qualquer terminal com um comando siga os passos abaixo:

* Crie o arquivo executável: `sudo nano /usr/local/bin/slimeWEB`
* Cole o script abaixo no arquivo slimeWEB criado. **Atenção:** Lembre-se de alterar a variável **PROJECT_DIR** para o caminho exato de onde você clonou o projeto na sua máquina:
```bash
#!/bin/bash

echo -e "\n Iniciando o Slime Shell // Web...\n"

# Ajuste para o local exato onde você clonou o repositório
PROJECT_DIR="/caminho/para/seu/Slime_Shell_Web"

# 1. Liga o Backend
cd $PROJECT_DIR
source slime_web_virtual/bin/activate
cd $PROJECT_DIR/backend
uvicorn main_api:app --host 127.0.0.1 --port 8000 &
PID_PYTHON=$!

# 2. Liga o Frontend
cd $PROJECT_DIR/frontend
npm run dev &
PID_NODE=$!

# 3. Espera 3 segundos para os servidores iniciarem e abre o navegador
sleep 3
xdg-open http://localhost:5173

# 4. Mantém o terminal ativo até você desligar
echo -e "\n Slime Shell Online! Aperte [CTRL + C] para desligar tudo.\n"
trap "echo -e '\n Desligando servidores...'; kill $PID_PYTHON $PID_NODE; exit" INT
wait
```

* Dê permissão de execução ao script: `sudo chmod +x /usr/local/bin/slimeWEB`

* Agora, basta abrir qualquer terminal no seu computador e digitar: `slimeWEB`

---

## ⚠️ Aviso Legal
O Slime Shell é uma ferramenta educacional desenvolvida para demonstrar a orquestração de scripts em Python, engenharia reversa de proteção web e desenvolvimento fullstack. O código atua apenas como um "navegador automatizado" e reprodutor de mídia; não armazena ou distribui conteúdos protegidos por direitos autorais. O uso responsável é de total responsabilidade do usuário final.
