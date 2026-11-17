package pluginbridge;

import java.lang.instrument.Instrumentation;

/**
 * Java agent entry point, named in JAVA_TOOL_OPTIONS as -javaagent:/plugin-bridge/bridge.jar
 * (ADR-0003). It only logs: the JVM puts this jar on the system class path by itself, and
 * Spring Boot finds {@link BridgeAutoConfiguration} from there. No bytecode is rewritten.
 */
public final class BridgeAgent {
    private BridgeAgent() {}

    public static void premain(String args, Instrumentation inst) {
        System.out.println("[plugin-bridge] agent loaded; jar is on the system class path");
    }
}
