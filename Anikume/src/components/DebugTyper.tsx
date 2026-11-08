import { useState, useEffect, useRef } from "react";

export function DebugTyper() {
  const typerInputRef = useRef<HTMLInputElement>(null);
  const keysPressed = useRef(new Set<string>());

  const [showTyper, setShowTyper] = useState(false);
  const [showDebugTab, setShowDebugTab] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showSaveStatus, setShowSaveStatus] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is actively typing in input fields
      if (
        !showTyper &&
        (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      )
        return;

      const key = e.key.toLowerCase();
      keysPressed.current.add(key);

      if (e.ctrlKey && keysPressed.current.has("a") && keysPressed.current.has("d")) {
        e.preventDefault();
        setShowTyper(true);
        keysPressed.current.clear();
        setTimeout(() => typerInputRef.current?.focus(), 100);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    const handleBlur = () => {
      keysPressed.current.clear();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [showTyper]);

  return (
    <>
      {/* Save Status Toast */}
      {showSaveStatus && (
        <div className="fixed bottom-4 right-4 z-50 bg-black/80 backdrop-blur-md text-green-400 p-4 border border-green-500/30 rounded font-mono text-xs animate-in fade-in slide-in-from-bottom-4 shadow-[0_0_15px_rgba(0,255,0,0.15)]">
          <div className="flex justify-between items-center mb-1">
            <span className="font-bold">SYSTEM_STATUS</span>
            <span className="text-[10px] opacity-70">v1.4.2</span>
          </div>
          <div>CACHE: OPTIMIZED</div>
          <div>MEMORY: STABLE</div>
          <div>CONNECTION: SECURE</div>
          <button
            onClick={() => setShowSaveStatus(false)}
            className="absolute top-1 right-2 text-green-400 hover:text-white"
          >
            x
          </button>
        </div>
      )}

      {/* Terminal Input overlay */}
      {showTyper && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="animate-in fade-in zoom-in-95 duration-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = typerInputRef.current?.value.toLowerCase();
                if (val === "savestatus") {
                  setShowSaveStatus((prev) => !prev);
                  setShowTyper(false);
                } else if (val === "stats") {
                  setShowTyper(false);
                  setShowDebugTab(true);
                  setDebugLogs((prev) => [...prev.slice(-49), `[SYSTEM] STATS MONITOR ACTIVATED.`]);
                } else {
                  setShowTyper(false);
                }
              }}
            >
              <input
                ref={typerInputRef}
                type="text"
                className="bg-black border border-green-500/30 text-green-400 font-mono text-center outline-none px-4 py-2 w-48 rounded uppercase"
                placeholder="..."
                onBlur={() => setShowTyper(false)}
              />
            </form>
          </div>
        </div>
      )}

      {/* Debug Tab */}
      {showDebugTab && (
        <div className="fixed bottom-0 left-0 right-0 z-[100] h-[30vh] border-t border-[#00ff00] bg-black/95 p-4 font-mono text-xs text-[#00ff00] shadow-[0_-10px_30px_rgba(0,255,0,0.1)] overflow-y-auto">
          <div className="mb-2 flex items-center justify-between border-b border-[#00ff00]/30 pb-2">
            <span className="font-bold">SYSTEM OVERRIDE // DEBUG LOGS</span>
            <div className="flex gap-4">
              <button
                onClick={() => navigator.clipboard.writeText(debugLogs.join("\n"))}
                className="hover:text-white transition"
              >
                COPY LOGS
              </button>
              <button
                onClick={() => setShowDebugTab(false)}
                className="hover:text-white transition"
              >
                CLOSE [X]
              </button>
            </div>
          </div>
          <div className="space-y-1 mt-2">
            {debugLogs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
            <div className="text-green-800 animate-pulse mt-4">_</div>
          </div>
        </div>
      )}
    </>
  );
}
