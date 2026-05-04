import os
import re
import random
import subprocess
import requests
import base64
from dotenv import load_dotenv

# Carrega as variáveis do arquivo .env
load_dotenv()

IMGBB_KEY = os.getenv("IMGBB_API_KEY")

CAMINHO_ATUAL = os.path.abspath(os.path.dirname(__file__))
PASTA_SHADERS = os.path.join(CAMINHO_ATUAL, 'shaders')
USER_AGENT_PADRAO = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# === MÓDULOS DE PREPARAÇÃO DO MPV ===
def _obter_argumentos_anime4k() -> list:
    shader_args = []
    if os.path.exists(PASTA_SHADERS):
        arquivos_glsl = os.listdir(PASTA_SHADERS)
        shaders_selecionados = []
        
        for prefixo in ['restore_cnn', 'darken', 'upscale_cnn_x2']:
            for sufixo in ['_vl.glsl', '_l.glsl', '_m.glsl', '_s.glsl', 'hq.glsl', '.glsl']:
                encontrado = [f for f in arquivos_glsl if prefixo in f.lower() and f.lower().endswith(sufixo)]
                if encontrado:
                    shaders_selecionados.append(os.path.join(PASTA_SHADERS, encontrado[0]))
                    break 
                    
        if shaders_selecionados:
            shader_args = [f"--glsl-shaders={':'.join(shaders_selecionados)}"]
            print(f"  [!] Anime4K Ativado ({len(shaders_selecionados)} shaders injetados).")
    return shader_args

def _preparar_arquivos_mpv():
    arquivo_capitulos = os.path.join(CAMINHO_ATUAL, 'temp_chapters.txt')
    with open(arquivo_capitulos, 'w', encoding='utf-8') as f:
        f.write("CHAPTER01=00:00:00.000\nCHAPTER01NAME=Início\nCHAPTER02=00:01:30.000\nCHAPTER02NAME=Pós-Abertura (P)\n")
        
    arquivo_teclas = os.path.join(CAMINHO_ATUAL, 'temp_input.conf')
    with open(arquivo_teclas, 'w', encoding='utf-8') as f:
        f.write("p seek 90 exact\n")
        
    return arquivo_capitulos, arquivo_teclas

# === MÓDULOS DO FOTÓGRAFO (FFMPEG & IMGBB) ===
def _upar_para_imgbb(caminho_imagem: str) -> str:
    try:
        with open(caminho_imagem, "rb") as file:
            payload = {
                "key": IMGBB_KEY,
                "image": base64.b64encode(file.read()),
            }
            res = requests.post("https://api.imgbb.com/1/upload", data=payload)
            if res.status_code == 200:
                url = res.json()["data"]["url"]
                print(f"  [+] Nuvem Sucesso! URL: {url}")
                return url
            else:
                print(f"  [-] Falha na nuvem: {res.text}")
    except Exception as e:
        print(f"  [-] Erro fatal no upload: {e}")
    return None

def _capturar_screenshot(url_video: str, referer: str, titulo: str, tempo_da_foto: int, progresso: int) -> str:
    print(f"  Buscando a melhor cena a partir do segundo {tempo_da_foto}...")
    try:
        titulo_so_do_anime = titulo.split(' - EP')[0]
        nome_limpo = re.sub(r'[^a-zA-Z0-9]', '_', titulo_so_do_anime.lower())
        
        match_ep = re.search(r' - EP (\d+(?:\.\d+)?)', titulo)
        num_ep = match_ep.group(1) if match_ep else "0"
        
        nome_arquivo = f"{nome_limpo}_ep_{num_ep}.jpg"
        pasta_screenshots = os.path.join(CAMINHO_ATUAL, 'screenshots')
        os.makedirs(pasta_screenshots, exist_ok=True)
        caminho_imagem = os.path.join(pasta_screenshots, nome_arquivo)
        
        comando_ffmpeg = [
            "ffmpeg", "-y", 
            "-ss", str(tempo_da_foto),
            "-user_agent", USER_AGENT_PADRAO
        ]
        if referer:
            comando_ffmpeg.extend(["-headers", f"Referer: {referer}"])
            
        comando_ffmpeg.extend([
            "-i", url_video, 
            "-vf", "thumbnail=n=100", 
            "-vframes", "1", 
            "-q:v", "2",     
            caminho_imagem   
        ])
        
        subprocess.run(comando_ffmpeg, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)
        
        if os.path.exists(caminho_imagem):
            if progresso >= 95:
                print(f"  [+] Episódio concluído! Subindo foto permanente para a nuvem...")
                url_nuvem = _upar_para_imgbb(caminho_imagem)
                try: os.remove(caminho_imagem)
                except: pass
                return url_nuvem
            else:
                print(f"  [+] Episódio pausado. Usando foto local: {nome_arquivo}")
                return f"http://127.0.0.1:8000/screenshots/{nome_arquivo}"
        else:
            print(f"  [-] FFmpeg não gerou o arquivo: {caminho_imagem}")
    except Exception as e:
        print(f"  [-] Falha ao tirar a foto: {e}")
        
    return None

# === FUNÇÃO PRINCIPAL ORQUESTRADORA ===
def reproduzir_video_mpv(url_video: str, titulo: str, referer: str = None, tempo_inicial: int = 0):
    print(f"\n  [!] Link de vídeo obtido! Preparando Injeções do MPV...")
    
    shader_args = _obter_argumentos_anime4k()
    arquivo_capitulos, arquivo_teclas = _preparar_arquivos_mpv()
        
    comando_mpv = ["mpv", url_video, "--fs", f"--force-media-title={titulo}", "--cache=yes", "--demuxer-max-bytes=400M", "--cache-pause=no", "--vo=gpu-next", "--gpu-api=vulkan", "--hwdec=auto-safe", "--profile=gpu-hq", f"--chapters-file={arquivo_capitulos}", f"--input-conf={arquivo_teclas}"]    
    
    if referer: comando_mpv.append(f"--http-header-fields=Referer: {referer}")
    
    comando_mpv.append(f"--user-agent={USER_AGENT_PADRAO}")
    
    if tempo_inicial > 0: comando_mpv.append(f"--start={tempo_inicial}")

    mpv_cinema_configs = [
        "--saturation=18",        
        "--contrast=6",           
        "--gamma=-2",             
        "--deband=yes", "--deband-iterations=2", "--deband-threshold=35", "--deband-range=16", "--deband-grain=5",
        "--scale=ewa_lanczossharp", "--cscale=ewa_lanczossoft", 
        "--sigmoid-upscaling=yes", 
        "--video-sync=display-resample", "--interpolation=yes", "--tscale=oversample"
    ]
    
    comando_mpv.extend(shader_args + mpv_cinema_configs)
    
    processo = subprocess.Popen(comando_mpv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, universal_newlines=True)
    
    tempo_parado, tempo_total = 0, 0
    maior_tempo_total = 0 # Escudo contra Glitches de fechamento do MPV
    
    for linha in processo.stdout:
        # A MÁGICA: Imprime TUDO que o MPV falar no terminal
        print(f"MPV DEBUG: {linha.strip()}") 
        
        match = re.search(r'[AVV]:\s*(\d{2}):(\d{2}):(\d{2})\s*/\s*(\d{2}):(\d{2}):(\d{2})', linha)
        if match:
            h, m, s, h_tot, m_tot, s_tot = match.groups()
            t_parado_atual = int(h) * 3600 + int(m) * 60 + int(s)
            t_total_atual = int(h_tot) * 3600 + int(m_tot) * 60 + int(s_tot)
            
            # BLINDAGEM 1: Se o MPV bugar a duração total na hora de fechar, nós ignoramos!
            if t_total_atual > maior_tempo_total:
                maior_tempo_total = t_total_atual
                
            tempo_parado = t_parado_atual
            tempo_total = maior_tempo_total
            
    processo.wait()
    
    for f in [arquivo_capitulos, arquivo_teclas]:
        if os.path.exists(f): os.remove(f)
        
    # CÁLCULO DE PROGRESSO EXATO
    progresso = 0
    if tempo_total > 0:
        progresso = int((tempo_parado / tempo_total) * 100)
        
        # BLINDAGEM 2: Exige que o vídeo tenha mais de 5 minutos (300s) para aplicar a regra dos 90s finais.
        # Isso impede que bugs de playlist M3U8 forcem o progresso para 100% prematuramente.
        if tempo_total > 300 and (tempo_total - tempo_parado) <= 90:
            progresso = 100
        elif progresso >= 95:
            progresso = 100
            
    sucesso_reproducao = tempo_total > 0 
    
    url_imagem_local = None
    if sucesso_reproducao and tempo_parado > 5:  
        
        tempo_da_foto = tempo_parado
        if progresso >= 90 and tempo_total > 0:
            limite_inferior = int(tempo_total * 0.3)
            limite_superior = int(tempo_total * 0.7)
            tempo_da_foto = random.randint(limite_inferior, limite_superior)
            
        url_imagem_local = _capturar_screenshot(url_video, referer, titulo, tempo_da_foto, progresso)
    
    return tempo_parado, progresso, sucesso_reproducao, url_imagem_local