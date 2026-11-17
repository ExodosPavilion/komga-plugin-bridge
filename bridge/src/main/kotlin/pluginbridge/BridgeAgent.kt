package pluginbridge

import java.lang.instrument.Instrumentation

/**
 * Java agent entry point, named in JAVA_TOOL_OPTIONS as -javaagent:/plugin-bridge/bridge.jar
 * (ADR-0003). It only logs: the JVM puts this jar on the system class path by itself, and
 * Spring Boot finds [BridgeAutoConfiguration] from there. No bytecode is rewritten.
 */
object BridgeAgent {
  @JvmStatic
  fun premain(
    args: String?,
    inst: Instrumentation?,
  ) {
    println("[plugin-bridge] agent loaded; jar is on the system class path")
  }
}
