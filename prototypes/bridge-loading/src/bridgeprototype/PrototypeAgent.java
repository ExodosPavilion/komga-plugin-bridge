// THROWAWAY PROTOTYPE for issue #2. Not the production Bridge; delete once the Bridge exists.
package bridgeprototype;

import java.lang.instrument.Instrumentation;

/**
 * Java agent entry point, named in JAVA_TOOL_OPTIONS as -javaagent:/plugin-bridge/bridge.jar.
 *
 * It does nothing but log. The JVM already appends every -javaagent jar to the system class
 * path, which is the same class loader Komga's extracted jar runs on, so Spring Boot finds this
 * jar's auto-configuration by itself. No ClassFileTransformer is registered: no bytecode is
 * rewritten.
 */
public final class PrototypeAgent {
    private PrototypeAgent() {}

    public static void premain(String args, Instrumentation inst) {
        System.out.println("[bridge-prototype] agent loaded; jar is on the system class path"
                + " (no transformer registered)");
    }
}
