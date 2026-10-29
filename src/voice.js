import * as THREE from 'three';

// Proximity voice chat. Audio goes peer-to-peer over WebRTC (a full mesh - fine for 4 players),
// then each remote voice is routed through a 3D panner placed on that player's avatar, with a
// low-pass "muffle" when there's a wall between you.

const SPEAK_THRESHOLD = 0.012;
const fwd = new THREE.Vector3();
const up = new THREE.Vector3();

const isTyping = () => document.activeElement?.tagName === 'INPUT';

function rms(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

function setParam(param, value, t) {
  param.setTargetAtTime(value, t, 0.03);
}

export class Voice {
  constructor(net, sound) {
    this.net = net;
    this.sound = sound;
    this.peers = new Map();
    this.iceServers = [];
    this.stream = null;
    this.track = null;
    this.micError = null;
    this.pttDown = false;
    this.transmitting = false;
    this.localLevel = 0;
    this.localBuf = new Float32Array(512);
    this.ptt = true;
    try {
      this.ptt = localStorage.getItem('memebreak.ptt') !== '0';
    } catch {}
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyV' && !isTyping()) this.pttDown = true;
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'KeyV') this.pttDown = false;
    });
    addEventListener('blur', () => (this.pttDown = false));
  }

  setPtt(on) {
    this.ptt = on;
    try {
      localStorage.setItem('memebreak.ptt', on ? '1' : '0');
    } catch {}
  }

  async initMic() {
    if (this.stream) return;
    this.micError = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.micError = window.isSecureContext ? 'No microphone support in this browser' : 'Voice needs HTTPS (or localhost)';
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.track = this.stream.getAudioTracks()[0];
      this.track.enabled = false;
      const ctx = this.sound.ctx;
      if (ctx) {
        this.localAnalyser = ctx.createAnalyser();
        this.localAnalyser.fftSize = 512;
        ctx.createMediaStreamSource(this.stream).connect(this.localAnalyser);
      }
    } catch (e) {
      this.micError = e.name === 'NotAllowedError' ? 'Microphone blocked - you can still listen' : 'No microphone found - you can still listen';
    }
  }

  get out() {
    if (!this._out) {
      this._out = this.sound.ctx.createGain();
      this._out.gain.value = 1.2;
      this._out.connect(this.sound.ctx.destination);
    }
    return this._out;
  }

  syncPeers(ids) {
    for (const id of ids) if (!this.peers.has(id)) this.createPeer(id);
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.closePeer(id);
  }

  createPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const polite = parseInt(this.net.id, 36) > parseInt(id, 36);
    const peer = {
      id,
      pc,
      // Perfect-negotiation roles. The impolite (lower-id) side is also the *initiator*: it makes
      // the first offer and the other side waits for it. Letting both offer at once relies on the
      // polite side rolling back, and Chrome sometimes stops emitting ICE candidates after that
      // rollback - the link then sits in "new" forever.
      polite,
      initiator: !polite,
      makingOffer: false,
      ignoreOffer: false,
      audio: null,
      level: 0,
      speaking: false,
      created: performance.now(),
      kicked: false,
    };
    this.peers.set(id, peer);
    if (this.track) pc.addTrack(this.track, this.stream);
    else if (peer.initiator) pc.addTransceiver('audio', { direction: 'recvonly' }); // the answerer gets one from the offer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.net.relay({ t: 'rtc', ice: candidate }, id);
    };
    pc.ontrack = (ev) => this.attach(peer, ev.streams[0] ?? new MediaStream([ev.track]));
    pc.onnegotiationneeded = async () => {
      // The non-initiator waits for the first offer; after that either side may renegotiate.
      if (!peer.initiator && !pc.remoteDescription) return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.net.relay({ t: 'rtc', sdp: pc.localDescription }, id);
      } catch (e) {
        console.warn('[voice] offer failed', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce?.();
    };
    return peer;
  }

  async onSignal(from, d) {
    const peer = this.peers.get(from) ?? this.createPeer(from);
    const pc = peer.pc;
    try {
      if (d.sdp) {
        const collision = d.sdp.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') {
          await pc.setLocalDescription();
          this.net.relay({ t: 'rtc', sdp: pc.localDescription }, from);
        }
      } else if (d.ice) {
        try {
          await pc.addIceCandidate(d.ice);
        } catch (e) {
          if (!peer.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn('[voice] signalling error', e);
    }
  }

  attach(peer, stream) {
    const ctx = this.sound.ctx;
    if (!ctx || peer.audio) return;
    // Chrome only feeds remote WebRTC audio into WebAudio if it's also attached to a media element.
    const el = new Audio();
    el.muted = true;
    el.srcObject = stream;
    el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 3;
    panner.maxDistance = 80;
    panner.rolloffFactor = 1.1;
    src.connect(analyser);
    src.connect(filter);
    filter.connect(gain).connect(panner).connect(this.out);
    peer.audio = { el, src, analyser, filter, gain, panner, buf: new Float32Array(512) };
  }

  closePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    if (peer.audio) {
      peer.audio.el.srcObject = null;
      peer.audio.src.disconnect();
      peer.audio.panner.disconnect();
    }
    this.peers.delete(id);
  }

  closeAll() {
    for (const id of [...this.peers.keys()]) this.closePeer(id);
  }

  level(id) {
    return id === this.net.id ? this.localLevel : this.peers.get(id)?.level ?? 0;
  }

  speaking(id) {
    return this.level(id) > SPEAK_THRESHOLD;
  }

  update(game) {
    const tx = !!this.track && this.net.inRoom && (!this.ptt || this.pttDown);
    if (this.track) this.track.enabled = tx;
    this.transmitting = tx;
    const localNow = tx && this.localAnalyser ? rms(this.localAnalyser, this.localBuf) : 0;
    this.localLevel = Math.max(localNow, this.localLevel * 0.9);

    const ctx = this.sound.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const spatial = game.inCoopLevel;
    const cam = game.camera.position;
    const L = ctx.listener;
    if (spatial) {
      fwd.set(0, 0, -1).applyQuaternion(game.camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(game.camera.quaternion);
    } else {
      fwd.set(0, 0, -1);
      up.set(0, 1, 0);
    }
    const lx = spatial ? cam.x : 0;
    const ly = spatial ? cam.y : 0;
    const lz = spatial ? cam.z : 0;
    if (L.positionX) {
      setParam(L.positionX, lx, t);
      setParam(L.positionY, ly, t);
      setParam(L.positionZ, lz, t);
      setParam(L.forwardX, fwd.x, t);
      setParam(L.forwardY, fwd.y, t);
      setParam(L.forwardZ, fwd.z, t);
      setParam(L.upX, up.x, t);
      setParam(L.upY, up.y, t);
      setParam(L.upZ, up.z, t);
    } else {
      L.setPosition(lx, ly, lz);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }

    for (const peer of this.peers.values()) {
      // Watchdog: if a link hasn't come up after a few seconds, kick off an ICE restart.
      const pc = peer.pc;
      if (!peer.kicked && !peer.polite && pc.connectionState !== 'connected' && performance.now() - peer.created > 8000) {
        peer.kicked = true;
        pc.restartIce?.();
      }
      const a = peer.audio;
      if (!a) continue;
      peer.level = Math.max(rms(a.analyser, a.buf), peer.level * 0.9);
      const r = game.coop.remotes.get(peer.id);
      let x = lx;
      let y = ly;
      let z = lz;
      let cutoff = 18000;
      let vol = 1;
      if (spatial && r?.hasState) {
        x = r.pos.x;
        y = 1.5;
        z = r.pos.z;
        const dist = Math.hypot(x - lx, z - lz);
        if (!game.level.hasLOS(lx, lz, x, z)) {
          cutoff = 900;
          vol = 0.55;
        }
        vol *= THREE.MathUtils.clamp(1 - (dist - 30) / 25, 0, 1);
      }
      const p = a.panner;
      if (p.positionX) {
        setParam(p.positionX, x, t);
        setParam(p.positionY, y, t);
        setParam(p.positionZ, z, t);
      } else {
        p.setPosition(x, y, z);
      }
      a.filter.frequency.setTargetAtTime(cutoff, t, 0.08);
      a.gain.gain.setTargetAtTime(vol, t, 0.08);
    }
  }
}
