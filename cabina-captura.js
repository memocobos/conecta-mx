/* [CABINA-ESTABLE-1 · 3-nov-2026] La CAPTURA de la cabina, fuera de la pantalla.
 *
 * Medido en la prueba del 3-nov (23:09–23:18): la estación soltó al locutor y
 * volvió el AutoDJ varias veces (8 s y 6 s de canciones automáticas entre dos
 * tramos al aire), y los cortes caen justo después de bajar canciones del
 * catálogo. La causa: la mezcla se convertía a MP3 en el ScriptProcessor, que
 * corre en el HILO DE LA PANTALLA — cualquier trabajo de Kaio-sama (bajar una
 * canción, repintar, cambiar de pestaña) atrasaba el envío y la estación se
 * quedaba sin audio.
 *
 * Este procesador vive en el hilo de AUDIO (tiempo real, no lo frena nada de
 * la pantalla): junta la mezcla en bloques de 2048 cuadros y los manda por un
 * MessagePort DIRECTO al Worker que codifica y envía (cabina-envio.js). El
 * audio jamás pasa por el hilo de la pantalla.
 *
 * Sin entrada (nadie conectado al master) manda SILENCIO, no nada: un hueco en
 * el envío es justo lo que hace que la estación suelte al locutor. */
class CabinaCaptura extends AudioWorkletProcessor {
  constructor() {
    super();
    this.salida = null;
    this.parado = false;
    this.N = 2048;
    this.L = new Float32Array(this.N);
    this.R = new Float32Array(this.N);
    this.i = 0;
    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.puerto) this.salida = m.puerto;
      if (m.parar) this.parado = true;
    };
  }
  process(inputs) {
    if (this.parado) return false;
    if (!this.salida) return true;
    const inp = inputs && inputs[0];
    const a = inp && inp[0];
    const b = (inp && inp[1]) || a;
    const n = a ? a.length : 128;
    for (let k = 0; k < n; k++) {
      this.L[this.i] = a ? a[k] : 0;
      this.R[this.i] = b ? b[k] : 0;
      this.i++;
      if (this.i === this.N) {
        this.salida.postMessage({ L: this.L, R: this.R }, [this.L.buffer, this.R.buffer]);
        this.L = new Float32Array(this.N);
        this.R = new Float32Array(this.N);
        this.i = 0;
      }
    }
    return true;
  }
}
registerProcessor('cabina-captura', CabinaCaptura);
