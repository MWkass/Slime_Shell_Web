import concurrent.futures
import logging
from typing import List, Dict

from .base import AnimeProvider, AnimeResult
from .animefire import AnimeFireProvider
from .animesdrive import AnimeDriveProvider

logger = logging.getLogger(__name__)

class ContentOrchestrator:
    def __init__(self):
        # O orquestrador injeta as dependências da interface Base.
        self.providers: List[AnimeProvider] = [
            AnimeFireProvider(),
            AnimeDriveProvider()
        ]

    def search_all(self, query: str, timeout: int = 20) -> List[Dict]:
        """Busca em todos os provedores de forma paralela."""
        resultados_finais = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(self.providers)) as executor:
            futuros = {
                executor.submit(provider.search, query): provider 
                for provider in self.providers
            }
            
            for futuro in concurrent.futures.as_completed(futuros, timeout=timeout):
                provider = futuros[futuro]
                try:
                    resultados = futuro.result()
                    for res in resultados:
                        resultados_finais.append({
                            "titulo_exibicao": res.titulo_exibicao,
                            "url": res.url,
                            "fonte": provider.name
                        })
                except Exception as e:
                    logger.warning(f"O provedor {provider.name} falhou na busca: {str(e)}")

        return resultados_finais

    def _get_provider(self, provider_name: str) -> AnimeProvider:
        """Busca a instância do provedor pelo nome."""
        for provider in self.providers:
            if provider.name.lower() == provider_name.strip().lower():
                return provider
        raise ValueError(f"Provedor '{provider_name}' não suportado ou não encontrado.")

    def get_episodes(self, provider_name: str, anime_url: str) -> List[Dict]:
        """Roteia o pedido de episódios para o provedor correto."""
        provider = self._get_provider(provider_name)
        episodios = provider.get_episodes(anime_url)
        
        return [{"numero": ep.numero, "url": ep.url} for ep in episodios]

    def extract_links(self, provider_name: str, episode_url: str) -> Dict[str, str]:
        """Roteia o pedido de extração de vídeo para o provedor correto."""
        provider = self._get_provider(provider_name)
        return provider.extract_links(episode_url)