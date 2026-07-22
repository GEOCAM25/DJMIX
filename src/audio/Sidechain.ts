import type { DeckId } from './types';

interface SidechainDeck {
  getLowEnergy(): number;
  setSidechainLow(db: number): void;
}

interface SidechainHost {
  getDeck: (id: DeckId) => SidechainDeck;
  isLocalPlaying: (id: DeckId) => boolean;
  channelGainValue: (id: DeckId) => number;
}

/**
 * Smart EQ / Sidechain (auto-ducking de graves).
 *
 * Cuando ambos decks suenan, el "principal" (el que domina el crossfader)
 * marca el ritmo: cada golpe de bajo suyo ATENÚA los graves del deck
 * secundario en tiempo real. Así solo hay una línea de graves a la vez y se
 * evita la saturación/embarre típica al mezclar dos temas con bombo.
 *
 * Web Audio no tiene un sidechain "real" en el compresor, así que lo emulamos:
 * medimos la energía de graves del principal (AnalyserNode con pasa-bajos) y
 * modulamos un lowshelf dedicado en el secundario. Corre en su propio bucle
 * de animación mientras está activo.
 */
export class Sidechain {
  private enabled = false;
  private amount = 14; // dB máximos de atenuación
  private raf = 0;

  constructor(private readonly host: SidechainHost) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  get amountDb(): number {
    return this.amount;
  }

  setAmount(db: number): void {
    this.amount = Math.max(0, Math.min(24, db));
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      this.loop();
    } else {
      cancelAnimationFrame(this.raf);
      this.host.getDeck('A').setSidechainLow(0);
      this.host.getDeck('B').setSidechainLow(0);
    }
  }

  private loop = (): void => {
    if (!this.enabled) return;

    const gA = this.host.channelGainValue('A');
    const gB = this.host.channelGainValue('B');
    const primary: DeckId = gA >= gB ? 'A' : 'B';
    const secondary: DeckId = primary === 'A' ? 'B' : 'A';

    if (this.host.isLocalPlaying(primary) && this.host.isLocalPlaying(secondary)) {
      const energy = this.host.getDeck(primary).getLowEnergy();
      // Sin ducking por debajo de 0.25; máximo alcanzado hacia 0.75.
      const drive = Math.max(0, Math.min(1, (energy - 0.25) / 0.5));
      this.host.getDeck(secondary).setSidechainLow(-this.amount * drive);
      this.host.getDeck(primary).setSidechainLow(0);
    } else {
      this.host.getDeck('A').setSidechainLow(0);
      this.host.getDeck('B').setSidechainLow(0);
    }

    this.raf = requestAnimationFrame(this.loop);
  };
}
