package pluginbridge

import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.ApplicationListener
import org.springframework.context.annotation.Bean
import org.springframework.core.env.Environment

/** Registers the Plugin Manager route (see [PluginManagerController]) and the Bridge's status report. */
@AutoConfiguration
class PluginManagerAutoConfiguration {
  @Bean
  fun pluginManagerController(): PluginManagerController = PluginManagerController(PluginHostProxy(PluginHostClient.defaultConfigFile()))

  @Bean
  fun bridgeStatusReporter(environment: Environment): BridgeStatusReporter =
    BridgeStatusReporter(PluginHostClient(PluginHostClient.defaultConfigFile()), environment)
}

/**
 * Tells the Plugin Host, once Komga has started, that the Bridge is active, so the Plugin Manager
 * can show it. (A Bridge that stays inactive reports that, with the reason, the same way.)
 */
class BridgeStatusReporter(
  private val client: PluginHostClient,
  private val environment: Environment,
) : ApplicationListener<ApplicationReadyEvent> {
  override fun onApplicationEvent(event: ApplicationReadyEvent) {
    // Off the startup thread: a Plugin Host that is down must not delay Komga.
    Thread {
      client.post(
        "/api/bridge/status",
        mapOf("active" to true, "komgaVersion" to environment.getProperty("application.version")),
      )
    }.apply {
      isDaemon = true
      start()
    }
  }
}
