package pluginbridge

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Guards the calls the Plugin Host makes into the Bridge, all under [PREFIX]. Komga's own
 * security does not cover that path, so this filter is the only gate: a request without the
 * shared secret is answered 401 and goes no further. Later features add their handlers behind
 * it (they see only authenticated calls).
 */
class HostCallFilter(
  private val secret: SharedSecret,
) : OncePerRequestFilter() {
  override fun shouldNotFilter(request: HttpServletRequest): Boolean {
    val path = request.requestURI.removePrefix(request.contextPath)
    return !(path == PREFIX.trimEnd('/') || path.startsWith(PREFIX))
  }

  override fun doFilterInternal(
    request: HttpServletRequest,
    response: HttpServletResponse,
    chain: FilterChain,
  ) {
    if (!secret.accepts(request.getHeader("Authorization"))) {
      response.status = HttpServletResponse.SC_UNAUTHORIZED
      return
    }
    if (request.requestURI.removePrefix(request.contextPath) == PING) {
      response.contentType = "application/json"
      response.writer.write("{\"ok\":true}")
      return
    }
    chain.doFilter(request, response)
  }

  companion object {
    const val PREFIX = "/plugin-bridge/host/"
    const val PING = "/plugin-bridge/host/ping"
  }
}
