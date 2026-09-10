const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export class ProctoringWebSocket {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private token: string;
  private onMessage: (data: any) => void;
  private onClose: () => void;
  // private reconnectAttempts = 0;
  // private maxReconnects = 3;

  constructor(
    sessionId: string,
    token: string,
    onMessage: (data: any) => void,
    onClose: () => void
  ) {
    this.sessionId = sessionId;
    this.token = token;
    this.onMessage = onMessage;
    this.onClose = onClose;
  }

  connect() {
    const url = `${WS_BASE}/ws/proctoring/${this.sessionId}?token=${this.token}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    this.ws.onclose = () => {
      this.onClose();
    };

    this.ws.onerror = (e) => {
      console.error('WS error:', e);
    };
  }

  send(data: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendFrame(imageB64: string) {
    this.send({ type: 'frame', data: imageB64 });
  }

  sendAudio(audioB64: string) {
    this.send({ type: 'audio', data: audioB64 });
  }

  ping() {
    this.send({ type: 'ping' });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
