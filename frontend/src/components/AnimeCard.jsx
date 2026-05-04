import { useState, useEffect } from 'react';

// IMPORTANTE: Adicionamos o 'index' de volta nas propriedades!
export default function AnimeCard({ anime, index, onSelect }) {
  const [coverUrl, setCoverUrl] = useState(anime.poster || anime.cover || anime.imagem || null);
  const [isFetching, setIsFetching] = useState(!coverUrl);

  const isDublado = anime.titulo_exibicao.toLowerCase().includes('dublado');
  const idiomaTag = isDublado ? 'DUBLADO' : 'LEGENDADO';
  
  const colorIdioma = isDublado 
    ? 'text-green-400 border-green-500/30 bg-green-500/10' 
    : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';

  const tituloExibicaoLimpo = anime.titulo_exibicao.replace(/\(Dublado\)|\(Legendado\)/gi, '').trim();

  // === CHAMADA AO SEU PRÓPRIO BACKEND (BFF) COM FILA ===
  useEffect(() => {
    if (coverUrl) {
      setIsFetching(false);
      return;
    }

    let isMounted = true;
    
    const fetchCoverFromBackend = async () => {
      try {
        // A MÁGICA RESTAURADA: Protege seu servidor Python de ser bombardeado
        await new Promise(resolve => setTimeout(resolve, index * 100));

        const res = await fetch(`http://127.0.0.1:8000/api/cover?title=${encodeURIComponent(tituloExibicaoLimpo)}`);
        
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.sucesso && data.url) {
            setCoverUrl(data.url);
          } else {
            setIsFetching(false);
          }
        }
      } catch (e) {
        if (isMounted) setIsFetching(false);
      }
    };

    fetchCoverFromBackend();

    return () => { isMounted = false; };
  }, [tituloExibicaoLimpo, coverUrl, index]);

  return (
    <div onClick={() => onSelect({ ...anime, poster: coverUrl, cover: coverUrl })} className="bg-surface rounded-xl overflow-hidden transition-all duration-300 hover:shadow-[0_8px_16px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,255,255,0.05)] hover:-translate-y-1 cursor-pointer group flex flex-col h-[400px]">      
      <div className="relative h-[280px] w-full bg-background flex items-center justify-center overflow-hidden shrink-0">
        {coverUrl ? (
          <img 
            src={coverUrl} 
            alt={tituloExibicaoLimpo} 
            className="object-cover w-full h-full opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" 
          />
        ) : (
          <div className="animate-pulse text-cyanNeon/50 font-mono text-xs tracking-widest text-center px-2 flex flex-col gap-3">
            {isFetching ? '[ BUSCANDO CAPA... ]' : '[ SEM SINAL ]'}
          </div>
        )}
        
        <div className="absolute bottom-0 w-full h-[1px] bg-cyanNeon/30 group-hover:bg-cyanNeon transition-colors z-10"></div>
      </div>

      <div className="p-3 flex flex-col flex-grow bg-surface relative z-10 justify-start">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-cyanNeon border border-cyanNeon/30 bg-cyanNeon/5 px-1.5 py-0.5 rounded">
                {anime.fonte}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-widest border px-1.5 py-0.5 rounded ${colorIdioma}`}>
                {idiomaTag}
            </span>
        </div>

        <h3 
          title={tituloExibicaoLimpo}
          className="text-sm font-bold text-textPrimary group-hover:text-cyanNeon transition-colors line-clamp-3 leading-snug"
        >
          {tituloExibicaoLimpo}
        </h3>
      </div>
    </div>
  );
}