package pluginbridge

import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory
import java.util.concurrent.TimeUnit

/**
 * The Komga API routes some plugin wants to filter, as last announced by the Plugin Host. A
 * background thread refreshes the list, so deciding whether a request needs filtering is one
 * volatile read and a few string matches: with no filter plugin the list is empty and a request
 * costs next to nothing. If the Plugin Host cannot be reached the list is emptied, which means
 * "filter nothing".
 */
class ResponseFilterRoutes(
  private val client: PluginHostClient,
  refreshSeconds: Long = 5,
) {
  @Volatile
  private var patterns: List<Regex> = emptyList()

  init {
    Executors
      .newSingleThreadScheduledExecutor(
        ThreadFactory { r -> Thread(r, "plugin-bridge-filter-routes").apply { isDaemon = true } },
      ).scheduleWithFixedDelay({ refresh() }, 0, refreshSeconds, TimeUnit.SECONDS)
  }

  /** True when some plugin filters the given path (without the context path). */
  fun matches(path: String): Boolean {
    val current = patterns
    return current.isNotEmpty() && current.any { it.matches(path) }
  }

  fun isEmpty(): Boolean = patterns.isEmpty()

  internal fun refresh() {
    patterns =
      try {
        client.get("/bridge/response-filters")?.path("routes")?.map { toRegex(it.asText()) } ?: emptyList()
      } catch (e: Exception) {
        emptyList()
      }
  }

  companion object {
    /** `*` matches one path segment, `**` anything; the rest is literal. Same rule as the Plugin Host. */
    fun toRegex(pattern: String): Regex =
      Regex(
        pattern.split("**").joinToString(".*") { part ->
          part.split("*").joinToString("[^/]*") { Regex.escape(it) }
        },
      )
  }
}
