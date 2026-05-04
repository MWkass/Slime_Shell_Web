class AnimeProviderError(Exception):
    """Exceção base para todos os provedores de anime."""
    pass

class NetworkTimeoutError(AnimeProviderError):
    """Lançada quando o servidor de destino demora muito para responder."""
    pass

class CloudflareBlockError(AnimeProviderError):
    """Lançada quando a requisição é barrada pelo Cloudflare ou WAF."""
    pass

class ParsingError(AnimeProviderError):
    """Lançada quando o HTML muda e os seletores do BeautifulSoup falham."""
    pass