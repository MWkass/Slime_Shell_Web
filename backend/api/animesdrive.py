import os
import urllib.parse
import re
import time
import requests
import threading
import datetime
from typing import List, Dict
from DrissionPage import ChromiumPage, ChromiumOptions

from .base import AnimeProvider, AnimeResult, Episode
from storage import carregar_cache_dinamico, salvar_no_cache_dinamico

nav_lock = threading.Lock()

class BrowserManager:
    _instance: ChromiumPage = None
    _lock = threading.Lock()

    @classmethod
    def get_page(cls) -> ChromiumPage:
        with cls._lock:
            if cls._instance is None:
                co = ChromiumOptions()
                co.set_browser_path('/usr/bin/brave-browser') 
                co.set_argument('--window-size=750,500')
                co.headless(False) 
                co.incognito(True)
                co.set_argument('--no-sandbox')
                co.set_argument('--log-level=3')
                co.set_argument('--mute-audio')
                co.set_argument('--disable-extensions')
                co.set_argument('--disable-javascript-harmony-shipping')
                cls._instance = ChromiumPage(co)
                try: cls._instance.set.window.mini()
                except: pass
            return cls._instance

    @classmethod
    def reset_page(cls):
        with cls._lock:
            if cls._instance:
                try: cls._instance.get('about:blank')
                except: pass
    
    @classmethod
    def reset_full(cls):
        with cls._lock:
            if cls._instance:
                try: cls._instance.quit() # Mata o Chrome fantasma
                except: pass
                cls._instance = None # Zera a RAM
            print("\n  [LIMPEZA] RAM e Navegador resetados com sucesso!")
    
def obter_info_video(url: str) -> str:
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    try:
        if '.m3u8' in url:
            resp = requests.get(url, headers=headers, timeout=4)
            
            if not resp.ok:
                return "Info Indisponível"
            
            # === RADAR ANTI-PNG ===
            # Se a playlist do vídeo listar imagens .png em vez de .ts, é golpe!
            content_type = resp.headers.get('Content-Type', '').lower()
            if 'image' in content_type or '<html' in resp.text.lower() or '.png' in resp.text.lower():
                return "Info Indisponível"
            # ======================
            
            match = re.findall(r'BANDWIDTH=(\d+)', resp.text)
            info_text = "HLS"
            if match:
                max_bitrate = max(map(int, match))
                mbps = max_bitrate / 1000000
                info_text = f"~{mbps:.1f} Mbps"
                
            # === RADAR PROFUNDO (Sub-Playlists) ===
            if '#EXT-X-STREAM-INF' in resp.text:
                lines = resp.text.splitlines()
                for i, line in enumerate(lines):
                    if line.startswith('#EXT-X-STREAM-INF') and i + 1 < len(lines):
                        sub_url = urllib.parse.urljoin(url, lines[i + 1].strip())
                        try:
                            sub_resp = requests.get(sub_url, headers=headers, timeout=4)
                            if not sub_resp.ok or '<html' in sub_resp.text.lower() or '.png' in sub_resp.text.lower():
                                return "Info Indisponível"
                        except Exception:
                            return "Info Indisponível"
                        break # Só precisamos checar uma qualidade (a primeira listada) para saber se a fonte é falsa
            
            return info_text
        else:
            resp = requests.head(url, headers=headers, timeout=4, allow_redirects=True)
            
            if not resp.ok:
                return "Info Indisponível"
            
            content_type = resp.headers.get('Content-Type', '').lower()
            if 'image' in content_type or 'text/html' in content_type:
                return "Info Indisponível"
            
            tamanho_bytes = int(resp.headers.get('content-length', 0))
            if tamanho_bytes > 0:
                tamanho_mb = tamanho_bytes / (1024 * 1024)
                return f"{tamanho_mb:.0f} MB"
            return "Tamanho Oculto"
    except Exception:
        return "Info Indisponível"


class AnimeDriveProvider(AnimeProvider):
    BASE_URL = "https://animesdrive.online"

    @property
    def name(self) -> str:
        return "AnimesDrive"

    def _wait_for_cloudflare(self, page: ChromiumPage):
        precisou_captcha = False
        timeout = 30
        inicio = time.time()
        
        while time.time() - inicio < timeout:
            titulo_aba = page.title.lower()
            if any(b in titulo_aba for b in ["verificação", "just a moment", "um momento", "cloudflare"]):
                if not precisou_captcha:
                    print("\r\033[K  [!] Escudo do Cloudflare detectado! Janela do Brave em foco.")
                    try: 
                        page.set.window.normal()
                        time.sleep(0.5)
                    except: pass
                    precisou_captcha = True
                time.sleep(2)
            else:
                if precisou_captcha:
                    try: page.set.window.mini() 
                    except: pass
                return
        print(f"[{self.name}] Timeout ao tentar passar pelo Cloudflare.")

    def search(self, query: str) -> List[AnimeResult]:
        query_formatada = " ".join(query.strip().replace('-', ' ').replace('_', ' ').split())
        url = f"{self.BASE_URL}/?s={urllib.parse.quote(query_formatada)}"
        page = BrowserManager.get_page()
        
        try:
            page.get(url, retry=2, timeout=15)
            self._wait_for_cloudflare(page)
            
            if "?s=" not in page.url and "animesdrive" in page.url:
                return [] 
                
            resultados = []
            
            # === CORTANDO A ESPERA FANTASMA ===
            # Se não achar o card na tela em 1 segundo, decreta que não existe!
            artigos = page.eles('css:div.result-item article', timeout=1) or page.eles('css:article.w_item_a', timeout=1)
            # ==================================
            
            for artigo in artigos:
                link_tag = artigo.ele('css:a')
                if not link_tag or '/anime/' not in link_tag.link: continue
                
                titulo_ele = artigo.ele('css:.title') or artigo.ele('css:h3') or artigo.ele('css:h2')
                titulo = titulo_ele.text.strip() if titulo_ele else link_tag.attr('title')
                if not titulo: continue
                
                idioma = "Dublado" if "dublado" in artigo.html.lower() or "dublado" in titulo.lower() else "Legendado"
                titulo_limpo = re.sub(r'(?i)\(dublado\)', '', titulo).strip()
                
                resultados.append(AnimeResult(titulo_exibicao=f"{titulo_limpo} ({idioma})", url=link_tag.link, fonte=self.name))
            return resultados
        except Exception as e:
            print(f"Erro na busca: {e}")
            return []
        finally:
            BrowserManager.reset_page()

    def get_episodes(self, anime_url: str) -> List[Episode]:
        cache = carregar_cache_dinamico()
        
        # 1. Carrega do Cache e converte os dicionários de volta para Objetos Episode
        if anime_url in cache.get('lista_episodios', {}):
            print(f"  [Cache] Episódios lidos do disco para: {anime_url}")
            episodios_salvos = cache['lista_episodios'][anime_url]['dados']
            return [Episode(**ep) for ep in episodios_salvos]

        with nav_lock: # Adicione isso para bloquear outras threads enquanto raspa!
            page = BrowserManager.get_page()
            try:
                page.get(anime_url, retry=2, timeout=15) 
                self._wait_for_cloudflare(page)
                
                episodios = []
                links = page.eles('css:.episodios li a', timeout=1) or page.eles('css:#seasons a', timeout=1)
                
                for a in links:
                    href = a.link
                    if 'episodio' not in href: continue
                    
                    match = re.search(r'episodio[s]?[-_]?(\d+)', href, re.IGNORECASE)
                    numero = match.group(1) if match else "0"
                    
                    # === O LADRÃO DE THUMBNAILS ===
                    thumbnail = ""
                    try:
                        li_pai = a.parent('li')
                        img_tag = li_pai.ele('css:img') if li_pai else None
                        if not img_tag:
                            img_tag = a.ele('css:img')
                        if img_tag and img_tag.attr('src'):
                            thumbnail = img_tag.attr('src')
                    except:
                        pass
                    
                    # Adiciona como um Objeto Oficial Episode!
                    episodios.append(Episode(numero=numero, url=href, thumbnail=thumbnail))
                    
                episodios.sort(key=lambda x: int(x.numero) if str(x.numero).isdigit() else 0)
                
                # 2. Salva na gaveta transformando os objetos em dicionários para o JSON
                if episodios:
                    dados_para_salvar = [{"numero": ep.numero, "url": ep.url, "thumbnail": getattr(ep, 'thumbnail', '')} for ep in episodios]
                    salvar_no_cache_dinamico('lista_episodios', anime_url, dados_para_salvar)
                    
                return episodios
            except Exception as e:
                print(f"Erro ao listar episódios: {e}")
                return []
            finally:
                BrowserManager.reset_page()

        

    def extract_links(self, episode_url: str) -> Dict[str, str]:
        print(f"\n=== INICIANDO EXTRAÇÃO BLINDADA DO ANIMESDRIVE ===")
        
        # === 1. TENTA LER DA GAVETA DE LINKS ===
        cache = carregar_cache_dinamico()
        if episode_url in cache.get('links_de_video', {}):
            print("  [Cache] Links resgatados da memória instantaneamente!")
            return cache['links_de_video'][episode_url]['dados']
        # ========================================

        page = BrowserManager.get_page()
        links_encontrados = {}
        
        
        try:
            page.get(episode_url, retry=3, timeout=20)
            self._wait_for_cloudflare(page)
            
            seletor = None
            for sel in ['css:.dooplay_player_option', 'css:[data-post][data-nume]', 'css:#playeroptionsul li', 'css:.options li']:
                # === CORTANDO A ESPERA FANTASMA ===
                if page.eles(sel, timeout=1): 
                    seletor = sel
                    break
                    
            if not seletor:
                print("Nenhum botão de servidor encontrado.")
                return {}
                
            embeds_para_vasculhar = []
            botoes = page.eles(seletor)
            
            # 1. COLETA TODOS OS IFRAMES ANTES DE NAVEGAR (Sua lógica genial do CLI)
            for i in range(len(botoes)):
                try:
                    botoes_atualizados = page.eles(seletor)
                    if i >= len(botoes_atualizados): break 
                    opcao = botoes_atualizados[i]
                    nome_servidor = opcao.text.strip().upper() or f"OPÇÃO {i+1}"
                    
                    opcao.click(by_js=True)
                    time.sleep(2) 
                    
                    iframes = page.eles('css:iframe')
                    for iframe in iframes:
                        src = iframe.attr('src')
                        if src and "youtube" not in src:
                            if src not in [e[1] for e in embeds_para_vasculhar]: 
                                embeds_para_vasculhar.append((nome_servidor, src))
                                break 
                except Exception: pass

            if embeds_para_vasculhar:
                page.listen.start(['.mp4', '.m3u8'])
                
                # 2. ORDENAÇÃO ESTRATÉGICA
                def peso(n):
                    n = n.upper()
                    if "DUBLADO" in n: return 1 
                    if "FULLHD" in n or "HLS" in n: return 2
                    if "FHD" in n: return 3
                    if "HD" in n: return 4
                    if "SD" in n: return 5
                    return 6
                    
                embeds_para_vasculhar.sort(key=lambda x: peso(x[0]))
                
                for nome, embed in embeds_para_vasculhar:
                    nome_upper = nome.upper()
                    if "MOBILE" in nome_upper or "CELULAR" in nome_upper: continue
                        
                    link_final = ""
                    
                    try:
                        if "jwplayer?source=" in embed:
                            print(f"  -> Descriptografando JWPlayer ({nome})...")
                            match = re.search(r'source=([^&]+)', embed)
                            if match:
                                link_bruto = urllib.parse.unquote(match.group(1))
                                link_final = link_bruto.lstrip('+ ')
                                print(f"  -> [{nome}] JWPlayer decodificado com sucesso!")

                        elif "http" in embed:
                            print(f"  -> Infiltrando no servidor {nome}...")
                            page.get(embed) # Navega na mesma aba! Preserva os cookies da Cloudflare da página mãe!
                            time.sleep(0.5)
                            
                            html_pagina = page.html
                            match = re.search(r'(?:file|src|url|source)\s*[:=]\s*(["\'])(https?://[^\1]+?\.(?:mp4|m3u8)[^\1]*)\1', html_pagina, re.IGNORECASE)
                            if match and "blob:" not in match.group(2):
                                link_final = match.group(2).replace('\\/', '/')
                                print(f"  -> [{nome}] Link capturado via Raio-X HTML!")
                                
                            if not link_final:
                                print(f"  -> [{nome}] Raio-X falhou. Tentando forçar o Play...")
                                try: 
                                    btn_play = page.ele('css:.plyr__control--overlaid, .vjs-big-play-button, .jw-icon-display, .play-button')
                                    if btn_play:
                                        btn_play.click(by_js=True)
                                        time.sleep(0.5)
                                        btn_play.click(by_js=True) 
                                    else:
                                        corpo = page.ele('css:body')
                                        for _ in range(3):
                                            if corpo: corpo.click()
                                            time.sleep(0.5)
                                except Exception: pass
                                    
                                pacote = page.listen.wait(timeout=5)
                                if pacote:
                                    link_final = pacote.url
                                    print(f"  -> [{nome}] Pacote interceptado pela rede.")
                                
                    except Exception as e_sniff:
                        print(f"  -> Erro interno no servidor {nome}: {e_sniff}")

                    if link_final:
                        info = obter_info_video(link_final)
                        if info == "Info Indisponível":
                            nome_unico = f"{nome} [Indisponível]"
                            link_final = "" # Anula o link
                        else:
                            nome_unico = f"{nome} [{info}]"
                    else:
                        nome_unico = f"{nome} [Indisponível]"
                        link_final = "" 
                        
                    contador = 2
                    nome_base = nome_unico
                    while nome_unico in links_encontrados:
                        nome_unico = f"{nome_base} v{contador}"
                        contador += 1
                        
                    links_encontrados[nome_unico] = link_final
            
            # === A MATEMÁTICA GENIAL DO SLIME_SHELL ===
            def extrair_peso_qualidade(nome_servidor):
                nome_upper = nome_servidor.upper()
                if "INDISPONÍVEL" in nome_upper: return -99999.0
                
                pontuacao = 0.0
                if "FULLHD" in nome_upper: pontuacao += 50000 # FULLHD sempre será o Rei absoluto
                elif "HLS" in nome_upper: pontuacao += 40000
                elif "FHD" in nome_upper: pontuacao += 30000
                elif "HD" in nome_upper: pontuacao += 10000
                
                # Desempates de peso
                match_mb = re.search(r'\[(\d+)\s*MB\]', nome_upper)
                if match_mb: pontuacao += float(match_mb.group(1))
                
                match_mbps = re.search(r'\[~(\d+(?:\.\d+)?)\s*MBPS\]', nome_upper)
                if match_mbps: pontuacao += float(match_mbps.group(1)) * 180
                
                if "DUBLADO" in nome_upper: pontuacao += 1000
                return pontuacao

            lista_servidores = []
            for nome_servidor, link in links_encontrados.items():
                
                score = extrair_peso_qualidade(nome_servidor)
                
                # Se o Python já souber que o link quebrou na extração, marca como Indisponível
                if not link: 
                    score = -99999.0
                    if "[Indisponível]" not in nome_servidor:
                        nome_servidor = f"{nome_servidor} [Indisponível]"
                        
                lista_servidores.append((nome_servidor, link, score))
                
            # Ordena garantindo que a maior pontuação fique no topo
            lista_servidores.sort(key=lambda x: x[2], reverse=True)
            
            # === 2. SALVA OS LINKS NA GAVETA ANTES DE DEVOLVER ===
            dict_retorno = {nome: link for nome, link, score in lista_servidores}
            if dict_retorno:
                salvar_no_cache_dinamico('links_de_video', episode_url, dict_retorno)
            
            return dict_retorno
            
        except Exception as e:
            print(f"\n[!] ERRO DETALHADO NO ANIMESDRIVE:")
            import traceback
            traceback.print_exc()
            return {}
        finally:
            try: page.listen.stop()
            except: pass
            BrowserManager.reset_page()