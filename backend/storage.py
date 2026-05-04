import json
import os
import datetime

CAMINHO_ATUAL = os.path.abspath(os.path.dirname(__file__))
DIRETORIO_RAIZ = os.path.abspath(os.path.join(CAMINHO_ATUAL, '..'))

ARQUIVO_HISTORICO = os.path.join(DIRETORIO_RAIZ, "historico.json")

ARQUIVO_CACHE_DINAMICO = os.path.join(DIRETORIO_RAIZ, "cache_animes.json")
ARQUIVO_NOTIFICACOES = os.path.join(DIRETORIO_RAIZ, "notificacoes.json")

# === HELPERS: LEITURA E ESCRITA GENÉRICA DE JSON (DRY) ===
def _ler_json(caminho_arquivo, default_value):
    if os.path.exists(caminho_arquivo):
        try:
            with open(caminho_arquivo, 'r', encoding='utf-8') as f:
                dados = json.load(f)
                # Retorna os dados apenas se coincidirem com o tipo padrão esperado (lista ou dict)
                if isinstance(dados, type(default_value)):
                    return dados
        except Exception:
            pass
    return default_value

def _salvar_json(caminho_arquivo, dados):
    with open(caminho_arquivo, 'w', encoding='utf-8') as f:
        json.dump(dados, f, indent=4, ensure_ascii=False)

# === HELPER: FAXINEIRO DE CACHE DINÂMICO ===
def _limpar_gaveta(cache, nome_gaveta, agora):
    gaveta_limpa = {}
    mudou = False
    for url, bloco in cache.get(nome_gaveta, {}).items():
        try:
            dt = datetime.datetime.strptime(bloco.get('timestamp', ''), "%Y-%m-%d %H:%M:%S")
            if (agora - dt).total_seconds() < 7200: # 2 horas de vida útil
                gaveta_limpa[url] = bloco
            else: 
                mudou = True
        except Exception: 
            pass
    cache[nome_gaveta] = gaveta_limpa
    return mudou

def carregar_cache_dinamico():
    cache = _ler_json(ARQUIVO_CACHE_DINAMICO, {"lista_episodios": {}, "links_de_video": {}})
    agora = datetime.datetime.now()
    
    mudou_eps = _limpar_gaveta(cache, "lista_episodios", agora)
    mudou_links = _limpar_gaveta(cache, "links_de_video", agora)

    if mudou_eps or mudou_links:
        _salvar_json(ARQUIVO_CACHE_DINAMICO, cache)

    return cache

def salvar_no_cache_dinamico(gaveta, url, dados):
    """'gaveta' deve ser 'lista_episodios' ou 'links_de_video'"""
    cache = carregar_cache_dinamico()
    
    # Salva na gaveta correta padronizando a palavra 'dados'
    cache[gaveta][url] = {
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "dados": dados
    }
    
    _salvar_json(ARQUIVO_CACHE_DINAMICO, cache)

def ler_historico():
    return _ler_json(ARQUIVO_HISTORICO, [])

def salvar_historico(titulo_anime, ep_numero, titulo_ep, idioma, progresso, tempo_segundos, fonte, poster, cover="", url_anime="", screenshot_url=""):
    historico = ler_historico()
    
    # 1. Resgata o álbum de fotos antigo antes de apagar o registro
    album_fotos = {}
    for h in historico:
        if h.get('titulo') == titulo_anime:
            # Traz o álbum que já existia (se existir)
            album_fotos = h.get('screenshots_album', {})
            # Se ele tinha uma foto principal solta, guarda no álbum também por segurança
            if h.get('screenshot_url'):
                album_fotos[str(h.get('ep'))] = h.get('screenshot_url')
            break
            
    # 2. Adiciona a foto nova no álbum
    if screenshot_url:
        album_fotos[str(ep_numero)] = screenshot_url
        
    # Remove o registro antigo do anime
    historico = [h for h in historico if h.get('titulo') != titulo_anime]
    
    novo_registro = {
        "titulo": titulo_anime,
        "ep": str(ep_numero),
        "titulo_ep": titulo_ep,
        "idioma": idioma,
        "progresso": progresso,
        "tempo": tempo_segundos, 
        "fonte": fonte,
        "imagem": poster if poster else "https://via.placeholder.com/150",
        "cover": cover if cover else poster,
        "url": url_anime,
        "screenshot_url": screenshot_url if screenshot_url else "", 
        "screenshots_album": album_fotos,
        "data_atualizacao": datetime.datetime.now().strftime("%Y-%m-%d")
    }
    
    historico.insert(0, novo_registro)
    _salvar_json(ARQUIVO_HISTORICO, historico)


# === SISTEMA DE NOTIFICAÇÕES E RADAR ===
def ler_notificacoes():
    return _ler_json(ARQUIVO_NOTIFICACOES, [])

def salvar_notificacao(titulo_anime, resultados_dublados):
    nots = ler_notificacoes()
    
    # Verifica se já não avisamos sobre esse anime antes para não flodar o usuário
    if not any(n.get('titulo') == titulo_anime for n in nots):
        
        # CORREÇÃO: Converte garantindo que não vai dar erro de 'dict' object
        resultados_dit = []
        for r in resultados_dublados:
            if isinstance(r, dict):
                resultados_dit.append({
                    "titulo_exibicao": r.get("titulo_exibicao"), 
                    "url": r.get("url"), 
                    "fonte": r.get("fonte")
                })
            else:
                resultados_dit.append({
                    "titulo_exibicao": r.titulo_exibicao, 
                    "url": r.url, 
                    "fonte": r.fonte
                })
        
        nova_notificacao = {
            "id": str(datetime.datetime.now().timestamp()),
            "titulo": titulo_anime,
            "mensagem": f"A versão DUBLADA de {titulo_anime} acabou de chegar!",
            "resultados": resultados_dit,
            "lida": False,
            "data": datetime.datetime.now().strftime("%d/%m/%Y")
        }
        
        nots.insert(0, nova_notificacao)
        _salvar_json(ARQUIVO_NOTIFICACOES, nots[:20]) # Guarda o histórico de 20 notificações max

def marcar_notificacao_lida(id_notificacao):
    nots = ler_notificacoes()
    for n in nots:
        if n.get('id') == id_notificacao:
            n['lida'] = True
            break
    _salvar_json(ARQUIVO_NOTIFICACOES, nots)

def limpar_todas_notificacoes():
    _salvar_json(ARQUIVO_NOTIFICACOES, [])


def salvar_notificacao_simples(titulo_anime, mensagem, url_anime="", fonte=""):
    nots = ler_notificacoes()
    
    # Sistema Anti-Spam: Não salva se já existir uma notificação idêntica não lida
    if any(n.get('mensagem') == mensagem and not n.get('lida') for n in nots):
        return
        
    nova_notificacao = {
        "id": str(datetime.datetime.now().timestamp()),
        "titulo": titulo_anime,
        "mensagem": mensagem,
        "lida": False,
        "data": datetime.datetime.now().strftime("%d/%m/%Y"),
        # O React espera 'resultados' para o clique funcionar, então criamos um "falso" para abrir o anime
        "resultados": [{"titulo_exibicao": titulo_anime, "url": url_anime, "fonte": fonte}] if url_anime else []
    }
    
    nots.insert(0, nova_notificacao)
    _salvar_json(ARQUIVO_NOTIFICACOES, nots[:30]) # Guardamos até 30 agora