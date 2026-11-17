package pluginbridge

import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean

/** Registers the gate for Plugin Host-to-Bridge calls (see [HostCallFilter]). */
@AutoConfiguration
class HostCallAutoConfiguration {
  @Bean
  fun hostCallFilter(): FilterRegistrationBean<HostCallFilter> =
    FilterRegistrationBean(HostCallFilter(SharedSecret(PluginHostClient.defaultConfigFile()))).apply {
      addUrlPatterns("/plugin-bridge/host", "/plugin-bridge/host/*")
      order = Int.MIN_VALUE + 10 // before everything else in the servlet chain
    }
}
