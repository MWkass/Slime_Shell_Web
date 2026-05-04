import os
import re
import json
import asyncio
import logging
import httpx
from dotenv import load_dotenv
from datetime import datetime, timedelta
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Importações do ecossistema local
from api.orchestrator import ContentOrchestrator
from player import reproduzir_video_mpv
from storage import (
    ler_historico, salvar_historico, ler_notificacoes, salvar_notificacao, 
    marcar_notificacao_lida, carregar_cache_dinamico, ARQUIVO_CACHE_DINAMICO, 
    limpar_todas_notificacoes, salvar_notificacao_simples
)

# ==========================================
# CONFIGURAÇÕES GLOBAIS E LOGS
# ==========================================
load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

CAMINHO_ATUAL = os.path.abspath(os.path.dirname(__file__))
PASTA_SCREENSHOTS = os.getenv("PASTA_SCREENSHOTS", os.path.join(os.getcwd(), 'screenshots'))
os.makedirs(PASTA_SCREENSHOTS, exist_ok=True)

app = FastAPI(title="Slime Shell API", version="3.0", description="Backend assíncrono para orquestração de animes.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Adicione o seu domínio customizado aqui!
        "http://slimeshellweb:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = ContentOrchestrator()

# ==========================================
# MODELS (Pydantic - Validação de Dados)
# ==========================================
class PlayRequest(BaseModel):
    url_video: str
    titulo: str
    referer: str = ""
    anime_titulo: str = ""
    ep_numero: str = ""
    fonte: str = ""
    poster: str = ""
    cover: str = ""
    tempo_inicial: int = 0
    anime_url: str = ""

class LancamentoRequest(BaseModel):
    titulo: str
    ep_numero: str
    url_anime: str = ""
    fonte: str = ""

# ==========================================
# CAMADA DE SERVIÇOS (Lógica de Negócio)
# ==========================================
class FileCleanupService:
    @staticmethod
    def limpar_screenshots_orfas():
        try:
            historico = ler_historico()
            urls_em_uso = set()
            
            for h in historico:
                if h.get('screenshot_url') and '127.0.0.1' in h.get('screenshot_url'):
                    urls_em_uso.add(h['screenshot_url'].split('/')[-1])
                for ep, url in h.get('screenshots_album', {}).items():
                    if '127.0.0.1' in url:
                        urls_em_uso.add(url.split('/')[-1])
                        
            for arquivo in os.listdir(PASTA_SCREENSHOTS):
                if arquivo.endswith(('.jpg', '.png')) and arquivo not in urls_em_uso:
                    os.remove(os.path.join(PASTA_SCREENSHOTS, arquivo))
                    logger.info(f"[Faxineiro] Imagem temporária removida: {arquivo}")
        except Exception as e:
            logger.error(f"[Faxineiro] Erro ao limpar screenshots: {e}")

class MetadataService:
    CACHE_CAPAS = {}
    CACHE_TRENDING = {"dados": [], "expira_em": None}
    CACHE_METADATA = {}

    @classmethod
    async def fetch_cover(cls, title_clean: str) -> str:
        if title_clean in cls.CACHE_CAPAS:
            return cls.CACHE_CAPAS[title_clean]
            
        async with httpx.AsyncClient(timeout=5.0) as client:
            # 1. Kitsu API
            try:
                res_kitsu = await client.get(f"https://kitsu.io/api/edge/anime?filter[text]={title_clean}&page[limit]=1")
                res_kitsu.raise_for_status()
                data = res_kitsu.json()
                if data.get('data'):
                    url = data['data'][0]['attributes']['posterImage']['original']
                    cls.CACHE_CAPAS[title_clean] = url
                    return url
            except httpx.RequestError as e:
                logger.warning(f"Falha na API Kitsu para capa '{title_clean}': {e}")

            # 2. AniList Fallback
            query = '''query ($search: String) { Media(search: $search, type: ANIME) { coverImage { extraLarge } } }'''
            try:
                await asyncio.sleep(0.2) # Rate limit respect
                res_anilist = await client.post('https://graphql.anilist.co', json={'query': query, 'variables': {'search': title_clean}})
                res_anilist.raise_for_status()
                data = res_anilist.json()
                if data.get('data') and data['data'].get('Media'):
                    url = data['data']['Media']['coverImage']['extraLarge']
                    cls.CACHE_CAPAS[title_clean] = url
                    return url
            except httpx.RequestError as e:
                logger.warning(f"Falha na API AniList para capa '{title_clean}': {e}")

        cls.CACHE_CAPAS[title_clean] = None
        return None

    @classmethod
    async def fetch_trending(cls):
        agora = datetime.now()
        if cls.CACHE_TRENDING["dados"] and cls.CACHE_TRENDING["expira_em"] and agora < cls.CACHE_TRENDING["expira_em"]:
            return cls.CACHE_TRENDING["dados"]
            
        query = '''query { Page(page: 1, perPage: 50) { media(status: RELEASING, type: ANIME, sort: TRENDING_DESC) { title { romaji english } coverImage { extraLarge } bannerImage } } }'''
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.post('https://graphql.anilist.co', json={'query': query})
                res.raise_for_status()
                animes = res.json().get('data', {}).get('Page', {}).get('media', [])
                
                formatados = [{
                    "titulo_exibicao": a['title'].get('romaji') or a['title'].get('english'),
                    "titulo_romaji": a['title'].get('romaji'),
                    "fonte": "Lançamento",
                    "imagem": a['coverImage']['extraLarge'],
                    "cover": a.get('bannerImage') or a['coverImage']['extraLarge'],
                    "poster": a['coverImage']['extraLarge']
                } for a in animes]
                
                cls.CACHE_TRENDING["dados"] = formatados
                cls.CACHE_TRENDING["expira_em"] = agora + timedelta(hours=1)
                return formatados
            except httpx.RequestError as e:
                logger.error(f"Erro ao buscar trending animes: {e}")
                return None

    @classmethod
    async def fetch_metadata(cls, title_clean: str, title_agressivo: str):
        if title_clean in cls.CACHE_METADATA:
            return cls.CACHE_METADATA[title_clean]

        async with httpx.AsyncClient(timeout=5.0) as client:
            async def buscar_anilist(termo):
                query = '''query ($search: String) { Media(search: $search, type: ANIME) { bannerImage coverImage { extraLarge } description(asHtml: false) } }'''
                try:
                    res = await client.post('https://graphql.anilist.co', json={'query': query, 'variables': {'search': termo}})
                    if res.status_code == 200:
                        return res.json().get('data', {}).get('Media')
                except httpx.RequestError: pass
                return None

            async def buscar_kitsu(termo):
                try:
                    res = await client.get(f"https://kitsu.io/api/edge/anime?filter[text]={termo}&page[limit]=1")
                    if res.status_code == 200:
                        data_k = res.json().get('data', [])
                        if data_k:
                            attrs = data_k[0]['attributes']
                            
                            # Se a imagem for null (None), transforma em {} automaticamente
                            poster_img = attrs.get('posterImage') or {}
                            cover_img = attrs.get('coverImage') or {}
                            
                            return {
                                'coverImage': {'extraLarge': poster_img.get('original')},
                                'bannerImage': cover_img.get('original'),
                                'description': attrs.get('synopsis', 'Sinopse não disponível.')
                            }
                except httpx.RequestError: pass
                return None

            termos_para_tentar = [title_clean]
            if title_clean != title_agressivo:
                termos_para_tentar.append(title_agressivo)

            media = None
            for termo in termos_para_tentar:
                media = await buscar_anilist(termo)
                if media: break
                media = await buscar_kitsu(termo)
                if media: break

            if media:
                desc_en = media.get('description', "Sinopse não disponível.").replace('<br>', '\n').replace('<i>', '').replace('</i>', '')
                desc_pt = desc_en
                
                try:
                    # Deixamos a URL base limpa
                    url_trans = "https://translate.googleapis.com/translate_a/single"
                    
                    # Passamos os parâmetros num dicionário. O httpx codifica espaços e \n sozinho!
                    params = {
                        "client": "gtx",
                        "sl": "en",
                        "tl": "pt",
                        "dt": "t",
                        "q": desc_en
                    }
                    
                    res_trans = await client.get(url_trans, params=params)
                    if res_trans.status_code == 200:
                        desc_pt = "".join([frase[0] for frase in res_trans.json()[0] if frase[0]])
                except httpx.RequestError as e:
                    logger.warning(f"Falha ao traduzir sinopse: {e}")

                dados = {
                    "poster": media.get('coverImage', {}).get('extraLarge'),
                    "cover": media.get('bannerImage') or media.get('coverImage', {}).get('extraLarge'),
                    "synopsisEN": desc_en,
                    "synopsisPT": desc_pt
                }
                
                cls.CACHE_METADATA[title_clean] = dados
                return dados
                
        return None

class BackgroundTasksService:
    RADAR_EM_EXECUCAO = False

    @staticmethod
    def tarefa_segundo_plano_mpv(req: PlayRequest):
        tempo_parado, progresso, sucesso, url_imagem_local = reproduzir_video_mpv(
            url_video=req.url_video, 
            titulo=req.titulo, 
            referer=req.referer,
            tempo_inicial=req.tempo_inicial
        )
        
        if sucesso:
            idioma = "Dublado" if "Dublado" in req.anime_titulo else "Legendado"
            salvar_historico(
                titulo_anime=req.anime_titulo,
                ep_numero=req.ep_numero,
                titulo_ep=req.titulo,
                idioma=idioma,
                progresso=progresso,
                tempo_segundos=tempo_parado,
                fonte=req.fonte,
                poster=req.poster,
                cover=req.cover, 
                url_anime=req.anime_url,
                screenshot_url=url_imagem_local if url_imagem_local else ""
            )
            FileCleanupService.limpar_screenshots_orfas()

    @classmethod
    def executar_radar_dublagens_background(cls):
        FileCleanupService.limpar_screenshots_orfas()
        if cls.RADAR_EM_EXECUCAO:
            return
            
        cls.RADAR_EM_EXECUCAO = True
        try:
            cache = carregar_cache_dinamico()
            if "cooldown_radar" not in cache: cache["cooldown_radar"] = {}
            cooldowns = cache["cooldown_radar"]
            
            historico = ler_historico()
            agora = datetime.now()
            
            animes_ja_dublados = set()
            for h in historico:
                if h.get('idioma', '').lower() == 'dublado' or "dublado" in h.get('titulo', '').lower():
                    tb = re.sub(r'(?i)\b(dublado|legendado)\b', '', h.get('titulo', ''))
                    tb = re.sub(r'[\(\[\]\)]', '', tb).strip().lower()
                    animes_ja_dublados.add(tb)
                    
            for item in historico:
                idioma = item.get('idioma', '').lower()
                if "legendado" in idioma or "legendado" in item.get('titulo', '').lower():
                    titulo_base = re.sub(r'(?i)\b(dublado|legendado)\b', '', item['titulo'])
                    titulo_base = re.sub(r'[\(\[\]\)]', '', titulo_base).strip()
                    titulo_base_lower = titulo_base.lower()
                    
                    if titulo_base_lower in animes_ja_dublados:
                        continue
                    
                    ultimo_check = cooldowns.get(titulo_base)
                    if ultimo_check:
                        try:
                            dt = datetime.strptime(ultimo_check, "%Y-%m-%d %H:%M:%S")
                            if (agora - dt).total_seconds() < 86400: continue 
                        except ValueError: pass
                    
                    logger.info(f"[Radar] Vasculhando dublagem de: {titulo_base}")
                    
                    try:
                        resultados_busca = orchestrator.search_all(query=titulo_base)
                        chave_seguranca = " ".join(re.sub(r'[^a-z0-9 ]', '', titulo_base_lower).split()[:2])
                        
                        dublados_encontrados = []
                        for res in resultados_busca:
                            titulo_res = res.get('titulo_exibicao', '') if isinstance(res, dict) else getattr(res, 'titulo_exibicao', '')
                            titulo_res_limpo = re.sub(r'[^a-z0-9 ]', '', titulo_res.lower())
                            
                            if "dublado" in titulo_res.lower() and (not chave_seguranca or chave_seguranca in titulo_res_limpo):
                                dublados_encontrados.append(res)
                        
                        if dublados_encontrados:
                            logger.info(f"[Radar] DUBLAGEM ENCONTRADA PARA: {titulo_base}!")
                            salvar_notificacao(titulo_base, dublados_encontrados)
                        
                        cooldowns[titulo_base] = agora.strftime("%Y-%m-%d %H:%M:%S")
                        try:
                            cache_completo = carregar_cache_dinamico()
                            cache_completo["cooldown_radar"] = cooldowns
                            with open(ARQUIVO_CACHE_DINAMICO, 'w', encoding='utf-8') as f:
                                json.dump(cache_completo, f, indent=4, ensure_ascii=False)
                        except Exception as e: 
                            logger.error(f"[Radar] Falha ao salvar cache: {e}")
                        
                        import time
                        time.sleep(3) # Freio do navegador invisível
                        
                    except Exception as e:
                        logger.error(f"[Radar] Falha ao checar {titulo_base}: {e}")
        finally:
            cls.RADAR_EM_EXECUCAO = False

    @staticmethod
    def executar_radar_geladeira_background():
        historico = ler_historico()
        agora = datetime.now()
        
        for item in historico:
            progresso = item.get('progresso', 0)
            data_str = item.get('data_atualizacao')
            
            if 0 < progresso < 100 and data_str:
                try:
                    data_ult = datetime.strptime(data_str, "%Y-%m-%d")
                    dias_parado = (agora - data_ult).days
                    
                    if dias_parado >= 14:
                        mensagem = f"Você parou no episódio {item.get('ep')} de {item.get('titulo')} há {dias_parado} dias. Que tal tirar da geladeira?"
                        salvar_notificacao_simples(
                            titulo_anime=item.get('titulo'),
                            mensagem=mensagem,
                            url_anime=item.get('url', ''),
                            fonte=item.get('fonte', '')
                        )
                except Exception as e:
                    logger.error(f"[Radar Geladeira] Erro em {item.get('titulo')}: {e}")

# ==========================================
# ENDPOINTS (Controllers)
# ==========================================

@app.get("/")
def read_root():
    return {"status": "Slime Shell API Online", "motores": len(orchestrator.providers)}

@app.get("/api/cover")
async def get_cover(title: str = Query(...)):
    title_clean = re.sub(r'(?i)\(dublado\)|\(legendado\)', '', title).strip()
    url = await MetadataService.fetch_cover(title_clean)
    if url:
        return {"sucesso": True, "url": url}
    return {"sucesso": False, "url": None}

@app.get("/api/trending")
async def get_trending():
    resultados = await MetadataService.fetch_trending()
    if resultados:
        return {"sucesso": True, "resultados": resultados}
    return {"sucesso": False, "resultados": []}

@app.get("/api/metadata")
async def get_metadata(title: str = Query(...)):
    title_clean = re.sub(r'(?i)\(dublado\)|\(legendado\)', '', title).strip()
    title_agressivo = re.sub(r'(?i)(\s\d+(st|nd|rd|th)?\sseason|\sseason\s\d+|\spart\s\d+).*', '', title_clean).strip()
    
    dados = await MetadataService.fetch_metadata(title_clean, title_agressivo)
    if dados:
        return {"sucesso": True, "dados": dados}
    return {"sucesso": False, "dados": None}

@app.get("/screenshots/{filename}")
def get_screenshot(filename: str):
    caminho = os.path.join(PASTA_SCREENSHOTS, filename)
    if os.path.exists(caminho):
        return FileResponse(caminho)
    return Response(status_code=204)

@app.get("/api/search")
def search_anime(q: str = Query(..., description="Nome do anime")):
    try:
        resultados = orchestrator.search_all(query=q)
        return {"sucesso": True, "termo": q, "resultados": resultados}
    except Exception as e:
        logger.error(f"Erro na busca por {q}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/episodes")
def get_episodes(url: str = Query(...), provider: str = Query(...)):
    try:
        episodios = orchestrator.get_episodes(provider_name=provider, anime_url=url)
        return {"sucesso": True, "total": len(episodios), "episodios": episodios}
    except Exception as e:
        logger.error(f"Erro ao buscar episódios: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/links")
def get_links(url: str = Query(...), provider: str = Query(...)):
    try:
        links = orchestrator.extract_links(provider_name=provider, episode_url=url)
        if not links: 
            return {"sucesso": False, "mensagem": "Nenhum link encontrado."}
        return {"sucesso": True, "links": links}
    except Exception as e:
        logger.error(f"Erro ao buscar links de vídeo: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/play")
def play_video(payload: PlayRequest, background_tasks: BackgroundTasks):
    try:
        background_tasks.add_task(BackgroundTasksService.tarefa_segundo_plano_mpv, payload)
        return {"sucesso": True, "mensagem": "Player iniciado."}
    except Exception as e:
        logger.error(f"Erro ao iniciar o player: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reset")
def reset_backend():
    try:
        from api.animesdrive import BrowserManager
        BrowserManager.reset_page() 
        return {"sucesso": True, "mensagem": "Navegador colocado em repouso"}
    except Exception as e:
        logger.error(f"Erro no reset do navegador: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history")
def get_history():
    return ler_historico()

@app.get("/api/notifications")
def get_notifications():
    notificacoes = ler_notificacoes()
    nao_lidas = sum(1 for n in notificacoes if not n.get('lida', False))
    return {"sucesso": True, "notificacoes": notificacoes, "nao_lidas": nao_lidas}

@app.post("/api/notifications/{id_notificacao}/read")
def read_notification(id_notificacao: str):
    marcar_notificacao_lida(id_notificacao)
    return {"sucesso": True}

@app.post("/api/radar")
def trigger_radar(background_tasks: BackgroundTasks):
    background_tasks.add_task(BackgroundTasksService.executar_radar_dublagens_background) 
    background_tasks.add_task(BackgroundTasksService.executar_radar_geladeira_background) 
    return {"sucesso": True, "mensagem": "Radares lançados."}

@app.post("/api/notifications/new_episode")
def notify_new_episode(req: LancamentoRequest):
    mensagem = f"LANÇAMENTO: O Episódio {req.ep_numero} de {req.titulo} já está disponível!"
    salvar_notificacao_simples(req.titulo, mensagem, req.url_anime, req.fonte)
    return {"sucesso": True}

@app.post("/api/notifications/clear")
def clear_all_notifications():
    limpar_todas_notificacoes()
    return {"sucesso": True}