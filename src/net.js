// Thin WebSocket client for the room/relay server.
export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.room = null;
    this.iceServers = [];
    this.handlers = {};
  }

  on(t, fn) {
    (this.handlers[t] ??= []).push(fn);
  }

  emit(t, ...args) {
    for (const fn of this.handlers[t] ?? []) fn(...args);
  }

  get connected() {
    return this.ws?.readyState === 1 && !!this.id;
  }

  get inRoom() {
    return !!this.room?.code;
  }

  get isHost() {
    return this.inRoom && this.room.hostId === this.id;
  }

  connect() {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      // Resolve relative to the page so it works when served from a sub-path.
      const url = new URL('ws', location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.search = '';
      const ws = new WebSocket(url);
      this.ws = ws;
      const fail = () => reject(new Error('Could not reach the game server'));
      const timer = setTimeout(fail, 6000);
      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (m.t) {
          case 'welcome':
            this.id = m.id;
            this.iceServers = m.iceServers ?? [];
            clearTimeout(timer);
            resolve();
            break;
          case 'room': {
            const prevHost = this.room?.hostId;
            this.room = m.code ? m : null;
            this.emit('room', this.room);
            if (this.room && prevHost && prevHost !== m.hostId) this.emit('host', m.hostId);
            break;
          }
          case 'msg':
            this.emit('msg', m.from, m.d);
            break;
          default:
            this.emit(m.t, m);
        }
      };
      ws.onclose = () => {
        clearTimeout(timer);
        const wasConnected = !!this.id;
        this.ws = null;
        this.id = null;
        this.room = null;
        fail();
        if (wasConnected) this.emit('disconnect');
      };
    });
  }

  send(m) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  relay(d, to) {
    this.send({ t: 'relay', d, to });
  }

  create(name) {
    this.send({ t: 'create', name });
  }

  join(code, name) {
    this.send({ t: 'join', code, name });
  }

  leave() {
    this.send({ t: 'leave' });
    this.room = null;
  }
}
