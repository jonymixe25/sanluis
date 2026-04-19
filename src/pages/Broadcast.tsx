import React, { useEffect, useRef, useState, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Video, VideoOff, Mic, MicOff, AlertCircle, Users, Clock, MessageSquare, 
  Share2, Check, Loader2, Phone, X, Circle, Square, Save, RefreshCw, 
  Camera, Zap, Activity, Signal, Settings, Info, Maximize, Monitor,
  Layout, ShieldCheck, ChevronRight, Lock
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import Chat from "../components/Chat";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { saveRecording } from "../utils/videoStorage";
import { getSocketUrl } from "../utils/socket";
import { motion, AnimatePresence } from "motion/react";

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" }
  ]
};

interface User {
  id: string;
  username: string;
}

interface StreamStats {
  bitrate?: number;
  fps?: number;
  resolution?: string;
  packetsLost?: number;
  latency?: number;
}

export default function Broadcast() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const privateVideoRef = useRef<HTMLVideoElement>(null); // Video para la llamada privada
  const [socket, setSocket] = useState<Socket | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const peerConnections = useRef<{ [id: string]: RTCPeerConnection }>({});
  const pendingCandidates = useRef<{ [id: string]: RTCIceCandidateInit[] }>({});
  
  // Audio Analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Stats
  const [stats, setStats] = useState<StreamStats>({});
  
  // Private Call Refs
  const privatePeerConnection = useRef<RTCPeerConnection | null>(null);
  const [privateCallUser, setPrivateCallUser] = useState<User | null>(null);
  const [isPrivateCallActive, setIsPrivateCallActive] = useState(false);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewers, setViewers] = useState(0);
  const [connectedUsers, setConnectedUsers] = useState<User[]>([]);
  const [uptime, setUptime] = useState(0);
  const [showChat, setShowChat] = useState(true);
  const [showUserList, setShowUserList] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [streamName, setStreamName] = useState("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const { t } = useLanguage();

  // Password Protection
  const [password, setPassword] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "mixe2024") {
      setIsAuthorized(true);
      setAuthError(null);
    } else {
      setAuthError("Contraseña incorrecta");
    }
  };

  // Sound ref
  const notificationSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    notificationSound.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
    notificationSound.current.volume = 0.5;
  }, []);

  const playNotification = () => {
    if (notificationSound.current) {
      notificationSound.current.currentTime = 0;
      notificationSound.current.play().catch(e => console.log("Audio play failed", e));
    }
  };

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Audio Visualizer Implementation
  useEffect(() => {
    if (!stream || !audioEnabled) {
      setAudioLevel(0);
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;
    analyser.fftSize = 256;
    
    const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId: number;
    const updateAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      setAudioLevel(average);
      animationId = requestAnimationFrame(updateAudioLevel);
    };

    updateAudioLevel();

    return () => {
      cancelAnimationFrame(animationId);
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [stream, audioEnabled]);

  // Real-time Stats Implementation
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(async () => {
      const pcs = Object.values(peerConnections.current) as RTCPeerConnection[];
      if (pcs.length === 0) return;

      const pc = pcs[0];
      try {
        const reports = await pc.getStats();
        let bitrate = 0;
        let fps = 0;
        let resolution = "Unknown";
        let packetsLost = 0;

        reports.forEach(report => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            bitrate = Math.round((report.bytesSent * 8) / (uptime || 1) / 1000); // kbps
            fps = report.framesPerSecond || 0;
            packetsLost = report.packetsLost || 0;
          }
          if (report.type === 'track' && report.kind === 'video') {
            resolution = `${report.frameWidth}x${report.frameHeight}`;
          }
        });

        setStats({ bitrate, fps, resolution, packetsLost });
      } catch (e) {
        console.error("Stats error", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isStreaming, uptime]);

  const handleShare = async () => {
    const currentOrigin = window.location.origin;
    const sharedOrigin = currentOrigin.replace('ais-dev', 'ais-pre');
    const viewerUrl = `${sharedOrigin}/view`;
    
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL", err);
    }
  };

  // Private Call Functions
  const startPrivateCall = async (user: User) => {
    if (!stream || !socket) return;
    
    setPrivateCallUser(user);
    setIsPrivateCallActive(true);
    setShowUserList(false);

    const pc = new RTCPeerConnection(config);
    privatePeerConnection.current = pc;

    // Add local tracks to private connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle remote stream
    pc.ontrack = (event) => {
      if (privateVideoRef.current) {
        privateVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("private_candidate", user.id, event.candidate);
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("private_offer", user.id, pc.localDescription);
    } catch (err) {
      console.error("Error creating private offer:", err);
      endPrivateCall();
    }
  };

  const endPrivateCall = () => {
    if (privatePeerConnection.current) {
      privatePeerConnection.current.close();
      privatePeerConnection.current = null;
    }
    setPrivateCallUser(null);
    setIsPrivateCallActive(false);
    if (privateVideoRef.current) {
      privateVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStreaming) {
      interval = setInterval(() => {
        setUptime(prev => prev + 1);
      }, 1000);
    } else {
      setUptime(0);
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Recording Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = () => {
    if (!stream) return;
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9'
    });
    
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      await saveRecording(blob, recordingTime);
      alert(t.broadcast.recordingSaved);
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    const socketUrl = getSocketUrl();
    
    const s = io(socketUrl, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    });
    setSocket(s);

    s.on("connect", () => {
      setIsSocketConnected(true);
      setSocketError(null);
      if (isStreaming) {
        s.emit("broadcaster", streamName || "Transmisión en vivo");
      }
    });

    s.on("connect_error", (err) => {
      setIsSocketConnected(false);
      setSocketError(`${t.broadcast.socketError} ${socketUrl}: ${err.message}`);
      console.error("Socket connection error:", err);
    });

    s.on("disconnect", () => {
      setIsSocketConnected(false);
    });

    s.on("viewers_count", (count: number) => {
      setViewers(count);
    });

    s.on("user_list", (users: User[]) => {
      setConnectedUsers(users);
    });

    // Private Call Signaling
    s.on("private_answer", async (id: string, description: RTCSessionDescriptionInit) => {
      if (privatePeerConnection.current) {
        try {
          await privatePeerConnection.current.setRemoteDescription(description);
        } catch (err) {
          console.error("Error setting private remote description:", err);
        }
      }
    });

    s.on("private_candidate", (id: string, candidate: RTCIceCandidateInit) => {
      if (privatePeerConnection.current) {
        privatePeerConnection.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    s.on("chat_message", (message: any) => {
      if (!showChat) {
        setUnreadMessages(prev => prev + 1);
        playNotification();
      }
    });

    s.on("watcher", (id: string) => {
      if (!stream) return;
      
      const peerConnection = new RTCPeerConnection(config);
      peerConnections.current[id] = peerConnection;

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.onicecandidate = event => {
        if (event.candidate) {
          s.emit("candidate", id, event.candidate);
        }
      };

      peerConnection
        .createOffer()
        .then(sdp => peerConnection.setLocalDescription(sdp))
        .then(() => {
          s.emit("offer", id, peerConnection.localDescription);
        });
    });

    s.on("answer", async (id: string, description: RTCSessionDescriptionInit) => {
      const pc = peerConnections.current[id];
      if (pc) {
        try {
          await pc.setRemoteDescription(description);
          const candidates = pendingCandidates.current[id] || [];
          for (const candidate of candidates) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
          }
          pendingCandidates.current[id] = [];
        } catch (err) {
          console.error("Error setting remote description:", err);
        }
      }
    });

    s.on("candidate", (id: string, candidate: RTCIceCandidateInit) => {
      const pc = peerConnections.current[id];
      if (pc) {
        if (pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
        } else {
          if (!pendingCandidates.current[id]) pendingCandidates.current[id] = [];
          pendingCandidates.current[id].push(candidate);
        }
      }
    });

    s.on("disconnectPeer", (id: string) => {
      if (peerConnections.current[id]) {
        peerConnections.current[id].close();
        delete peerConnections.current[id];
      }
      if (pendingCandidates.current[id]) {
        delete pendingCandidates.current[id];
      }
      // If the private call user disconnected
      if (privateCallUser && privateCallUser.id === id) {
        endPrivateCall();
      }
    });

    return () => {
      s.disconnect();
      Object.values<RTCPeerConnection>(peerConnections.current).forEach(pc => pc.close());
      if (privatePeerConnection.current) privatePeerConnection.current.close();
    };
  }, [stream, isStreaming, privateCallUser]);

  // ... (startStream, stopStream, toggleVideo, toggleAudio remain mostly the same)
  const startStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: facingMode
        },
        audio: true
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      setIsStreaming(true);
      setError(null);
      
      if (socket && isSocketConnected) {
        socket.emit("broadcaster", streamName || "Transmisión en vivo");
      }
    } catch (err) {
      console.error("Error accessing media devices.", err);
      setError(t.broadcast.cameraError);
    }
  };

  const stopStream = () => {
    if (isRecording) stopRecording();
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    endPrivateCall();
    
    // Close all connections
    Object.values<RTCPeerConnection>(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const flipCamera = async () => {
    const newFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newFacingMode);
    
    // If we have an active stream (either preview or live), we need to refresh it
    if (stream) {
      try {
        // Stop current video tracks
        stream.getVideoTracks().forEach(track => track.stop());
        
        const newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: newFacingMode
          }
        });
        
        const newVideoTrack = newVideoStream.getVideoTracks()[0];
        
        // Update local video element
        if (videoRef.current) {
          videoRef.current.srcObject = new MediaStream([newVideoTrack, ...stream.getAudioTracks()]);
        }
        
        // If we are live, replace track in all peer connections
        if (isStreaming) {
          (Object.values(peerConnections.current) as RTCPeerConnection[]).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === "video");
            if (sender) {
              sender.replaceTrack(newVideoTrack);
            }
          });
          
          // Update private call if active
          if (privatePeerConnection.current) {
            const sender = privatePeerConnection.current.getSenders().find(s => s.track?.kind === "video");
            if (sender) {
              sender.replaceTrack(newVideoTrack);
            }
          }
        }
        
        // Update stream state
        const combinedStream = new MediaStream([
          newVideoTrack,
          ...stream.getAudioTracks()
        ]);
        setStream(combinedStream);
        
      } catch (err) {
        console.error("Error flipping camera:", err);
        setError(t.broadcast.cameraError);
      }
    }
  };

  // ... (Authentication render logic remains the same)
  if (!isAuthorized) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#0c0c0e] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#141417] p-8 rounded-3xl border border-zinc-800 shadow-2xl"
        >
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Lock className="w-8 h-8 text-brand-primary" />
          </div>
          <h2 className="text-2xl font-bold text-center mb-2">Acceso Restringido</h2>
          <p className="text-zinc-500 text-center text-sm mb-8">Ingresa la contraseña para acceder al panel de transmisión profesional.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-primary/50 transition-all text-center outline-none"
                autoFocus
              />
              {authError && <p className="text-red-500 text-xs mt-2 text-center">{authError}</p>}
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold rounded-xl transition-all shadow-lg shadow-brand-primary/20"
            >
              Entrar al Control Room
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-zinc-800">
            <Link to="/" className="text-zinc-500 hover:text-white text-sm flex items-center justify-center gap-2 transition-colors">
              <ChevronRight className="w-4 h-4 rotate-180" /> Volver al Inicio
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0c0c0e] text-zinc-100 font-sans overflow-hidden">
      <Helmet>
        <title>{t.broadcast.title} | Control Room</title>
        <meta name="description" content="Professional broadcast control panel for Vida Mixe TV." />
      </Helmet>

      {/* Header Bar */}
      <div className="h-14 bg-[#141417] border-b border-zinc-800 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-brand-primary" />
            <span className="text-sm font-bold tracking-tight uppercase">Control Room v2.0</span>
          </div>
          <div className="h-4 w-px bg-zinc-800"></div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${isSocketConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              <Signal className={`w-3 h-3 ${isSocketConnected ? 'animate-pulse' : ''}`} />
              {isSocketConnected ? 'Connected' : 'Offline'}
            </div>
            {isStreaming && (
              <div className="flex items-center gap-2 px-2.5 py-1 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-md text-[10px] font-bold uppercase tracking-wider animate-pulse">
                <Circle className="w-3 h-3 fill-current" />
                Live: {formatUptime(uptime)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-black/40 rounded-lg p-1 border border-zinc-800">
             <button
               onClick={() => setShowChat(!showChat)}
               className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${showChat ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
             >
               <MessageSquare className="w-3.5 h-3.5" /> Chat
               {unreadMessages > 0 && <span className="bg-brand-primary text-white text-[9px] px-1.5 py-0.5 rounded-full">{unreadMessages}</span>}
             </button>
             <button
               onClick={() => setShowUserList(!showUserList)}
               className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${showUserList ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
             >
               <Users className="w-3.5 h-3.5" /> Users ({connectedUsers.length})
             </button>
          </div>
          <button
            onClick={handleShare}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            title="Share"
          >
            {copied ? <Check className="w-5 h-5 text-emerald-500" /> : <Share2 className="w-5 h-5" />}
          </button>
          <Settings className="w-5 h-5 text-zinc-500 hover:text-zinc-300 cursor-pointer" />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Left: Resources & Monitoring */}
        <div className="w-72 bg-[#141417] border-r border-zinc-800 flex flex-col hidden lg:flex">
          <div className="p-4 space-y-6">
            {/* Audio Monitoring */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Mic className="w-3 h-3" /> Audio Levels
                </span>
                <span className={`text-[10px] font-mono ${audioLevel > 150 ? 'text-red-400' : audioLevel > 80 ? 'text-brand-secondary' : 'text-emerald-400'}`}>
                  {Math.round(audioLevel)} dB
                </span>
              </div>
              <div className="h-2.5 bg-black/40 rounded-full border border-zinc-800 p-0.5 flex gap-0.5 overflow-hidden">
                {[...Array(20)].map((_, i) => (
                  <div 
                    key={i}
                    className={`flex-1 rounded-sm transition-all duration-75 ${
                      (audioLevel / (256/20)) > i 
                        ? i > 15 ? 'bg-red-500' : i > 11 ? 'bg-brand-secondary' : 'bg-emerald-500'
                        : 'bg-zinc-800'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Network Stats */}
            <div className="space-y-4">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3 h-3" /> System Info
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 p-3 rounded-xl border border-zinc-800/50">
                  <span className="text-[9px] text-zinc-500 block mb-1 uppercase tracking-wider">Bitrate</span>
                  <span className="text-sm font-mono text-zinc-200">{stats.bitrate || 0} <small className="text-[10px] opacity-50">kbps</small></span>
                </div>
                <div className="bg-black/30 p-3 rounded-xl border border-zinc-800/50">
                  <span className="text-[9px] text-zinc-500 block mb-1 uppercase tracking-wider">Frame Rate</span>
                  <span className="text-sm font-mono text-zinc-200">{Math.round(stats.fps || 0)} <small className="text-[10px] opacity-50">fps</small></span>
                </div>
                <div className="bg-black/30 p-3 rounded-xl border border-zinc-800/50 col-span-2">
                  <span className="text-[9px] text-zinc-500 block mb-1 uppercase tracking-wider">Resolution</span>
                  <span className="text-sm font-mono text-zinc-200 flex items-center gap-2">
                    <Monitor className="w-3 h-3 text-brand-primary" />
                    {stats.resolution || (isStreaming ? "Wait..." : "N/A")}
                  </span>
                </div>
              </div>
            </div>

            {/* Stream Health */}
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
               <div className="flex items-center gap-3 mb-2">
                 <ShieldCheck className="w-4 h-4 text-emerald-500" />
                 <span className="text-xs font-semibold text-emerald-400">Encoder Health</span>
               </div>
               <p className="text-[10px] text-zinc-500 leading-relaxed">
                 Signal stability is optimized for the current connection. Latency monitored at {stats.latency || '<100'}ms.
               </p>
            </div>
          </div>

          <div className="mt-auto p-4 border-t border-zinc-800">
             <Link 
               to="/recordings" 
               className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
             >
               <Save className="w-3.5 h-3.5" /> Recording Library
             </Link>
          </div>
        </div>

        {/* Main Production Area */}
        <div className="flex-1 flex flex-col bg-[#080809] relative">
          <div className="flex-1 relative flex items-center justify-center p-4">
            <div className="w-full h-full max-w-5xl aspect-video bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl relative border border-zinc-800 ring-1 ring-white/5">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover transition-grayscale duration-500 ${!isStreaming ? 'grayscale' : ''}`}
              />
              
              {/* Camera Overlays */}
              <AnimatePresence>
                {!isStreaming && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center"
                  >
                    <div className="w-24 h-24 bg-brand-primary/10 rounded-full flex items-center justify-center mb-6 border border-brand-primary/20">
                      <Zap className="w-10 h-10 text-brand-primary" />
                    </div>
                    <h2 className="text-3xl font-bold mb-4 tracking-tighter">Ready for Output?</h2>
                    <div className="w-full max-w-sm space-y-4 mb-8">
                       <input 
                         type="text"
                         value={streamName}
                         onChange={(e) => setStreamName(e.target.value)}
                         placeholder="Event name (e.g. Festival de las Nubes)"
                         className="w-full bg-zinc-800 border-zinc-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-primary/50 transition-all text-center"
                       />
                       <p className="text-zinc-500 text-xs">Configure your camera and microphone before clicking 'GO LIVE'.</p>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={startStream}
                        disabled={!isSocketConnected}
                        className="px-10 py-4 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all shadow-xl shadow-brand-primary/20 transform hover:scale-105 active:scale-95 flex items-center gap-3"
                      >
                        <Circle className="w-5 h-5 fill-current" />
                        Go Live Now
                      </button>
                      <button
                        onClick={flipCamera}
                        className="p-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl transition-colors border border-zinc-700"
                      >
                        <Camera className="w-6 h-6" />
                      </button>
                    </div>
                    {!isSocketConnected && (
                      <div className="mt-8 flex items-center gap-2 text-red-500 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20 text-xs font-medium">
                        <AlertCircle className="w-4 h-4" />
                        Server connection required
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Live HUD */}
              {isStreaming && (
                <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2">
                       <div className="bg-brand-primary text-white text-[10px] font-black px-3 py-1 rounded-sm uppercase tracking-widest flex items-center gap-2 w-fit">
                          <Circle className="w-2 h-2 fill-current animate-pulse" /> Live Production
                       </div>
                       <div className="bg-black/60 backdrop-blur-md text-white text-[10px] font-mono px-3 py-1 rounded-sm w-fit border border-white/10 uppercase tracking-widest">
                          {streamName || "Default Channel"}
                       </div>
                    </div>
                    <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-4">
                       <div className="flex items-center gap-2">
                         <Users className="w-3.5 h-3.5 text-zinc-400" />
                         <span className="text-xs font-bold">{viewers}</span>
                       </div>
                       <div className="w-px h-3 bg-white/20"></div>
                       <div className="flex items-center gap-2">
                         <Activity className="w-3.5 h-3.5 text-zinc-400" />
                         <span className="text-xs font-mono">{stats.fps || 0}fps</span>
                       </div>
                    </div>
                  </div>
                  
                  {isRecording && (
                    <div className="bg-red-600 self-start text-white text-[10px] font-black px-3 py-1 rounded-sm uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-red-600/20 animate-pulse">
                      Recording {formatUptime(recordingTime)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Private Call Overlay */}
            <AnimatePresence>
              {isPrivateCallActive && (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0, y: 50 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0, y: 50 }}
                  className="absolute bottom-8 right-8 w-80 bg-zinc-900 rounded-3xl border-2 border-brand-primary shadow-2xl overflow-hidden z-[60]"
                >
                   <div className="aspect-[4/3] bg-black">
                     <video
                        ref={privateVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                     />
                     <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                        <Phone className="w-3.5 h-3.5 text-brand-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{privateCallUser?.username}</span>
                     </div>
                     <button 
                       onClick={endPrivateCall}
                       className="absolute top-4 right-4 p-2 bg-red-500 hover:bg-red-400 text-white rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95"
                     >
                       <X className="w-4 h-4" />
                     </button>
                   </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Master Control Panel */}
          <div className="h-24 bg-[#141417] border-t border-zinc-800 flex items-center justify-center gap-6 px-10 relative">
             <div className="absolute left-10 flex items-center gap-4">
                <div className="flex flex-col">
                   <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Local Monitor</span>
                   <div className="flex gap-2">
                     <button 
                       onClick={toggleVideo}
                       className={`p-2.5 rounded-lg border transition-all ${videoEnabled ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white' : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'}`}
                     >
                       {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                     </button>
                     <button 
                       onClick={toggleAudio}
                       className={`p-2.5 rounded-lg border transition-all ${audioEnabled ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white' : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'}`}
                     >
                       {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                     </button>
                     <button 
                        onClick={flipCamera}
                        className="p-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-white"
                     >
                        <Camera className="w-4 h-4" />
                     </button>
                   </div>
                </div>
             </div>

             <div className="flex items-center gap-6">
                <button
                  onClick={toggleRecording}
                  disabled={!isStreaming}
                  className={`flex flex-col items-center gap-1 group disabled:opacity-30`}
                >
                  <div className={`p-4 rounded-full transition-all border-2 ${isRecording ? 'bg-zinc-100 border-red-500 text-red-600 scale-110' : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}>
                    {isRecording ? <Square className="w-6 h-6 fill-current" /> : <Circle className="w-6 h-6 fill-current" />}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest">Record</span>
                </button>

                {isStreaming ? (
                  <button
                    onClick={stopStream}
                    className="h-16 px-12 bg-red-600 hover:bg-red-500 text-white rounded-full font-black uppercase tracking-widest text-sm shadow-xl shadow-red-600/10 transition-all hover:scale-105 active:scale-95"
                  >
                    End Stream
                  </button>
                ) : (
                  <button
                    onClick={startStream}
                    disabled={!isSocketConnected}
                    className="h-16 px-12 bg-zinc-800 text-zinc-600 rounded-full font-black uppercase tracking-widest text-sm cursor-not-allowed border-2 border-zinc-700"
                  >
                    Standby
                  </button>
                )}

                <div className="flex flex-col items-center gap-1">
                   <div className="p-4 rounded-full border-2 border-zinc-800 bg-transparent text-zinc-700 cursor-not-allowed">
                     <Share2 className="w-6 h-6" />
                   </div>
                   <span className="text-[9px] font-bold uppercase tracking-widest">Distribute</span>
                </div>
             </div>

             <div className="absolute right-10 flex items-center gap-4">
                <div className="flex flex-col items-end">
                   <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Output Resolution</span>
                   <div className="bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-emerald-400">HQ</span>
                        <span className="text-[10px] font-medium text-zinc-500">1080p</span>
                      </div>
                      <div className="w-px h-2.5 bg-zinc-800"></div>
                      <Maximize className="w-3.5 h-3.5 text-zinc-500 cursor-pointer hover:text-white" />
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Sidebar Right: Interactive & Lists */}
        <div className={`bg-[#141417] border-l border-zinc-800 transition-all duration-500 ease-in-out relative flex flex-col ${showChat ? 'w-80 lg:w-96' : 'w-0 overflow-hidden border-l-0'}`}>
           <div className="flex-1 flex flex-col overflow-hidden">
             {showUserList ? (
               <div className="flex-1 flex flex-col p-4 bg-[#0c0c0e]">
                 <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider">Active Watchers</h3>
                    <button onClick={() => setShowUserList(false)} className="text-zinc-500 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                   {connectedUsers.length === 0 ? (
                     <div className="h-40 flex flex-col items-center justify-center text-zinc-600 gap-3 grayscale italic">
                       <Users className="w-10 h-10 opacity-20" />
                       <span className="text-xs tracking-widest font-medium">Waiting for audience...</span>
                     </div>
                   ) : (
                     connectedUsers.map(user => (
                       <div key={user.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between group hover:border-zinc-700 transition-all">
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium">{user.username}</span>
                         </div>
                         {!isPrivateCallActive && (
                           <button 
                             onClick={() => startPrivateCall(user)}
                             className="p-2 bg-brand-primary text-white rounded-lg scale-90 opacity-0 group-hover:opacity-100 transition-all hover:scale-100"
                           >
                             <Phone className="w-3.5 h-3.5" />
                           </button>
                         )}
                       </div>
                     ))
                   )}
                 </div>
               </div>
             ) : (
               <Chat socket={socket} isHost={true} transparent={true} />
             )}
           </div>

           {/* Floating User List Toggle in Chat */}
           <button 
              onClick={() => setShowUserList(!showUserList)}
              className="absolute top-2.5 right-12 p-2 text-zinc-500 hover:text-white transition-colors z-50"
           >
              {showUserList ? <MessageSquare className="w-4 h-4" /> : <Users className="w-4 h-4" />}
           </button>
        </div>
      </div>

      {/* Global Alerts Overlay */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] border border-white/10"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-tight">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
    </div>
  );
}
