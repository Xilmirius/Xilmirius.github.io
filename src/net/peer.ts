// Enlace WebRTC con dos DataChannels: "rel" (confiable, ordenado) y "fast" (sin reintentos, desordenado).
import type { SignalingChannel, SignalMsg } from './signaling/types';

export class PeerLink {
  pc: RTCPeerConnection;
  rel: RTCDataChannel | null = null;
  fast: RTCDataChannel | null = null;
  opened = false;
  closed = false;
  onMessage: (data: any, fast: boolean) => void = () => {};
  onOpen: () => void = () => {};
  onClose: (reason: string) => void = () => {};
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private discTimer: number | null = null;

  constructor(
    readonly remotePid: string,
    private myPid: string,
    private sig: SignalingChannel,
    iceServers: RTCIceServer[],
    readonly isHost: boolean,
  ) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.signal('ice', e.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed') this.close('failed');
      else if (s === 'closed') this.close('closed');
      else if (s === 'disconnected') {
        if (this.discTimer === null) this.discTimer = window.setTimeout(() => this.close('disconnected'), 7000);
      } else if (s === 'connected' && this.discTimer !== null) {
        clearTimeout(this.discTimer);
        this.discTimer = null;
      }
    };
    if (isHost) {
      this.setup(this.pc.createDataChannel('rel', { ordered: true }), false);
      this.setup(this.pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }), true);
    } else {
      this.pc.ondatachannel = (e) => this.setup(e.channel, e.channel.label === 'fast');
    }
  }

  private signal(kind: SignalMsg['kind'], data?: any) {
    this.sig.send({ from: this.myPid, to: this.remotePid, kind, data });
  }

  async start() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signal('offer', { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp });
  }

  async handleSignal(m: SignalMsg) {
    if (this.closed) return;
    try {
      if (m.kind === 'offer') {
        await this.pc.setRemoteDescription(m.data);
        this.remoteSet = true;
        await this.flushIce();
        const ans = await this.pc.createAnswer();
        await this.pc.setLocalDescription(ans);
        this.signal('answer', { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp });
      } else if (m.kind === 'answer') {
        if (this.pc.signalingState !== 'have-local-offer') return;
        await this.pc.setRemoteDescription(m.data);
        this.remoteSet = true;
        await this.flushIce();
      } else if (m.kind === 'ice') {
        if (this.remoteSet) await this.pc.addIceCandidate(m.data);
        else this.pendingIce.push(m.data);
      }
    } catch (err) {
      console.warn('[webrtc] error de signaling', err);
    }
  }

  private async flushIce() {
    const list = this.pendingIce;
    this.pendingIce = [];
    for (const c of list) {
      try { await this.pc.addIceCandidate(c); } catch (e) { console.warn('[webrtc] ICE', e); }
    }
  }

  private setup(ch: RTCDataChannel, fast: boolean) {
    if (fast) this.fast = ch; else this.rel = ch;
    ch.onopen = () => {
      if (!this.opened && this.rel?.readyState === 'open' && this.fast?.readyState === 'open') {
        this.opened = true;
        this.onOpen();
      }
    };
    ch.onmessage = (e) => {
      let d: any;
      try { d = JSON.parse(e.data); } catch { return; }
      this.onMessage(d, fast);
    };
    ch.onclose = () => this.close('channel-closed');
  }

  send(obj: unknown, fast = false) {
    this.sendRaw(JSON.stringify(obj), fast);
  }

  sendRaw(s: string, fast = false) {
    const ch = fast ? this.fast : this.rel;
    if (!ch || ch.readyState !== 'open') return;
    if (fast && ch.bufferedAmount > 128 * 1024) return; // congestión: descartar snapshots viejos
    try { ch.send(s); } catch (e) { console.warn('[webrtc] send', e); }
  }

  close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.discTimer !== null) clearTimeout(this.discTimer);
    try { this.rel?.close(); } catch { /* */ }
    try { this.fast?.close(); } catch { /* */ }
    try { this.pc.close(); } catch { /* */ }
    this.onClose(reason);
  }
}
