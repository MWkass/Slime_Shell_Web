from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Dict

@dataclass
class AnimeResult:
    titulo_exibicao: str
    url: str
    fonte: str
    ultimo_episodio: str = "?"

@dataclass
class Episode:
    numero: str
    url: str
    thumbnail: str = ""

class AnimeProvider(ABC):
    """Interface abstrata que todo provedor de anime deve implementar."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Nome legível do provedor."""
        pass

    @abstractmethod
    def search(self, query: str) -> List[AnimeResult]:
        """Busca animes pelo nome."""
        pass

    @abstractmethod
    def get_episodes(self, anime_url: str) -> List[Episode]:
        """Retorna a lista de episódios de um anime."""
        pass

    @abstractmethod
    def extract_links(self, episode_url: str) -> Dict[str, str]:
        """Extrai os links de vídeo direto (.mp4, .m3u8)."""
        pass