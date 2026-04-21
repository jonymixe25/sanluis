import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2, Download, Play, Clock, FileVideo, Calendar, Upload, ShoppingCart, Video, ChevronRight } from "lucide-react";
import { getRecordings, deleteRecording, saveRecording, SavedRecording } from "../utils/videoStorage";
import { useLanguage } from "../context/LanguageContext";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";

interface CommunityVideo {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  price: string;
  video_url: string;
}

export default function Recordings() {
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [communityVideos, setCommunityVideos] = useState<CommunityVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    loadRecordings();

    const unsubscribeVideos = onSnapshot(collection(db, "community_videos"), (snapshot) => {
      setCommunityVideos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CommunityVideo[]);
    });

    return () => unsubscribeVideos();
  }, []);

  const loadRecordings = async () => {
    try {
      const data = await getRecordings();
      setRecordings(data);
    } catch (error) {
      console.error("Error loading recordings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create a temporary video element to get duration
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = async () => {
      window.URL.revokeObjectURL(video.src);
      const duration = video.duration;
      
      try {
        await saveRecording(file, duration, file.name);
        loadRecordings();
      } catch (error) {
        console.error("Error saving uploaded video:", error);
        alert(t.recordings.errorSaving);
      }
    };

    video.onerror = () => {
      alert(t.recordings.errorLoading);
    };

    video.src = URL.createObjectURL(file);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t.recordings.confirmDelete)) {
      await deleteRecording(id);
      loadRecordings();
      if (selectedVideo === id) setSelectedVideo(null);
    }
  };

  const handleDownload = (recording: SavedRecording, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = URL.createObjectURL(recording.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vida-mixe-${recording.date.toISOString()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-brand-bg text-neutral-50 font-sans p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-white">{t.recordings.title}</h1>
          </div>
          
          <label className="flex items-center gap-2 px-4 py-2 bg-brand-surface hover:bg-white/10 text-neutral-200 rounded-lg cursor-pointer transition-colors border border-white/5 shadow-sm">
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">{t.recordings.uploadVideo}</span>
            <input 
              type="file" 
              accept="video/*" 
              className="hidden" 
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Video List */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-xl font-semibold text-neutral-300 flex items-center gap-2">
              <FileVideo className="w-5 h-5" />
              {t.recordings.history}
            </h2>
            
            {loading ? (
              <div className="text-center py-8 text-neutral-500">{t.recordings.loading}</div>
            ) : recordings.length === 0 ? (
              <div className="bg-brand-surface border border-white/5 rounded-xl p-8 text-center space-y-3">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto text-neutral-500">
                  <FileVideo className="w-6 h-6" />
                </div>
                <p className="text-neutral-400">{t.recordings.noRecordings}</p>
                <Link to="/admin" className="text-brand-primary hover:text-brand-primary/80 text-sm font-medium">
                  {t.recordings.goToAdmin}
                </Link>
              </div>
            ) : (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                {recordings.map((rec) => (
                  <div 
                    key={rec.id}
                    onClick={() => setSelectedVideo(rec.id === selectedVideo ? null : rec.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer group ${
                      selectedVideo === rec.id 
                        ? 'bg-brand-primary/10 border-brand-primary/50 ring-1 ring-brand-primary/20' 
                        : 'bg-brand-surface border-white/5 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium text-neutral-200 line-clamp-1">{rec.name}</h3>
                      {selectedVideo === rec.id && <Play className="w-4 h-4 text-brand-primary fill-brand-primary" />}
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-neutral-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(rec.date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(rec.duration)}
                      </span>
                    </div>

                    <div className="flex gap-2 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`${t.recordings.buyVideo}: ${rec.name}`);
                        }}
                        className="p-2 hover:bg-brand-primary/10 rounded-lg text-brand-primary transition-colors"
                        title={t.recordings.buyVideo}
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDownload(rec, e)}
                        className="p-2 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white transition-colors"
                        title={t.recordings.download}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(rec.id, e)}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-neutral-400 hover:text-red-400 transition-colors"
                        title={t.recordings.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Video Player */}
          <div className="lg:col-span-2">
            {selectedVideo ? (
              <div className="bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5 sticky top-6">
                {(() => {
                  const video = recordings.find(r => r.id === selectedVideo);
                  if (!video) return null;
                  const url = URL.createObjectURL(video.blob);
                  return (
                    <div className="space-y-4">
                      <video 
                        src={url} 
                        controls 
                        autoPlay 
                        className="w-full aspect-video bg-black"
                      />
                      <div className="p-6 bg-brand-surface">
                        <h2 className="text-2xl font-bold text-white mb-2">{video.name}</h2>
                        <p className="text-neutral-400 text-sm mb-4">
                          {t.recordings.recordedOn} {formatDate(video.date)}
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={(e) => handleDownload(video, e)}
                            className="px-4 py-2 bg-brand-surface hover:bg-white/10 text-white rounded-lg font-medium flex items-center gap-2 transition-colors border border-white/5"
                          >
                            <Download className="w-4 h-4" /> {t.recordings.download}
                          </button>
                          <button
                            onClick={() => alert(`${t.recordings.buyVideo}: ${video.name}`)}
                            className="px-6 py-2 bg-brand-primary hover:bg-brand-primary/80 text-white rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-brand-primary/20"
                          >
                            <ShoppingCart className="w-4 h-4" /> {t.recordings.buyVideo}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white/5 border-2 border-dashed border-white/5 rounded-2xl text-neutral-600 p-8 text-center">
                <Play className="w-16 h-16 mb-4 opacity-50" />
                <h3 className="text-xl font-medium mb-2">{t.recordings.selectVideo}</h3>
                <p>{t.recordings.selectVideoDesc}</p>
              </div>
            )}
          </div>
        </div>

        {/* Community Videos Gallery */}
        <div className="pt-12 border-t border-white/5">
          <div className="flex items-center gap-3 mb-8">
            <Video className="w-6 h-6 text-brand-secondary" />
            <h2 className="text-2xl font-bold text-white">Galería de la Comunidad</h2>
          </div>

          {communityVideos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-neutral-50">
              {communityVideos.map((video) => (
                <div key={video.id} className="group bg-brand-surface border border-white/5 rounded-2xl overflow-hidden hover:border-brand-secondary/30 transition-all hover:-translate-y-1">
                  <div className="relative aspect-video">
                    <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-white line-clamp-1 mb-1">{video.title}</h3>
                    <p className="text-xs text-neutral-500 mb-3">por {video.author}</p>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-xs font-bold text-brand-secondary uppercase tracking-widest">{video.price}</span>
                      <button 
                        onClick={() => window.open(video.video_url, '_blank')}
                        className="text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1"
                      >
                        Ver mas <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white/5 rounded-3xl border border-dashed border-white/5">
              <FileVideo className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
              <p className="text-neutral-500">Aún no hay videos en la galería comunitaria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
