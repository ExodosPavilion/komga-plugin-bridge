package pluginbridge

import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean

/** Registers response filtering for the bundled web UI (see [ResponseFilter]). */
@AutoConfiguration
class ResponseFilterAutoConfiguration {
  @Bean
  fun responseFilter(): FilterRegistrationBean<ResponseFilter> {
    val client = PluginHostClient(PluginHostClient.defaultConfigFile())
    return FilterRegistrationBean(ResponseFilter(ResponseFilterRoutes(client), client)).apply {
      addUrlPatterns("/api/*")
      order = 0 // after Spring Security's chain (-100), so the session is already resolved
    }
  }
}
