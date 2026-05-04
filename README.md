# Slime Shell // Web

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

### 2. Clonagem e Ambiente Python
Recomenda-se o uso de um ambiente virtual para manter as dependências isoladas.

```bash
# Clone o repositório
git clone https://github.com/MWkass/Slime_Shell_Web.git
cd Slime_Shell_Web

# Crie e ative o ambiente virtual
python3 -m venv venv
source venv/bin/activate
```

### 3. Instalação de Dependências Python
Instale as bibliotecas necessárias:

```bash
pip install -r requirements.txt
```

### 4. Configuração do Backend (Python/FastAPI)
Abra um terminal na raiz do projeto para configurar o motor de extração.

```bash
# Entre na pasta backend com o ambiente virtual ATIVADO
cd Slime_Shell_Web/backend

# Configure as variáveis de ambiente (.env)
echo "IMGBB_API_KEY=sua_chave_aqui" > .env
echo "PASTA_SCREENSHOTS=./screenshots" > .env
```

### 5. Configuração do Frontend (Node/React)
No terminal entre na pasta frontend

```bash
# Entre na pasta frontend com o ambiente virtual DESATIVADO
cd Slime_Shell_Web/frontend

# Instale os pacotes npm
npm install

# Configure o endereço da API no arquivo .env do Vite
echo "VITE_API_BASE_URL=http://127.0.0.1:8000/api" > .env
```

### 6. Configuração de Shaders (Alta Performance)
Para ativar o upscaling **Anime4K** (injetado automaticamente pelo `player.py`), você deve colocar os arquivos `.glsl` na pasta `shaders/` dentro da pasta `backend`.

1. No terminal dentro da pasta backend execute `mkdir shaders` para criar a pasta

2. Baixe os shaders oficiais do [Anime4K](https://github.com/bloc97/Anime4K/releases).

---

## Execução

### 1. Execução na IDE
Para iniciar o sistema no terminal de uma IDE, você precisará de dois terminais ativos para rodar o projeto:

Terminal 1 (Backend - FastAPI) COM Ambiente Virtual:
```bash
# Ative o Ambiente Virtual se ainda nao estiver ativo
source venv/bin/activate
# Entre na pasta backend 
cd Slime_Shell_Web/backend

# Execute
uvicorn main_api:app --reload
```

Terminal 2 (Frontend - React) SEM Ambiente Virtual:
```bash
# Entre na pasta frontend
cd Slime_Shell_Web/frontend

# Execute
npm run dev --force
```
Acesse o sistema no seu navegador através de: http://localhost:5173


### 2. Execução em qualquer terminal
Para iniciar o sistema em qualquer terminal com um comando siga os passos abaixo:

1. Crie o arquivo executável na sua pasta de binários locais:
```bash
sudo nano /usr/local/bin/slimeWEB
```

2. Cole o script abaixo no arquivo slimeWEB criado. Atenção: Lembre-se de alterar a variável PROJECT_DIR para o caminho exato de onde você clonou o projeto na sua máquina:
```bash
#!/bin/bash

echo -e "\n Iniciando o Slime Shell // Web...\n"

# Ajuste para o local exato onde você clonou o repositório
PROJECT_DIR="/caminho/para/seu/Slime_Shell_Web"

# 1. Liga o Backend
cd $PROJECT_DIR
source venv/bin/activate
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

3. Dê permissão de execução ao script:
```bash
sudo chmod +x /usr/local/bin/slimeWEB
```

4. Agora, basta abrir qualquer terminal no seu computador e digitar:
```bash
slimeWEB
```

---

## ⚠️ Aviso Legal
O Slime Shell é uma ferramenta educacional desenvolvida para demonstrar a orquestração de scripts em Python, engenharia reversa de proteção web e desenvolvimento fullstack. O código atua apenas como um "navegador automatizado" e reprodutor de mídia; não armazena ou distribui conteúdos protegidos por direitos autorais. O uso responsável é de total responsabilidade do usuário final.
