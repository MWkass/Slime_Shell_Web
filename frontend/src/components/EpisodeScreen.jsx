import { useState, useEffect } from 'react';

// === CONSTANTES E HELPERS GLOBAIS ===
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const calculateTimeRemaining = (progresso, tempoParado) => {
  const estimativaTotalSegundos = progresso > 10 ? (tempoParado * 100) / progresso : 1440;
  return Math.max(1, Math.ceil((estimativaTotalSegundos - tempoParado) / 60));
};

const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

export default function EpisodeScreen({ anime, onBack }) {
  const [episodes, setEpisodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. COMEÇA JÁ COM A IMAGEM DA BUSCA/HISTÓRICO! Nunca começa vazio.
  const [animeInfo, setAnimeInfo] = useState({ 
    poster: anime.poster || anime.imagem || null, 
    cover: anime.cover || anime.imagem || null, 
    synopsisEN: 'Sincronizando dados...', 
    synopsisPT: 'Sincronizando dados...' 
  });
  
  const [showTranslated, setShowTranslated] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  const [history, setHistory] = useState([]);
  const [playingEp, setPlayingEp] = useState(null);
  const [serverModal, setServerModal] = useState(null);
  const [linkCache, setLinkCache] = useState({});

  const tituloExibicaoLimpo = anime.titulo_exibicao.replace(/\(Dublado\)|\(Legendado\)/gi, '').trim();

  useEffect(() => {
    // 1. Criamos a função de buscar o histórico separadamente
    const carregarHistorico = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/history`);
        const data = await res.json();
        setHistory(data);
      } catch (error) {
        console.error("Erro no histórico:", error);
      }
    };

    // 2. EXECUTAMOS IMEDIATAMENTE (Acaba com o delay!)
    carregarHistorico();

    // 3. Mantemos o intervalo para atualizar o progresso em tempo real (enquanto o vídeo toca no MPV)
    const intervalId = setInterval(carregarHistorico, 500);

    // Função 1: Carrega os episódios (Rápido se estiver no cache)
    const carregarEpisodios = async () => {
      try {
        const resEps = await fetch(`${API_BASE_URL}/episodes?url=${encodeURIComponent(anime.url)}&provider=${anime.fonte}`);
        const dataEps = await resEps.json();
        const epsOrdenados = (dataEps.episodios || []).sort((a, b) => parseFloat(a.numero) - parseFloat(b.numero));
        setEpisodes(epsOrdenados);
      } catch (error) {
        console.error("Erro nos episódios:", error);
      } finally {
        setIsLoading(false); // Libera a tela de "Sincronizando" assim que os eps chegam
      }
    };

    // Função 2: Carrega Metadados (Lento, pois consulta APIs externas)
    const carregarMetadata = async () => {
      try {
        const resMeta = await fetch(`${API_BASE_URL}/metadata?title=${encodeURIComponent(tituloExibicaoLimpo)}`);
        const dataMeta = await resMeta.json();
        if (dataMeta.sucesso && dataMeta.dados) {
          setAnimeInfo(prev => ({
            poster: prev.poster || dataMeta.dados.poster,
            cover: prev.cover || prev.poster || dataMeta.dados.cover || dataMeta.dados.poster,
            synopsisEN: dataMeta.dados.synopsisEN || "Sinopse não disponível.",
            synopsisPT: dataMeta.dados.synopsisPT || "Sinopse não disponível."
          }));
        }
      } catch (error) {
        console.error("Erro na metadata:", error);
      }
    };

    carregarEpisodios();
    carregarMetadata();

    return () => clearInterval(intervalId);
  }, [anime, tituloExibicaoLimpo]);

  const maxEpDisponivel = episodes.length > 0 ? Math.max(...episodes.map(e => parseFloat(e.numero))) : 0;

  const fundoExibicao = animeInfo.cover || anime.cover || null;
  const posterExibicao = animeInfo.poster || anime.imagem || null;

  // O DETECTOR
  const isFallbackBanner = fundoExibicao === posterExibicao;

  // === HELPER: DISPARADOR DO PLAYER (DRY & Desacoplamento) ===
  const handlePlayEpisode = async (ep, isContinuing, tempoParado) => {
    if (playingEp) return;
    setPlayingEp(ep.numero);

    try {
      let linksDoEpisodio = linkCache[ep.numero];

      if (!linksDoEpisodio) {
        const resLinks = await fetch(`${API_BASE_URL}/links?url=${encodeURIComponent(ep.url)}&provider=${anime.fonte}`);
        const dataLinks = await resLinks.json();

        if (dataLinks.sucesso && Object.keys(dataLinks.links).length > 0) {
          linksDoEpisodio = dataLinks.links;
          setLinkCache(prev => ({ ...prev, [ep.numero]: linksDoEpisodio }));
        } else {
          alert("Nenhum link encontrado.");
          setPlayingEp(null);
          return;
        }
      }

      const executePlay = async (url) => {
        setServerModal(null);
        setPlayingEp(ep.numero);
        try {
          await fetch(`${API_BASE_URL}/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url_video: url,
              titulo: `${tituloExibicaoLimpo} - EP ${ep.numero}`,
              referer: anime.fonte === 'AnimeFire' ? 'https://animefire.io/' : (anime.fonte === 'AnimesDrive' ? 'https://animesdrive.online/' : ''),
              anime_titulo: tituloExibicaoLimpo,
              ep_numero: ep.numero.toString(),
              fonte: anime.fonte,
              poster: posterExibicao || "https://via.placeholder.com/150",
              cover: fundoExibicao || posterExibicao || "https://via.placeholder.com/150",
              tempo_inicial: isContinuing ? tempoParado : 0,
              anime_url: anime.url
            })
          });
          setTimeout(() => setPlayingEp(null), 4000);
        } catch (e) { setPlayingEp(null); }
      };

      const chaves = Object.keys(linksDoEpisodio);
      if (chaves.length === 1) executePlay(linksDoEpisodio[chaves[0]]);
      else {
        setServerModal({
          titulo: `Episódio ${ep.numero}`,
          links: linksDoEpisodio,
          onSelect: executePlay,
          onClose: () => { setServerModal(null); setPlayingEp(null); }
        });
      }
    } catch (e) { alert("Erro de conexão."); setPlayingEp(null); }
  };

  return (
    <div className="w-full min-h-screen animate-in fade-in duration-500 bg-background flex flex-col -mt-8 -mx-8 w-[calc(100%+4rem)] overflow-x-hidden">

      <button
        onClick={() => {
          fetch(`${API_BASE_URL}/reset`, { method: 'POST' }).catch(e => console.error(e));
          onBack();
        }}
        className="fixed top-6 left-6 z-50 bg-background/60 hover:bg-cyanNeon text-cyanNeon hover:text-background p-3 rounded-full backdrop-blur-md border border-cyanNeon/30 hover:border-cyanNeon transition-all duration-300 shadow-[0_0_15px_rgba(0,255,255,0.2)]"
      >
        <ArrowLeftIcon />
      </button>

      {/* === BANNER IMERSIVO & 3D FALLBACK === */}
      {/* O [perspective:2000px] cria a "câmera" 3D para os elementos filhos */}
      <div className="relative w-full h-[50vh] md:h-[65vh] flex-shrink-0 flex items-center overflow-hidden border-none bg-background [perspective:2000px]">

        {/* FUNDO: Blur Extremo se for Fallback, ou Limpo se for Banner Oficial */}
        {fundoExibicao && (
          <img
            src={fundoExibicao}
            alt="Background"
            className={`absolute inset-0 w-full h-full object-cover z-0 transition-all duration-1000 blur-[5px] opacity-40 scale-125 object-center`}
          />
        )}

        {/* DEGRADÊS PARA INTEGRAR O FUNDO AO SITE */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent z-1" />
        <div className={`absolute inset-0 z-1 ${isFallbackBanner ? 'bg-gradient-to-r from-background/80 via-background/20 to-transparent' : 'bg-gradient-to-r from-background via-background/60 to-transparent md:w-2/3'}`} />
        <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-background to-transparent z-2" />

        {/* CONTAINER DO CONTEÚDO COM [transform-style:preserve-3d] */}
        <div className="relative z-10 w-full px-8 md:px-12 md:pl-24 flex flex-col md:flex-row items-center justify-start gap-12 mt-12 [transform-style:preserve-3d]">

          {/* PÔSTER 3D */}
          {posterExibicao && (
            <div className="hidden md:block shrink-0 transition-all duration-1000 ease-out group w-56 lg:w-64">
              <img
                src={posterExibicao}
                alt="Poster"
                className="w-full h-full object-cover rounded-xl border border-cyanNeon/40 shadow-[20px_20px_60px_rgba(0,0,0,0.9),0_0_30px_rgba(0,255,255,0.2)]"
              />
            </div>
          )}

          {/* INFORMAÇÕES (TÍTULO E SINOPSE) - VIDRO HOLOGRÁFICO SE FOR FALLBACK */}
          <div className={`flex-1 w-full max-w-6xl flex flex-col transition-all duration-1000 ease-out ${isExpanded ? 'min-h-[320px] lg:min-h-[360px]' : 'h-[320px] lg:h-[360px] overflow-hidden'} bg-black/30 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,255,0.05)] [transform:translateZ(60px)] hover:[transform:translateZ(80px)]`}>
            
            {/* 2. Adicionado 'shrink-0' para a fonte e o título não serem espremidos */}
            <span className="inline-block self-start shrink-0 px-3 py-1 mb-4 border border-cyanNeon/50 bg-cyanNeon/10 text-cyanNeon text-[10px] font-bold tracking-widest uppercase rounded shadow-[0_0_10px_rgba(0,255,255,0.1)]">
              FONTE: {anime.fonte}
            </span>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] leading-tight tracking-tighter italic shrink-0">
              {tituloExibicaoLimpo}
            </h1>

            {/* 3. Container da Sinopse: Adicionado 'flex-1 min-h-0'. Ele vai absorver o impacto e diminuir caso o título seja enorme */}
            <div className="mt-4 flex flex-col items-start gap-4 flex-1 min-h-0 overflow-hidden">
              <p className={`text-textSecondary/90 text-sm md:text-base leading-relaxed drop-shadow-md transition-all duration-500 border-l-2 border-cyanNeon/30 pl-4 ${isExpanded ? '' : 'line-clamp-2'}`}>
                {showTranslated ? animeInfo.synopsisPT : animeInfo.synopsisEN}
              </p>
            </div>

            {/* 4. Container dos Botões SEPARADO: Adicionado 'mt-auto' e 'shrink-0' para ancorar no fundo com espaçamento perfeito */}
            <div className="flex flex-wrap items-center gap-6 mt-auto pt-4 shrink-0">
              <button onClick={() => setIsExpanded(!isExpanded)} className="text-[10px] uppercase tracking-widest text-cyanNeon hover:text-white font-bold transition-colors">
                {isExpanded ? '[-] Retrair Card' : '[+] Expandir Dados'}
              </button>
              <button onClick={() => setShowTranslated(!showTranslated)} className="text-[10px] uppercase tracking-widest text-textSecondary hover:text-cyanNeon font-bold flex items-center gap-1 transition-colors">
                {showTranslated ? '➔ Ver Original (Inglês)' : '➔ Usar Tradução (PT-BR)'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-8 md:px-12 md:pl-24 py-8 relative z-20">
        <h3 className="text-2xl font-bold text-textPrimary mb-8 border-l-4 border-cyanNeon pl-4">
          Episódios Disponíveis
        </h3>

        {isLoading ? (
          <div className="flex gap-3 items-center text-cyanNeon font-mono text-sm">
            <div className="w-4 h-4 border-2 border-cyanNeon border-t-transparent rounded-full animate-spin"></div>
            [ SINCRONIZANDO COM A FONTE... ]
          </div>
        ) : episodes.length === 0 ? (
          <div className="text-textSecondary font-mono text-sm border border-textSecondary/30 px-4 py-3 rounded-lg inline-block">
            [ NENHUM EPISÓDIO ENCONTRADO ]
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12 w-full">
            {episodes.map((ep) => {

              // === NOVA LÓGICA DO HISTÓRICO ===
              // Pega o registro ÚNICO desse anime no histórico
              const currentAnimeRecord = history.find(h => h.titulo === tituloExibicaoLimpo);
              const maxEpNoHistorico = currentAnimeRecord ? parseFloat(currentAnimeRecord.ep) : 0;
              const epNum = parseFloat(ep.numero);
              
              // Verifica se o episódio renderizado agora é o exato episódio que está pausado
              const historyData = (currentAnimeRecord && parseFloat(currentAnimeRecord.ep) === epNum) ? currentAnimeRecord : null;

              let progresso = historyData ? historyData.progresso : (epNum < maxEpNoHistorico ? 100 : 0);
              let tempoParado = historyData ? (historyData.tempo || 0) : 0;

              const isWatched = progresso === 100;
              const isContinuing = progresso > 0 && progresso < 100;
              const isPlaying = playingEp === ep.numero;
              const isNewEpisode = (epNum === maxEpDisponivel) && (maxEpNoHistorico === maxEpDisponivel - 1) && (maxEpNoHistorico > 0);

              let cardClasses = 'relative flex flex-col bg-surface border rounded-xl overflow-hidden transition-all duration-300 cursor-pointer group ';
              if (isPlaying) cardClasses += `border-cyanNeon shadow-[0_0_20px_rgba(0,255,255,0.4)] animate-pulse`;
              else if (isWatched) cardClasses += 'border-green-500/30 hover:border-green-400/80 bg-green-900/5';
              else if (isContinuing) cardClasses += 'border-yellow-500/50 hover:border-yellow-400 bg-yellow-900/5';
              else cardClasses += 'border-cyanNeon/20 hover:border-cyanNeon hover:-translate-y-1';

              const hasStarted = progresso > 0;
              const fallbackThumb = animeInfo.cover || posterExibicao;
              
              // === A MÁGICA DO ÁLBUM DE FOTOS ===
              let thumbDoAlbum = null;
              // 1. Tenta buscar a foto específica desse episódio no álbum
              if (currentAnimeRecord && currentAnimeRecord.screenshots_album) {
                  thumbDoAlbum = currentAnimeRecord.screenshots_album[ep.numero];
              }
              // 2. Se não achar no álbum (arquivos antigos), tenta a foto principal
              if (!thumbDoAlbum && historyData && historyData.screenshot_url) {
                  thumbDoAlbum = historyData.screenshot_url;
              }

              // Se o episódio já foi começado e tem foto, exibe. Senão, capa oficial.
              const imagemExibicao = (hasStarted && thumbDoAlbum) ? thumbDoAlbum : fallbackThumb;

              return (
                <div key={ep.numero} onClick={() => handlePlayEpisode(ep, isContinuing, tempoParado)} className={`${cardClasses} isolate`}>

                  {/* === PARTE SUPERIOR: IMAGEM LIMPA E SPINNER NEON === */}
                  {/* Aspect-video perfeito com isolate e overflow para segurar a imagem no zoom */}
                  <div className="relative w-full aspect-[2.5] shrink-0 bg-background overflow-hidden border-b border-cyanNeon/20 rounded-t-xl isolate">
                    <img
                      src={imagemExibicao}
                      alt={`Episódio ${ep.numero}`}
                      onError={(e) => { e.target.onerror = null; e.target.src = fallbackThumb; }}
                      className="w-full h-full object-cover object-center transition-all duration-700 opacity-70 group-hover:opacity-100 group-hover:scale-105"
                    />

                    {/* Tag de Lançamento Flutuante */}
                    {isNewEpisode && (
                      <div className="absolute top-2 left-2 z-20">
                        <span className="bg-cyanNeon text-background text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-[0_0_10px_#00FFFF]">
                          NOVO
                        </span>
                      </div>
                    )}

                    {/* Loading Spinner idêntico ao Quick Play da Home */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-opacity z-30 ${isPlaying ? 'opacity-100 bg-background/50 backdrop-blur-sm' : 'opacity-0 pointer-events-none'}`}>
                      <div className="bg-background/80 p-2 rounded-full backdrop-blur-sm border border-cyanNeon">
                        <div className="w-5 h-5 border-2 border-cyanNeon border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    </div>
                  </div>

                  {/* === PARTE INFERIOR: TEXTO MINIMALISTA E TEMPO RESTANTE === */}
                  <div className="p-3 md:p-4 flex flex-col flex-1 min-w-0 pb-3 justify-center bg-surface">
                    <div className="flex items-center justify-between mb-1.5">
                      
                      {/* Feedback Visual: Abrindo, Assistido, Continuar ou Assistir */}
                      {isPlaying ? (
                        <span className="text-[10px] text-cyanNeon font-bold uppercase drop-shadow-[0_0_5px_rgba(0,255,255,0.5)] animate-pulse tracking-widest">
                          ABRINDO NO PLAYER...
                        </span>
                      ) : (
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isWatched ? 'text-green-400' : isContinuing ? 'text-yellow-400' : 'text-cyanNeon'}`}>
                          {isWatched ? '✓ ASSISTIDO' : isContinuing ? '▶ CONTINUAR' : 'ASSISTIR'}
                        </span>
                      )}

                      {/* Lógica Matemática do Tempo Restante (Exatamente igual a Home) */}
                      {!isPlaying && isContinuing && (() => {
                        const minutosRestantes = calculateTimeRemaining(progresso, tempoParado);
                        return (
                          <span className="text-[9px] text-textSecondary uppercase tracking-widest font-bold">
                            {progresso > 90 ? 'Finalizando...' : `Restam ${minutosRestantes} min`}
                          </span>
                        );
                      })()}
                    </div>
                    
                    <h4 className={`text-sm font-bold line-clamp-1 transition-colors ${isPlaying ? 'text-cyanNeon' : isWatched ? 'text-green-400' : isContinuing ? 'text-yellow-400' : 'text-textPrimary group-hover:text-cyanNeon'}`}>
                      Episódio {ep.numero}
                    </h4>
                  </div>

                  {/* === BARRA DE PROGRESSO COLORIDA === */}
                  {isContinuing && !isPlaying && (
                    <div className="absolute bottom-0 left-0 w-full h-[3px] bg-background z-20">
                      <div className="h-full bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)] transition-all duration-500" style={{ width: `${progresso}%` }}></div>
                    </div>
                  )}

                </div>
              )
            })}
          </div>
        )}
      </div>

      {serverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-cyanNeon/30 rounded-xl p-6 max-w-md w-full shadow-[0_0_30px_rgba(0,255,255,0.15)] flex flex-col gap-4">
            <div className="flex justify-between items-center mb-2 border-b border-cyanNeon/20 pb-3">
              <h3 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-cyanNeon rounded-full animate-pulse"></span> Servidores
              </h3>
              <button onClick={serverModal.onClose} className="text-textSecondary hover:text-red-400">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-background [&::-webkit-scrollbar-thumb]:bg-cyanNeon/50">
              {Object.entries(serverModal.links).filter(([_, url]) => Boolean(url)).map(([nome, url], index) => (
                <button key={index} onClick={() => serverModal.onSelect(url)} className="flex items-center justify-between p-3 rounded-lg border border-cyanNeon/20 bg-cyanNeon/5 hover:bg-cyanNeon hover:text-background transition-all group">
                  <span className="font-bold text-sm text-cyanNeon group-hover:text-background">{nome}</span>
                </button>
              )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}