interface FaderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  vertical?: boolean;
  onChange: (v: number) => void;
}

/**
 * Fader lineal (vertical u horizontal) sobre <input type="range">.
 * Se usa para faders de línea, pitch, crossfader y máster.
 */
export function Fader({ label, value, min, max, step = 0.01, vertical, onChange }: FaderProps) {
  return (
    <div className="control-col">
      <input
        type="range"
        className={vertical ? 'vfader' : 'fader-h'}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
      />
      {label && <span>{label}</span>}
    </div>
  );
}
