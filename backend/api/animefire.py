import logging
import cloudscraper
from bs4 import BeautifulSoup
import re
from typing import List, Dict
import requests

from .base import AnimeProvider, AnimeResult, Episode
from .exceptions import CloudflareBlockError, NetworkTimeoutError, ParsingError
from storage import carregar_cache_dinamico, salvar_no_cache_dinamico

logger = logging.getLogger(__name__)

class AnimeFireProvider(AnimeProvider):
    BASE_URL = "https://animefire.io"

    @property
    def name(self) -> str:
        return "AnimeFire"

    def _get_scraper(self) -> cloudscraper.CloudScraper:
        return cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True}
        )

    def _fetch_html(self, url: str) -> str:
        """Centraliza as requisições com tratamento rigoroso de rede."""
        scraper = self._get_scraper()
        try:
            response = scraper.get(url, timeout=10) 
            if response.status_code == 404:
                return ""
            response.raise_for_status()
            return response.text
        except Exception as e:
            # === VÁLVULA DE ESCAPE RESTAURADA ===
            logger.warning(f"[AnimeFire] Falha na rede ({e}). Acionando Válvula de Escape (Brave)...")
            try:
                from api.animesdrive import BrowserManager
                page = BrowserManager.get_page()
                page.get(url)
                import time; time.sleep(2)
                return page.html
            except Exception as ex:
                logger.error(f"Válvula de escape falhou: {ex}")
                return ""

    def search(self, query: str) -> List[AnimeResult]:
        busca_formatada = query.replace(' ', '-').lower()
        url = f"{self.BASE_URL}/pesquisar/{busca_formatada}"
        
        html = self._fetch_html(url)
        
        # === INTERCEPTA O 404 AQUI ===
        if not html:
            return [] # Retorna lista vazia instantaneamente!
        # =============================
        
        try:
            soup = BeautifulSoup(html, 'html.parser')
            resultados = []
            for caixa in soup.find_all('div', class_='divCardUltimosEps'):
                tag_link = caixa.find('a')
                if not tag_link:
                    continue
                
                titulo = tag_link.text.strip()
                link = tag_link.get('href', '')
                
                # Limpeza de strings via Regex
                titulo_limpo = re.sub(r'\s+\d+\.\d+\s+[A-Z\d]+$', '', titulo).strip()
                titulo_limpo = titulo_limpo.replace('\xa0', ' ')
                
                resultados.append(AnimeResult(
                    titulo_exibicao=titulo_limpo,
                    url=link,
                    fonte=self.name
                ))
            return resultados
        except Exception as e:
            logger.error(f"Erro de parsing no {self.name} - Search: {e}")
            raise ParsingError(f"Estrutura HTML do {self.name} mudou.")

    def get_episodes(self, anime_url: str) -> List[Episode]:
        # 1. TENTA LER DA GAVETA
        cache = carregar_cache_dinamico()
        if anime_url in cache.get('lista_episodios', {}):
            print(f"  [Cache] Episódios lidos do disco para: {anime_url}")
            episodios_salvos = cache['lista_episodios'][anime_url]['dados']
            return [Episode(**ep) for ep in episodios_salvos]

        # 2. SE NÃO TEM NA GAVETA, VAI NA REDE
        html = self._fetch_html(anime_url)
        
        try:
            soup = BeautifulSoup(html, 'html.parser')
            episodios = []
            vistos = set()
            slug = anime_url.split('/')[-1].replace('-todos-os-episodios', '')
            
            for a in soup.find_all('a', href=True):
                href = a['href']
                if f"/animes/{slug}/" in href and href not in vistos:
                    numero = href.split('/')[-1]
                    vistos.add(href)
                    episodios.append(Episode(numero=numero, url=href))
            
            episodios.reverse() # Mais antigo para o mais novo
            
            # 3. SALVA NA GAVETA
            if episodios:
                dados_para_salvar = [{"numero": ep.numero, "url": ep.url} for ep in episodios]
                salvar_no_cache_dinamico('lista_episodios', anime_url, dados_para_salvar)
                
            return episodios
        except Exception as e:
            logger.error(f"Erro de parsing no {self.name} - Episódios: {e}")
            raise ParsingError("Falha ao ler a lista de episódios.")

    def extract_links(self, episode_url: str) -> Dict[str, str]:
        html = self._fetch_html(episode_url)
        
        try:
            soup = BeautifulSoup(html, 'html.parser')
            video_tag = soup.find('video')
            
            if not video_tag or 'data-video-src' not in video_tag.attrs:
                return {}
                
            json_url = video_tag['data-video-src']
            dados_video = self._get_scraper().get(json_url, timeout=10).json()
            
            link_direto = ""
            for qualidade in dados_video.get('data', []):
                link_direto = qualidade.get('src', link_direto)
                
            return {"Servidor Nativo": link_direto} if link_direto else {}
            
        except Exception as e:
            logger.error(f"Erro ao extrair vídeo no {self.name}: {e}")
            return {}