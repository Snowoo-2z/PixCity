// ─────────────────────────────────────────────────────────────
//  PixCity · mini bus d'événements
// ─────────────────────────────────────────────────────────────
export class Bus {
  constructor() { this.map = new Map(); }

  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this.map.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error('[bus]', type, (e && e.stack) || e); }
    }
    const all = this.map.get('*');
    if (all) for (const fn of [...all]) { try { fn({ type, payload }); } catch (e) { console.error('[bus*]', type, (e && e.stack) || e); } }
  }
}

export const bus = new Bus();
