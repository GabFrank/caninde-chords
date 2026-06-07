import Peer from 'simple-peer';
import { db } from '../firebase';
import { collection, doc, setDoc, onSnapshot, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

interface WebRTCUpdate {
  type: 'SONG_CHANGE';
  data: {
    currentSongIndex: number;
    currentSongId: string;
    updatedAt: number;
    directorId: string;
  };
}

export class P2PManager {
  private peers: Map<string, Peer.Instance> = new Map();
  private sessionId: string;
  private userId: string;
  private isDirector: boolean;
  private onUpdate?: (update: WebRTCUpdate) => void;

  constructor(sessionId: string, userId: string, isDirector: boolean, onUpdate?: (update: WebRTCUpdate) => void) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isDirector = isDirector;
    this.onUpdate = onUpdate;
  }

  public async start() {
    if (this.isDirector) {
      this.setupDirectorSignaling();
    } else {
      this.setupSpectatorSignaling();
    }
  }

  private setupDirectorSignaling() {
    const signalingRef = collection(db, 'sessions', this.sessionId, 'signaling');
    
    // Listen for new connection requests from spectators
    onSnapshot(signalingRef, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const peerId = change.doc.id;
          const data = change.doc.data();
          
          if (data.offer && !data.answer && !this.peers.has(peerId)) {
            this.createDirectorPeer(peerId, data.offer);
          }
        }
      });
    });
  }

  private createDirectorPeer(peerId: string, offer: any) {
    const peer = new Peer({ initiator: false, trickle: false });

    peer.on('signal', async (answer) => {
      const peerDoc = doc(db, 'sessions', this.sessionId, 'signaling', peerId);
      await updateDoc(peerDoc, { answer });
    });

    peer.on('connect', () => {
      console.log(`P2P: Connected to spectator ${peerId}`);
      this.peers.set(peerId, peer);
    });

    peer.on('close', () => {
      console.log(`P2P: Connection closed with spectator ${peerId}`);
      this.peers.delete(peerId);
    });

    peer.on('error', (err) => {
      console.error(`P2P: Error with spectator ${peerId}`, err);
      this.peers.delete(peerId);
    });

    peer.signal(offer);
  }

  private async setupSpectatorSignaling() {
    const peerId = this.userId;
    const peer = new Peer({ initiator: true, trickle: false });
    const peerDoc = doc(db, 'sessions', this.sessionId, 'signaling', peerId);

    peer.on('signal', async (offer) => {
      await setDoc(peerDoc, {
        offer,
        createdAt: serverTimestamp(),
        peerName: 'Spectator'
      });
    });

    peer.on('connect', () => {
      console.log('P2P: Connected to director');
      this.peers.set('director', peer);
    });

    peer.on('data', (data) => {
      try {
        const update = JSON.parse(data.toString()) as WebRTCUpdate;
        if (this.onUpdate) this.onUpdate(update);
      } catch (err) {
        console.error('P2P: Failed to parse data', err);
      }
    });

    peer.on('close', () => {
      this.peers.delete('director');
    });

    // Listen for answer from director
    const unsubscribe = onSnapshot(peerDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.answer) {
          peer.signal(data.answer);
          // Once connected, we can potentially delete the signaling doc to keep Firestore clean
          // but better to wait a bit
          setTimeout(() => unsubscribe(), 5000);
        }
      }
    });
  }

  public broadcast(update: WebRTCUpdate) {
    if (!this.isDirector) return;
    const payload = JSON.stringify(update);
    this.peers.forEach((peer) => {
      if (peer.connected) {
        peer.send(payload);
      }
    });
  }

  public destroy() {
    this.peers.forEach(peer => peer.destroy());
    this.peers.clear();
  }
}
