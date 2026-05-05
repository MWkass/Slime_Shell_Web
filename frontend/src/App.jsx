import { useState, useEffect, useRef } from 'react';
import AnimeCard from './components/AnimeCard';
import EpisodeScreen from './components/EpisodeScreen';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const JIKAN_API_URL = 'https://api.jikan.moe/v4';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [openingHistory, setOpeningHistory] = useState(null);

  const [allSeasonReleases, setAllSeasonReleases] = useState([]);
  const [displayedReleases, setDisplayedReleases] = useState([]);
  const [history, setHistory] = useState([]);

  // === ESTADOS DO RADAR DE DUBLAGEM ===
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef(null); 
  
  const [expandHistory, setExpandHistory] = useState(false);
  const [newEpisodes, setNewEpisodes] = useState({});

  // === ESTADOS DO CARD "CONTINUAR ASSISTINDO" ===
  const [activeCardMenu, setActiveCardMenu] = useState(null); 
  const [quickPlaying, setQuickPlaying] = useState(null);     
  const [serverModal, setServerModal] = useState(null); 
  
  const titulosChecados = useRef(new Set());
  const continuarRef = useRef(null);
  const concluidosRef = useRef(null);

  const rolarCarrossel = (ref, direcao) => {
    if (ref.current) {
      const scrollAmount = ref.current.clientWidth * 0.75;
      ref.current.scrollBy({ left: direcao === 'esquerda' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  // Garanta que estas duas linhas estejam aqui!
  const [showContinuarArrows, setShowContinuarArrows] = useState(false);
  const [showConcluidosArrows, setShowConcluidosArrows] = useState(false);

  // === ESTADOS DO SENSOR DE NÉVOA (MÁSCARA DO CARROSSEL) ===
  const [scrollContinuar, setScrollContinuar] = useState({ isStart: true, isEnd: false });
  const [scrollConcluidos, setScrollConcluidos] = useState({ isStart: true, isEnd: false });

  // Sensores Matemáticos (Espiões de Rolagem)
  const checkScrollContinuar = () => {
    if (continuarRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = continuarRef.current;
      setScrollContinuar({
        isStart: scrollLeft <= 10,
        isEnd: Math.ceil(scrollLeft + clientWidth) >= scrollWidth - 10
      });
    }
  };

  const checkScrollConcluidos = () => {
    if (concluidosRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = concluidosRef.current;
      setScrollConcluidos({
        isStart: scrollLeft <= 10,
        isEnd: Math.ceil(scrollLeft + clientWidth) >= scrollWidth - 10
      });
    }
  };

  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/reset', { method: 'POST' }).catch(e => console.error(e));
  }, []);

  useEffect(() => {
    const checkArrows = () => {
      if (continuarRef.current) setShowContinuarArrows(continuarRef.current.scrollWidth > continuarRef.current.clientWidth);
      if (concluidosRef.current) setShowConcluidosArrows(concluidosRef.current.scrollWidth > concluidosRef.current.clientWidth);
    };

    checkArrows();
    // Ativa os sensores de névoa sempre que o histórico ou a tela mudarem
    checkScrollContinuar();
    checkScrollConcluidos();
    
    window.addEventListener('resize', () => {
      checkArrows();
      checkScrollContinuar();
      checkScrollConcluidos();
    });
    return () => window.removeEventListener('resize', () => {
      checkArrows();
      checkScrollContinuar();
      checkScrollConcluidos();
    });
  }, [history]);

  // === INICIALIZAÇÃO DO RADAR E BUSCA DE AVISOS ===
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/radar', { method: 'POST' }).catch(() => {});

    const fetchNotifications = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/notifications');
        const data = await res.json();
        if (data.sucesso) {
          setNotifications(data.notificacoes);
          setUnreadCount(data.nao_lidas);
        }
      } catch (e) { console.error("Erro ao buscar notificações:", e); }
    };

    fetchNotifications();
    const radarInterval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(radarInterval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSeason = async () => {
      const res = await fetch('http://127.0.0.1:8000/api/trending');
      const data = await res.json();
      if (data.sucesso) {
        setAllSeasonReleases(data.resultados);
        setDisplayedReleases([...data.resultados].sort(() => 0.5 - Math.random()).slice(0, 14));
      }
    };
    fetchSeason();
    carregarHistorico();
  }, []);

  useEffect(() => {
    if (allSeasonReleases.length > 0) {
      const timerId = setInterval(() => {
        setDisplayedReleases([...allSeasonReleases].sort(() => 0.5 - Math.random()).slice(0, 14));
      }, 1200000); 
      return () => clearInterval(timerId);
    }
  }, [allSeasonReleases]);

  const carregarHistorico = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
        verificarNovosEpisodiosSilenciosamente(data);
      }
    } catch (e) { console.error("Erro histórico:", e); }
  };

  const verificarNovosEpisodiosSilenciosamente = async (historicoData) => {
    // Use for...of em vez de forEach para respeitar o await
    for (const item of historicoData) {
      const chaveTracker = `${item.titulo}_${item.ep}`;

      if (item.progresso === 100 && !titulosChecados.current.has(chaveTracker)) {
        titulosChecados.current.add(chaveTracker);

        try {
          if (item.url) {
            const resEps = await fetch(`http://127.0.0.1:8000/api/episodes?url=${encodeURIComponent(item.url)}&provider=${item.fonte}`);
            const dataEps = await resEps.json();

            const eps = (dataEps.episodios || []).sort((a, b) => parseFloat(a.numero) - parseFloat(b.numero));
            const currentEpNum = parseFloat(item.ep);
            const proxEpObj = eps.find(e => parseFloat(e.numero) > currentEpNum);

            if (proxEpObj) {
              const maxEpSite = Math.max(...eps.map(e => parseFloat(e.numero)));

              // --- MATEMÁTICA BLINDADA (Sem localStorage) ---
              const currentEpNum = parseFloat(item.ep);
              
              // É lançamento SE: 
              // 1. O próximo episódio for o último lançado no site
              // 2. O episódio que você parou for exatamente o anterior ao lançamento
              // 3. Você já assistiu pelo menos o episódio 1
              const isLancamento = (parseFloat(proxEpObj.numero) === maxEpSite) && 
                                  (currentEpNum === maxEpSite - 1) && 
                                  (currentEpNum > 0);
              // ----------------------------------------------

              setNewEpisodes(prev => ({
                ...prev,
                [item.titulo]: {
                  numero: proxEpObj.numero,
                  isLancamento: isLancamento
                }
              }));

              // Dispara a notificação apenas se a matemática confirmar que é novo[cite: 1]
              if (isLancamento) {
                fetch('http://127.0.0.1:8000/api/notifications/new_episode', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    titulo: item.titulo, 
                    ep_numero: proxEpObj.numero,
                    url_anime: item.url,
                    fonte: item.fonte
                  })
                }).catch(e => console.error("Erro ao notificar lançamento:", e));
              }
            }
          }
        } catch (e) { console.error("Falha radar:", item.titulo); }
      }
    }
  };

  useEffect(() => {
    const historyInterval = setInterval(() => {
      carregarHistorico();
    }, 500);
    return () => clearInterval(historyInterval);
  }, []);

  // === HELPER: TRADUTOR JIKAN (EXTRAÍDO PARA CLEAN CODE) ===
  const searchWithJikanFallback = async (termoPesquisa, resultadosAtuais) => {
    try {
      const jikanRes = await fetch(`${JIKAN_API_URL}/anime?q=${encodeURIComponent(termoPesquisa)}&limit=1&sfw=true`);
      if (!jikanRes.ok) return resultadosAtuais;
      
      const jikanData = await jikanRes.json();
      if (!jikanData.data || jikanData.data.length === 0) return resultadosAtuais;

      const animeData = jikanData.data[0];
      const nomeRomaji = animeData.title || "";
      const nomeIngles = animeData.title_english || "";
      const nomeCurto = nomeRomaji.split(' ').slice(0, 3).join(' ');

      const termosParaTestar = new Set();
      if (nomeCurto && nomeCurto.length > 3) termosParaTestar.add(nomeCurto);
      if (nomeIngles && nomeIngles.toLowerCase() !== termoPesquisa.toLowerCase()) termosParaTestar.add(nomeIngles);
      if (nomeRomaji && nomeRomaji.toLowerCase() !== termoPesquisa.toLowerCase()) termosParaTestar.add(nomeRomaji);

      let novosResultados = [...resultadosAtuais];
      for (const termo of termosParaTestar) {
        const termoLimpo = termo.replace(/[^a-zA-Z0-9 áéíóúãõç]/gi, '').replace(/\s+/g, ' ').trim();
        if (!termoLimpo || termoLimpo.length < 3) continue; 

        try {
          const resAlt = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(termoLimpo)}`);
          if (resAlt.ok) {
            const dataAlt = await resAlt.json();
            if (dataAlt.resultados && dataAlt.resultados.length > 0) {
              novosResultados = [...novosResultados, ...dataAlt.resultados];
              break;
            }
          }
        } catch (e) {
          console.warn(`Pulo silencioso na tentativa: ${termoLimpo}`);
        }
      }

      const vistos = new Set();
      return novosResultados.filter(anime => {
        const chave = anime.url + anime.fonte;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });
    } catch (e) {
      console.warn("Falha no Tradutor Jikan.", e);
      return resultadosAtuais;
    }
  };

  const executarBusca = async (termoPesquisa) => {
    setQuery(termoPesquisa);
    setIsLoading(true);
    setSearchAttempted(true);

    try {
      let response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(termoPesquisa)}`);
      let data = await response.json();
      let resultados = data.resultados || [];

      if (resultados.length < 2) {
        resultados = await searchWithJikanFallback(termoPesquisa, resultados);
      }

      const sorted = resultados.sort((a, b) => a.titulo_exibicao.localeCompare(b.titulo_exibicao));
      setResults(sorted);
      setIsLoading(false);

    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) executarBusca(query);
  };

  const goHome = () => {
    fetch(`${API_BASE_URL}/reset`, { method: 'POST' }).catch(e => console.error(e));

    setQuery('');
    setResults([]);
    setSearchAttempted(false);
    setSelectedAnime(null);

    carregarHistorico();
    setTimeout(carregarHistorico, 3000);
  };

  // === HELPER: LEITURA DE NOTIFICAÇÕES (DRY) ===
  const clearAnimeNotifications = (titulo) => {
    const notifsPendentes = notifications.filter(n => !n.lida && n.titulo === titulo);
    if (notifsPendentes.length > 0) {
      notifsPendentes.forEach(notif => {
        fetch(`${API_BASE_URL}/notifications/${notif.id}/read`, { method: 'POST' }).catch(() => {});
      });
      setNotifications(prev => prev.map(n => notifsPendentes.some(un => un.id === n.id) ? { ...n, lida: true } : n));
      setUnreadCount(prev => Math.max(0, prev - notifsPendentes.length));
    }
  };

  const handleHistoryClick = async (item) => {
    setOpeningHistory(item.titulo);
    clearAnimeNotifications(item.titulo);

    try {
      if (item.url) {
        setSelectedAnime({
          titulo_exibicao: item.titulo,
          url: item.url,
          fonte: item.fonte,
          poster: item.imagem,
          cover: item.cover || item.imagem
        });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(item.titulo)}`);
      const data = await response.json();
      if (data.resultados && data.resultados.length > 0) {
        const match = data.resultados.find(r => r.fonte.toLowerCase() === item.fonte.toLowerCase()) || data.resultados[0];
        if (!match.titulo_exibicao && match.titulo) match.titulo_exibicao = match.titulo;
        setSelectedAnime({ ...match, poster: item.imagem, cover: item.cover || item.imagem });
      }
    } catch (err) { console.error(err); }
    finally { setOpeningHistory(null); }
  };

  const handleQuickPlay = async (item) => {
    if (quickPlaying === item.titulo || activeCardMenu === item.titulo) return;
    setQuickPlaying(item.titulo);
    
    clearAnimeNotifications(item.titulo);

    try {
      const resEps = await fetch(`${API_BASE_URL}/episodes?url=${encodeURIComponent(item.url)}&provider=${item.fonte}`);
      const dataEps = await resEps.json();

      if (!dataEps.sucesso || !dataEps.episodios || dataEps.episodios.length === 0) {
         alert("Não foi possível carregar a lista de episódios.");
         setQuickPlaying(null);
         return;
      }

      const isNovoEpisodio = item.novoEpData !== undefined;
      const targetEpNumber = isNovoEpisodio ? item.novoEpData.numero : item.ep;
      const targetTempo = isNovoEpisodio ? 0 : (item.tempo || 0);

      const episodioExato = dataEps.episodios.find(e => parseFloat(e.numero) === parseFloat(targetEpNumber));

      if (!episodioExato) {
         alert("Episódio não encontrado na fonte.");
         setQuickPlaying(null);
         return;
      }

      const resLinks = await fetch(`${API_BASE_URL}/links?url=${encodeURIComponent(episodioExato.url)}&provider=${item.fonte}`);
      const dataLinks = await resLinks.json();

      if (dataLinks.sucesso && Object.keys(dataLinks.links).length > 0) {
        const linksDoEpisodio = dataLinks.links;
        const chaves = Object.keys(linksDoEpisodio);

        const coverLocal = item.cover || item.imagem;
        const posterLocal = item.imagem;

        const executePlay = async (url) => {
          setServerModal(null);
          try {
            await fetch(`${API_BASE_URL}/play`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url_video: url,
                titulo: `${item.titulo} - EP ${targetEpNumber}`,
                referer: item.fonte === 'AnimeFire' ? 'https://animefire.io/' : (item.fonte === 'AnimesDrive' ? 'https://animesdrive.online/' : ''),
                anime_titulo: item.titulo,
                ep_numero: targetEpNumber.toString(),
                fonte: item.fonte,
                poster: posterLocal || "https://via.placeholder.com/150",
                cover: coverLocal || "https://via.placeholder.com/150",
                tempo_inicial: targetTempo,
                anime_url: item.url
              })
            });
            setTimeout(() => setQuickPlaying(null), 3500);
          } catch (e) {
            console.error(e);
            alert("Erro de conexão ao tentar abrir o player.");
            setQuickPlaying(null);
          }
        };

        if (chaves.length === 1) {
          executePlay(linksDoEpisodio[chaves[0]]);
        } else {
          setServerModal({
            titulo: `Episódio ${targetEpNumber}`,
            links: linksDoEpisodio,
            onSelect: executePlay,
            onClose: () => { setServerModal(null); setQuickPlaying(null); }
          });
        }
      } else {
        alert("Nenhum link encontrado para reprodução rápida.");
        setQuickPlaying(null);
      }
    } catch (e) {
      console.error(e);
      alert("Erro de rede ao tentar abrir o player.");
      setQuickPlaying(null);
    }
  };

  const handleNotificationClick = async (notif) => {
    fetch(`${API_BASE_URL}/notifications/${notif.id}/read`, { method: 'POST' }).catch(() => {});
    
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, lida: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    setShowNotifications(false); 

    if (notif.resultados && notif.resultados.length === 1) {
      setSelectedAnime(notif.resultados[0]);
    } else if (notif.resultados && notif.resultados.length > 1) {
      setQuery(`Dublagens: ${notif.titulo}`);
      setResults(notif.resultados);
      setSelectedAnime(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleClearNotifications = async () => {
    fetch(`${API_BASE_URL}/notifications/clear`, { method: 'POST' }).catch(() => {});
    setNotifications([]);
    setUnreadCount(0);
  };

  if (selectedAnime) {
    return (
      <div className="min-h-screen flex flex-col items-center">
        <EpisodeScreen anime={selectedAnime} onBack={goHome} />
      </div>
    );
  }

  const continuarAssistindo = [];
  const concluidos = [];

  history.forEach(item => {
    let novoEpData = newEpisodes[item.titulo];

    if (novoEpData && parseFloat(item.ep) >= parseFloat(novoEpData.numero)) {
      novoEpData = undefined;
    }

    if (item.progresso < 100 || novoEpData) {
      continuarAssistindo.push({ ...item, novoEpData: novoEpData });
    } else {
      concluidos.push(item);
    }
  });

  continuarAssistindo.sort((a, b) => {
    const aLanc = a.novoEpData?.isLancamento;
    const bLanc = b.novoEpData?.isLancamento;
    if (aLanc && !bLanc) return -1;
    if (!aLanc && bLanc) return 1;
    return 0;
  });

  const showBanner = !selectedAnime && results.length === 0 && (!searchAttempted || isLoading);

  return (
    <div className="min-h-screen w-full flex flex-col overflow-x-hidden font-mono bg-background pb-12">

      <header className={`fixed top-0 left-0 w-full z-40 px-6 md:px-12 xl:px-24 py-4 flex flex-col sm:flex-row items-center justify-between gap-6 transition-all duration-500 border-b ${isScrolled
          ? 'bg-background/90 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] border-none'
          : 'bg-gradient-to-b from-background/90 to-transparent backdrop-blur-sm border-none'
        }`}>
        <h1
          onClick={goHome}
          className="text-3xl md:text-4xl font-extrabold text-cyanNeon tracking-tighter cursor-pointer drop-shadow-[0_0_15px_rgba(0,255,255,0.6)] hover:text-white transition-colors italic"
        >
          SLIME_SHELL // WEB
        </h1>

        <div className="w-4/12 sm:max-w-3xl flex items-center gap-4 justify-end">
          
          <form onSubmit={handleSearch} className="flex-1 flex gap-3 relative">
            <input
              type="text"
              placeholder={isLoading ? "Sincronizando com a rede..." : "Digite o nome do anime..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
              className={`w-full bg-surface border text-textPrimary px-6 py-3 rounded-xl outline-none transition-all shadow-inner text-sm md:text-base 
                ${isLoading
                  ? 'border-cyanNeon shadow-[0_0_20px_rgba(0,255,255,0.4)] opacity-80'
                  : 'border-cyanNeon/20 focus:border-cyanNeon focus:shadow-[0_0_15px_rgba(0,255,255,0.3)]'
                }`}
            />
            {isLoading && (
              <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6">
                <div className="w-6 h-6 border-2 border-cyanNeon border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </form>

          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-3 text-textPrimary bg-surface rounded-xl transition-all duration-300 border border-cyanNeon/20 hover:border-cyanNeon hover:shadow-[0_0_15px_rgba(0,255,255,0.3)]"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-3 h-3 bg-cyanNeon rounded-full animate-pulse shadow-[0_0_10px_rgba(0,255,255,1)] border border-background"></span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-4 w-80 max-w-[90vw] bg-surface backdrop-blur-xl rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="p-4 border-b border-cyanNeon/5 bg-surface flex justify-between items-center">
                  <h3 className="text-sm font-bold text-textPrimary uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 bg-cyanNeon rounded-full"></span>
                    NOTIFICAÇÕES
                  </h3>
                  
                  {notifications.length > 0 && (
                    <button 
                      onClick={handleClearNotifications}
                      className="text-[11px] uppercase tracking-widest text-textPrimary hover:text-white font-bold rounded transition-colors"
                    >
                      Limpar Tudo
                    </button>
                  )}
                </div>
                
                <div className="max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-background [&::-webkit-scrollbar-thumb]:bg-cyanNeon/50">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-textSecondary text-xs">
                      <div className="opacity-50 mb-3 flex justify-center">
                        <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </div>
                      Nenhuma notificação nova.
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${notif.lida ? 'opacity-80' : 'bg-surface'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] text-cyanNeon font-bold uppercase tracking-wider">{notif.data}</span>
                          {!notif.lida && <span className="w-2 h-2 bg-cyanNeon rounded-full shadow-[0_0_5px_#00FFFF]"></span>}
                        </div>
                        <p className={`text-sm font-bold leading-snug mb-2 ${notif.lida ? 'text-textSecondary' : 'text-textPrimary'}`}>
                          {notif.mensagem}
                        </p>
                        <span className="text-[10px] text-textSecondary flex items-center gap-1 uppercase tracking-widest font-bold">
                          {notif.resultados?.length > 1 ? `➔ CLIQUE PARA VER AS ${notif.resultados.length} FONTES` : `➔ ABRIR ${notif.resultados?.[0]?.fonte || 'FONTE'}`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showBanner && (
        <div className="relative w-full h-[50vh] md:h-[60vh] min-h-[450px] 2xl:min-h-0 flex-shrink-0 flex items-end overflow-hidden perspective-1000 bg-background group">
          <img
            src="/banner-slime3.jpg"
            alt="Background Slime"
            className="absolute inset-0 w-full h-full object-cover object-top opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent z-1" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent z-1" />
          <div className="absolute bottom-0 w-full h-48 bg-gradient-to-t from-background to-transparent z-2" />
          <div className={`w-full flex flex-col px-6 md:px-12 xl:px-24 ${!showBanner ? 'pt-32' : 'pt-8'}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-cyanNeon/10 text-cyanNeon border border-cyanNeon/50 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest backdrop-blur-md shadow-[0_0_15px_rgba(0,255,255,0.3)] flex items-center gap-2">
                Protocolo: Rimuru_Tempest.sys
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl 2xl:text-7xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] mb-2 tracking-tighter group-hover:text-cyanNeon transition-colors duration-500 italic">
              Tensei shitara Slime Datta Ken
            </h1>
            <div className="mt-2 flex flex-col items-start gap-3 max-w-4xl backdrop-blur-[2px] rounded p-1 pb-8">
              <p className="text-textSecondary/90 text-sm md:text-lg leading-relaxed drop-shadow-md line-clamp-3 md:line-clamp-4 italic border-l-2 border-cyanNeon/30 pl-4">
                "Uma nova vida, um novo corpo e um universo de possibilidades." <br />
                Inicie a jornada de Rimuru Tempest e descubra como um simples Slime construiu um império.
              </p>
              <div className="flex flex-wrap items-center gap-6 mt-6">
                <button
                  onClick={() => executarBusca("Tensei shitara Slime Datta Ken")}
                  className="flex items-center gap-3 bg-cyanNeon text-background px-8 py-3.5 rounded-lg font-black uppercase tracking-tighter text-xs md:text-sm transition-all duration-300 hover:scale-110 shadow-[0_0_15px_rgba(0,255,255,0.4)]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  ASSISTIR AGORA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`w-full flex flex-col px-6 md:px-12 xl:px-24 ${!showBanner ? 'pt-32' : 'pt-6'}`}>

        {results.length > 0 ? (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <h2 className="text-xl font-bold text-textPrimary mb-8 border-l-4 border-cyanNeon pl-4 uppercase tracking-widest">
              Resultados da Busca
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6 w-full pb-12">
              {results.map((anime, i) => (
                <AnimeCard key={i} anime={anime} index={i} onSelect={setSelectedAnime} />
              ))}
            </div>
          </section>
        ) : searchAttempted && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in zoom-in duration-500 w-full">
            <div className="text-cyanNeon/50 mb-6 drop-shadow-[0_0_15px_rgba(0,255,255,0.4)]">
              <svg width="80" height="80" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-textPrimary mb-3 uppercase tracking-widest">Anime Não Encontrado</h2>
            <p className="text-textSecondary max-w-md">
              Não conseguimos localizar <span className="text-cyanNeon font-bold">"{query}"</span> nos servidores. Tente verificar a ortografia ou buscar pelo nome original em japonês.
            </p>
            <button onClick={goHome} className="mt-8 px-6 py-2 border border-cyanNeon/30 text-cyanNeon hover:bg-cyanNeon hover:text-background transition-colors rounded">
              Limpar Busca
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-12 animate-in fade-in duration-700 w-full">

            {continuarAssistindo.length > 0 && (
              <section className="w-full">
                <h2 className="text-xl font-bold text-textPrimary mb-6 flex items-center gap-3">
                  <span className="w-2 h-2 bg-cyanNeon rounded-full"></span>
                  CONTINUAR ASSISTINDO
                </h2>

                <div className="relative group/nav w-full">
                  
                  {/* === MÁSCARA ESQUERDA === */}
                  {!scrollContinuar.isStart && showContinuarArrows && (
                    <div className="absolute top-0 left-0 w-16 md:w-32 h-[calc(100%-24px)] bg-gradient-to-r from-background to-transparent pointer-events-none z-30 transition-opacity duration-500 rounded-l-xl"></div>
                  )}

                  {showContinuarArrows && (
                    <button onClick={() => rolarCarrossel(continuarRef, 'esquerda')} className="absolute left-2 top-1/2 -translate-y-1/2 z-40 bg-background/90 text-cyanNeon p-2 sm:p-3 rounded-r-xl border-y border-r border-cyanNeon/30 opacity-0 group-hover/nav:opacity-100 transition-all duration-300 backdrop-blur-md hover:bg-cyanNeon hover:text-background hover:scale-110 shadow-[0_0_15px_rgba(0,255,255,0.2)] hidden sm:block -ml-4">
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                  )}

                  <div
                    ref={continuarRef}
                    onScroll={checkScrollContinuar}
                    className="flex overflow-x-auto gap-6 pb-6 pt-2 snap-x snap-mandatory [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-surface/50 [&::-webkit-scrollbar-thumb]:bg-cyanNeon/20 hover:[&::-webkit-scrollbar-thumb]:bg-cyanNeon/60 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors w-full"
                  >
                    {continuarAssistindo.map((item, i) => {
                      const isDublado = item.idioma.toLowerCase() === 'dublado';
                      const colorIdioma = isDublado ? 'text-green-400 border-green-500/30' : 'text-yellow-400 border-yellow-500/30';

                      const novoEpData = item.novoEpData;
                      const temEpNovo = novoEpData !== undefined;
                      const isLancamento = novoEpData?.isLancamento;

                      const capaOficial = (item.cover && !item.cover.includes('127.0.0.1')) ? item.cover : item.imagem;
                      const imagemExibicao = (item.progresso < 100 && item.screenshot_url) ? item.screenshot_url : capaOficial;

                      // Card com tamanho PADRÃO DE 400px!
                      return (
                        <div
                          key={i}
                          onClick={() => handleQuickPlay(item)}
                          className={`group bg-surface border rounded-xl flex flex-col overflow-hidden isolate transition-all duration-300 cursor-pointer relative shrink-0 snap-start w-[85vw] sm:w-[280px] lg:w-[320px] 2xl:w-[400px]
                          ${(quickPlaying === item.titulo || openingHistory === item.titulo)
                              ? 'border-cyanNeon shadow-[0_0_20px_rgba(0,255,255,0.4)] animate-pulse'
                              : isLancamento
                                ? 'border-cyanNeon/50 hover:border-cyanNeon shadow-[0_0_10px_rgba(0,255,255,0.1)] hover:-translate-y-1 hover:shadow-lg'
                                : 'border-cyanNeon/20 hover:border-cyanNeon hover:shadow-[0_0_15px_rgba(0,255,255,0.15)] hover:-translate-y-1 hover:shadow-lg'}`}
                        >
                          
                          {activeCardMenu === item.titulo && (
                            <div 
                              onClick={(e) => { e.stopPropagation(); setActiveCardMenu(null); }} 
                              className="absolute inset-0 bg-background/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200"
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveCardMenu(null); }}
                                className="absolute top-3 right-3 p-2 text-textSecondary hover:text-white hover:bg-white/10 rounded-full transition-colors"
                              >
                                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                              
                              <h4 className="text-white font-bold text-center mb-8 text-lg leading-tight line-clamp-3">
                                {item.titulo}
                              </h4>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCardMenu(null);
                                  handleHistoryClick(item);
                                }}
                                className="flex items-center gap-3 bg-cyanNeon/10 text-cyanNeon border border-cyanNeon/50 px-6 py-3 rounded-lg hover:bg-cyanNeon hover:text-background transition-colors w-full justify-center font-bold tracking-widest text-xs uppercase shadow-[0_0_15px_rgba(0,255,255,0.2)] hover:shadow-[0_0_25px_rgba(0,255,255,0.5)]"
                              >
                                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Info da Série
                              </button>
                            </div>
                          )}

                          <div className="relative w-full aspect-[2.5] shrink-0 bg-background overflow-hidden border-b border-cyanNeon/20">
                            <img
                              src={imagemExibicao}
                              alt={item.titulo}
                              onError={(e) => { e.target.onerror = null; e.target.src = item.imagem; }}
                              className="w-full h-full object-cover object-center transition-all duration-700 opacity-70 group-hover:opacity-100 group-hover:scale-105"
                            />
                            
                            <div className={`absolute inset-0 flex items-center justify-center transition-opacity z-30 ${(openingHistory === item.titulo || quickPlaying === item.titulo) ? 'opacity-100 bg-background/50 backdrop-blur-sm' : 'opacity-0 pointer-events-none'}`}>
                              <div className="bg-background/80 p-2 rounded-full backdrop-blur-sm border border-cyanNeon">
                                <div className="w-5 h-5 border-2 border-cyanNeon border-t-transparent rounded-full animate-spin"></div>
                              </div>
                            </div>

                            <div className="absolute top-2 left-2 flex gap-1.5 z-20">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-cyanNeon border border-cyanNeon/30 bg-background/60 px-1.5 py-0.5 rounded">
                                  {item.fonte}
                              </span>
                              <span className={`text-[10px] font-bold uppercase tracking-widest border bg-background/60 px-1.5 py-0.5 rounded ${colorIdioma}`}>
                                  {item.idioma}
                              </span>
                            </div>

                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setActiveCardMenu(item.titulo); 
                              }}
                              className="absolute top-2 right-2 z-40 bg-background/60 backdrop-blur-md p-1.5 rounded-lg text-white hover:text-cyanNeon hover:bg-background/90 transition-colors shadow-lg border border-white/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                            >
                              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                            </button>
                          </div>

                          <div className="p-3 md:p-4 flex flex-col flex-1 min-w-0 pb-3 justify-center bg-surface">
                            <div className="flex items-center justify-between mb-1.5">
                              
                              {quickPlaying === item.titulo ? (
                                <span className="text-[10px] text-cyanNeon font-bold uppercase drop-shadow-[0_0_5px_rgba(0,255,255,0.5)] animate-pulse tracking-widest">
                                  ABRINDO NO PLAYER...
                                </span>
                              ) : isLancamento ? (
                                <span className="text-[10px] text-cyanNeon font-bold uppercase drop-shadow-[0_0_5px_rgba(0,255,255,0.5)] animate-pulse">
                                  NOVO EPISÓDIO DISPONÍVEL - EPISÓDIO {novoEpData.numero}
                                </span>
                              ) : temEpNovo ? (
                                <span className="text-[10px] text-textSecondary font-bold uppercase">
                                  PRÓXIMO: EP {novoEpData.numero}
                                </span>
                              ) : (
                                <span className="text-[10px] text-cyanNeon font-bold uppercase">
                                  Episódio {item.ep}
                                </span>
                              )}

                              {!temEpNovo && item.progresso > 0 && item.progresso < 100 && quickPlaying !== item.titulo && (() => {
                                const estimativaTotalSegundos = item.progresso > 10 ? (item.tempo * 100) / item.progresso : 1440;
                                const minutosRestantes = Math.max(1, Math.ceil((estimativaTotalSegundos - item.tempo) / 60));
                                
                                return (
                                  <span className="text-[9px] text-textSecondary uppercase tracking-widest font-bold">
                                    {item.progresso > 90 ? 'Finalizando...' : `Restam ${minutosRestantes} min`}
                                  </span>
                                );
                              })()}
                            </div>
                            
                            <h4 className={`text-sm font-bold line-clamp-1 transition-colors ${quickPlaying === item.titulo ? 'text-cyanNeon' : 'text-textPrimary group-hover:text-cyanNeon'}`} title={item.titulo}>
                              {item.titulo}
                            </h4>
                          </div>

                          {!temEpNovo && (
                            <div className="absolute bottom-0 left-0 w-full h-[3px] bg-background z-20">
                              <div className="h-full bg-cyanNeon shadow-[0_0_10px_#00FFFF] transition-all duration-500" style={{ width: `${item.progresso}%` }}></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* === MÁSCARA DIREITA === */}
                  {!scrollContinuar.isEnd && showContinuarArrows && (
                    <div className="absolute top-0 right-0 w-16 md:w-32 h-[calc(100%-24px)] bg-gradient-to-l from-background to-transparent pointer-events-none z-30 transition-opacity duration-500 rounded-r-xl"></div>
                  )}

                  {showContinuarArrows && (
                    <button onClick={() => rolarCarrossel(continuarRef, 'direita')} className="absolute right-2 top-1/2 -translate-y-1/2 z-40 bg-background/90 text-cyanNeon p-2 sm:p-3 rounded-l-xl border-y border-l border-cyanNeon/30 opacity-0 group-hover/nav:opacity-100 transition-all duration-300 backdrop-blur-md hover:bg-cyanNeon hover:text-background hover:scale-110 shadow-[0_0_15px_rgba(0,255,255,0.2)] hidden sm:block -mr-4">
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  )}

                </div>
              </section>
            )}

            <section className="w-full pt-12">
              <h2 className="text-xl font-bold text-textPrimary mb-8 border-l-4 border-cyanNeon pl-4 uppercase tracking-widest flex items-center justify-between">
                <span>Lançamentos da Temporada</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6 w-full pb-12">
                {displayedReleases.map((anime, i) => {
                  
                  // A mágica: Esconde os animes que passariam da 2ª linha dependendo da tela
                  let displayClass = "h-full"; // Os 4 primeiros (índice 0 a 3) aparecem em todas as telas
                  if (i >= 4 && i < 6) displayClass = "hidden sm:block h-full";     // Mostra a partir do Tablet (6 itens)
                  else if (i >= 6 && i < 8) displayClass = "hidden md:block h-full"; // Mostra a partir do Notebook (8 itens)
                  else if (i >= 8 && i < 10) displayClass = "hidden lg:block h-full"; // 10 itens
                  else if (i >= 10 && i < 12) displayClass = "hidden xl:block h-full"; // 12 itens
                  else if (i >= 12) displayClass = "hidden 2xl:block h-full";          // Mostra os 14 no seu monitor Padrão

                  return (
                    <div key={anime.titulo_exibicao + i} className={displayClass}>
                      <AnimeCard anime={anime} index={i} onSelect={(a) => {
                        executarBusca(a.titulo_romaji || a.titulo_exibicao);
                      }} />
                    </div>
                  );
                })}
              </div>
            </section>

            {concluidos.length > 0 && (
              <section className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-textPrimary flex items-center gap-3">
                    <span className="w-2 h-2 bg-cyanNeon rounded-full"></span>
                    HISTÓRICO
                  </h2>
                  
                  {concluidos.length > 7 && (
                    <button
                      onClick={() => setExpandHistory(!expandHistory)}
                      className="text-[10px] uppercase tracking-widest bg-cyanNeon/5 text-cyanNeon hover:text-cyan-400 font-bold border border-cyanNeon/30 hover:bg-cyanNeon/10 px-3 py-1.5 rounded transition-all"
                    >
                      {expandHistory ? '[-] Ocultar Antigos' : '[+] Ver Histórico Completo'}
                    </button>
                  )}
                </div>

                {expandHistory ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6 w-full pb-12 animate-in fade-in duration-500">
                    {concluidos.map((item, i) => {
                      const isDublado = item.idioma.toLowerCase() === 'dublado';
                      const colorIdioma = isDublado ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
                      const imgHistory = item.poster || item.imagem;

                      return (
                        <div key={i} onClick={() => handleHistoryClick(item)} className="group bg-surface rounded-xl flex flex-col overflow-hidden opacity-85 hover:opacity-100 hover:-translate-y-1 transition-all duration-300 cursor-pointer hover:shadow-[0_8px_16px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,255,0.05)] w-full h-full">
                          <div className="relative w-full h-[200px] sm:h-[230px] 2xl:h-[280px] bg-background overflow-hidden shrink-0">
                            <img src={imgHistory} alt={item.titulo} className="w-full h-full object-cover object-center grayscale-[40%] group-hover:grayscale-0 group-hover:scale-105 transition-transform duration-500" />
                          </div>
                          <div className="p-4 flex flex-col flex-1 bg-surface">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-cyanNeon border border-cyanNeon/30 px-1.5 py-0.5 rounded">
                                  {item.fonte}
                              </span>
                              <span className={`text-[10px] font-bold uppercase tracking-widest border px-1.5 py-0.5 rounded ${colorIdioma}`}>
                                  {item.idioma}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-textSecondary group-hover:text-cyanNeon transition-colors line-clamp-2" title={item.titulo}>{item.titulo}</h4>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="relative group/nav w-full animate-in fade-in duration-300">
                    
                    {/* === MÁSCARA ESQUERDA (HISTÓRICO) === */}
                    {!scrollConcluidos.isStart && showConcluidosArrows && (
                      <div className="absolute top-0 left-0 w-16 md:w-32 h-[calc(100%-24px)] bg-gradient-to-r from-background to-transparent pointer-events-none z-30 transition-opacity duration-500 rounded-l-xl"></div>
                    )}

                    {showConcluidosArrows && (
                      <button onClick={() => rolarCarrossel(concluidosRef, 'esquerda')} className="absolute left-2 top-[calc(50%-8px)] -translate-y-1/2 z-40 bg-background/90 text-cyanNeon p-2 sm:p-3 rounded-r-xl border-y border-r border-cyanNeon/30 opacity-0 group-hover/nav:opacity-100 transition-all duration-300 backdrop-blur-md hover:bg-cyanNeon hover:text-background hover:scale-110 shadow-[0_0_15px_rgba(0,255,255,0.2)] hidden sm:block -ml-4">
                        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
                      </button>
                    )}

                    <div 
                      ref={concluidosRef} 
                      onScroll={checkScrollConcluidos}
                      className="flex overflow-x-auto gap-6 pb-6 pt-2 snap-x snap-mandatory [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-surface/50 [&::-webkit-scrollbar-thumb]:bg-cyanNeon/20 hover:[&::-webkit-scrollbar-thumb]:bg-cyanNeon/60 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors w-full"
                    >
                      {concluidos.slice(0, 14).map((item, i) => {
                        const isDublado = item.idioma.toLowerCase() === 'dublado';
                        const colorIdioma = isDublado ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
                        const imgHistory = item.poster || item.imagem;

                        return (
                          <div key={i} onClick={() => handleHistoryClick(item)} className="group bg-surface border-none rounded-xl flex flex-col overflow-hidden opacity-85 hover:opacity-100 hover:-translate-y-1 transition-all duration-300 cursor-pointer hover:shadow-[0_8px_16px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,255,0.05)] shrink-0 snap-start w-[calc(50%-12px)] sm:w-[calc(33.33%-16px)] md:w-[calc(25%-18px)] lg:w-[calc(20%-19.2px)] xl:w-[calc(16.66%-20px)] 2xl:w-[calc(14.28%-20.5px)]">
                            <div className="relative w-full h-[200px] sm:h-[230px] 2xl:h-[280px] bg-background overflow-hidden shrink-0">
                              <img src={imgHistory} alt={item.titulo} className="w-full h-full object-cover object-center grayscale-[40%] group-hover:grayscale-0 group-hover:scale-105 transition-transform duration-500" />
                              
                              <div className={`absolute inset-0 flex items-center justify-center transition-opacity z-20 ${openingHistory === item.titulo ? 'opacity-100 bg-background/50' : 'opacity-0 pointer-events-none'}`}>
                                {openingHistory === item.titulo && (
                                  <div className="bg-background/80 p-2 rounded-full backdrop-blur-sm">
                                    <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="p-4 flex flex-col flex-1 bg-surface">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-cyanNeon border border-cyanNeon/30 px-1.5 py-0.5 rounded">
                                  {item.fonte}
                              </span>
                              <span className={`text-[10px] font-bold uppercase tracking-widest border px-1.5 py-0.5 rounded ${colorIdioma}`}>
                                  {item.idioma}
                              </span>
                              </div>
                              <h4 className="text-sm font-bold text-textSecondary group-hover:text-cyanNeon transition-colors line-clamp-2" title={item.titulo}>{item.titulo}</h4>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* === MÁSCARA DIREITA (HISTÓRICO) === */}
                    {!scrollConcluidos.isEnd && showConcluidosArrows && (
                      <div className="absolute top-0 right-0 w-16 md:w-32 h-[calc(100%-24px)] bg-gradient-to-l from-background to-transparent pointer-events-none z-30 transition-opacity duration-500 rounded-r-xl"></div>
                    )}

                    {showConcluidosArrows && (
                      <button onClick={() => rolarCarrossel(concluidosRef, 'direita')} className="absolute right-2 top-[calc(50%-8px)] -translate-y-1/2 z-40 bg-background/90 text-cyanNeon p-2 sm:p-3 rounded-l-xl border-y border-l border-cyanNeon/30 opacity-0 group-hover/nav:opacity-100 transition-all duration-300 backdrop-blur-md hover:bg-cyanNeon hover:text-background hover:scale-110 shadow-[0_0_15px_rgba(0,255,255,0.2)] hidden sm:block -mr-4">
                        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

          </div>
        )}
      </div>

      {serverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-cyanNeon/30 rounded-xl p-6 max-w-md w-full shadow-[0_0_30px_rgba(0,255,255,0.15)] flex flex-col gap-4">
            <div className="flex justify-between items-center mb-2 border-b border-cyanNeon/20 pb-3">
              <h3 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-cyanNeon rounded-full"></span> Servidores
              </h3>
              <button onClick={serverModal.onClose} className="text-textSecondary hover:text-red-400 transition-colors">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-background [&::-webkit-scrollbar-thumb]:bg-cyanNeon/50">
              {Object.entries(serverModal.links).filter(([_, url]) => Boolean(url)).map(([nome, url], index) => (
                <button key={index} onClick={() => serverModal.onSelect(url)} className="flex items-center justify-between p-3 rounded-lg border border-cyanNeon/20 bg-cyanNeon/5 hover:bg-cyanNeon hover:text-background transition-all group">
                  <span className="font-bold text-sm text-cyanNeon group-hover:text-background">{nome}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;