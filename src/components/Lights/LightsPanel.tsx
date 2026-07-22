import { useEffect, useRef } from 'react';
import { useStore } from '../../state/store';

const FIXTURES = 6;

/**
 * Control de luces inteligentes: un "rig" de focos en pantalla que reacciona al
 * máster (graves→rojo, medios→verde, agudos→azul, flash en cada kick) y, si el
 * navegador lo permite, envía el color a una bombilla RGB por Web Bluetooth.
 */
export function LightsPanel() {
  const engine = useStore((s) => s.engine);
  const lights = useStore((s) => s.lights);
  const toggleLights = useStore((s) => s.toggleLights);
  const connect = useStore((s) => s.connectBluetoothLight);
  const disconnect = useStore((s) => s.disconnectBluetoothLight);
  const pushLightColor = useStore((s) => s.pushLightColor);
  const rigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fixtures = rigRef.current?.querySelectorAll<HTMLElement>('.light-fixture');
    if (!engine || !lights.on) {
      fixtures?.forEach((el) => {
        el.style.background = '#0b0f1a';
        el.style.boxShadow = 'none';
      });
      return;
    }
    let raf = 0;
    const loop = () => {
      const s = engine.lights.sample();
      const now = performance.now();
      fixtures?.forEach((el, i) => {
        const b = Math.max(0.04, Math.min(1, s.brightness * (0.7 + 0.3 * Math.sin(now / 200 + i))));
        el.style.background = `rgb(${Math.round(s.r * b)}, ${Math.round(s.g * b)}, ${Math.round(s.b * b)})`;
        el.style.boxShadow = `0 0 ${8 + 24 * b}px rgba(${s.r}, ${s.g}, ${s.b}, ${0.35 + 0.5 * b})`;
      });
      pushLightColor(s.r, s.g, s.b); // con throttle; no-op si no hay bombilla
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, lights.on, pushLightColor]);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Luces</h3>
        <button className={lights.on ? 'active' : ''} onClick={toggleLights}>
          {lights.on ? '💡 Encendidas' : 'Apagadas'}
        </button>
      </div>

      <div className="lights-rig" ref={rigRef}>
        {Array.from({ length: FIXTURES }).map((_, i) => (
          <div key={i} className="light-fixture" />
        ))}
      </div>

      <div className="row" style={{ gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {lights.btSupported ? (
          lights.btConnected ? (
            <>
              <span className="chip" style={{ color: 'var(--good)' }}>🔵 {lights.btName}</span>
              <button className="mini-btn" onClick={disconnect}>Desconectar</button>
            </>
          ) : (
            <button className="mini-btn" onClick={() => void connect()}>🔵 Conectar luz Bluetooth</button>
          )
        ) : (
          <small className="hint">Web Bluetooth no está disponible aquí; el preview en pantalla siempre funciona.</small>
        )}
      </div>
      <small className="hint" style={{ display: 'block', marginTop: 6 }}>
        Reaccionan al máster: graves → rojo, medios → verde, agudos → azul, con flash en cada kick.
        Compatible con bombillas/tiras RGB BLE genéricas (ELK-BLEDOM).
      </small>
    </div>
  );
}
