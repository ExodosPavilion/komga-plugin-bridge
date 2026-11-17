package pluginbridge

import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.core.env.Environment
import java.util.UUID

/**
 * The only part of the Bridge that exists on every Komga version. It logs whether the Bridge is
 * active, and tells the Plugin Host so the Plugin Manager can show it. Spring and the JDK only:
 * see [BridgeGate].
 */
@AutoConfiguration
class BridgeStatusAutoConfiguration {
  @Bean
  fun bridgeStatusReporter(environment: Environment): BridgeStatusReporter = BridgeStatusReporter(BridgeGate.evaluate(environment))
}

class BridgeStatusReporter(
  private val result: BridgeGate.Result,
) {
  private val instanceId = UUID.randomUUID().toString()

  init {
    if (result.active) {
      println("[plugin-bridge] Komga ${result.komgaVersion} is supported: the Bridge is active")
    } else {
      println("[plugin-bridge] INACTIVE: ${result.reason}. Komga runs as stock Komga.")
    }
    val thread = Thread({ report() }, "plugin-bridge-status")
    thread.isDaemon = true
    thread.start()
  }

  /** Tries for about half a minute, because the Plugin Host may still be starting. */
  private fun report() {
    val client = PluginHostClient(PluginHostClient.defaultConfigFile())
    val body =
      mapOf(
        "instanceId" to instanceId,
        "active" to result.active,
        "komgaVersion" to result.komgaVersion,
        "supportedVersions" to result.supportedVersions,
        "reason" to result.reason,
      )
    repeat(10) {
      if (client.post("/bridge/status", body) != null) return
      try {
        Thread.sleep(3000)
      } catch (e: InterruptedException) {
        return
      }
    }
  }
}
