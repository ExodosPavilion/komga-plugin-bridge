package pluginbridge

import org.gotson.komga.domain.model.DomainEvent
import org.springframework.context.event.EventListener
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * Listens to every Komga domain event, including LibraryScanned which Komga's public event
 * stream omits, and forwards each to the Plugin Host. Forwarding runs on its own single thread
 * so a slow Plugin Host never holds up Komga's event threads, and events arrive in order. If the
 * queue is full (the Plugin Host is far behind) new events are dropped. Nothing here can make
 * Komga fail: errors are logged and swallowed.
 */
class PluginHostEventForwarder(
  private val client: PluginHostClient,
) {
  private val executor =
    ThreadPoolExecutor(
      1,
      1,
      0L,
      TimeUnit.MILLISECONDS,
      LinkedBlockingQueue(MAX_QUEUED),
      { runnable -> Thread(runnable, "plugin-bridge-events").apply { isDaemon = true } },
      ThreadPoolExecutor.DiscardPolicy(),
    )

  @EventListener
  fun on(event: DomainEvent) {
    try {
      val forwarded = EventMapper.map(event)
      executor.execute { forward(forwarded) }
    } catch (e: Exception) {
      println("[plugin-bridge] event ${event.javaClass.simpleName} not forwarded: $e")
    }
  }

  private fun forward(event: ForwardedEvent) {
    try {
      client.post("/bridge/events", mapOf("type" to event.type, "data" to event.data))
    } catch (e: Exception) {
      println("[plugin-bridge] event ${event.type} not forwarded: $e")
    }
  }

  companion object {
    private const val MAX_QUEUED = 1000
  }
}
