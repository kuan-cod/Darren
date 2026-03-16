import { useState, useEffect } from 'react';
import { useAuth, handleFirestoreError } from '../App';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  orderBy, 
  limit,
  updateDoc,
  doc,
  increment
} from 'firebase/firestore';
import { PublicResource, OperationType, Note } from '../types';
import { 
  Search, 
  BookOpen, 
  Video, 
  Sparkles, 
  ThumbsUp, 
  Plus, 
  ExternalLink,
  ChevronRight,
  Info,
  Share2,
  TrendingUp,
  X,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function StudyHub() {
  const { user, profile, showToast } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [topicOverview, setTopicOverview] = useState<string | null>(null);
  const [resources, setResources] = useState<PublicResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [userNotes, setUserNotes] = useState<Note[]>([]);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [viewingResource, setViewingResource] = useState<PublicResource | null>(null);
  const [publishType, setPublishType] = useState<'note' | 'video'>('note');
  const [selectedNoteToPublish, setSelectedNoteToPublish] = useState<Note | null>(null);
  const [publishForm, setPublishForm] = useState({ title: '', subject: '', description: '' });
  const [videoForm, setVideoForm] = useState({ title: '', url: '', subject: '', description: '' });

  useEffect(() => {
    if (user) {
      fetchUserNotes();
    }
  }, [user]);

  const fetchUserNotes = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, 'users', user.uid, 'notes'), limit(20));
      const snap = await getDocs(q);
      setUserNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Note)));
    } catch (error) {
      console.error("Failed to fetch user notes", error);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setIsLoading(true);
    setIsAiLoading(true);
    setTopicOverview(null);

    try {
      // 1. Get AI Overview
      const model = "gemini-3-flash-preview";
      const prompt = `Provide a concise but comprehensive overview of the study topic: "${searchTerm}". 
      Include key concepts, why it's important, and 3-5 learning objectives. Use markdown formatting.`;
      
      const aiResponse = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      setTopicOverview(aiResponse.text || "No overview available.");
      setIsAiLoading(false);

      // 2. Search Public Resources
      const q = query(
        collection(db, 'public_resources'),
        where('subject', '>=', searchTerm.toLowerCase()),
        where('subject', '<=', searchTerm.toLowerCase() + '\uf8ff'),
        orderBy('subject'),
        orderBy('likes', 'desc'),
        limit(12)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as PublicResource));
      
      // Sort by popularity (likes + views) manually since composite index might not exist
      results.sort((a, b) => (b.likes + b.views) - (a.likes + a.views));
      
      setResources(results);
    } catch (error) {
      console.error("Search failed", error);
      showToast("Failed to fetch study details", "error");
    } finally {
      setIsLoading(false);
      setIsAiLoading(false);
    }
  };

  const publishNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !selectedNoteToPublish) return;
    if (!publishForm.title || !publishForm.subject) {
      showToast("Please fill in all required fields", "error");
      return;
    }
    try {
      await addDoc(collection(db, 'public_resources'), {
        title: publishForm.title,
        description: publishForm.description || `A study note about ${publishForm.subject}.`,
        type: 'note',
        content: selectedNoteToPublish.content || '',
        subject: publishForm.subject.toLowerCase(),
        authorId: user.uid,
        authorName: profile.displayName || 'Anonymous',
        createdAt: new Date().toISOString(),
        likes: 0,
        views: 0
      });
      showToast("Note published to Study Hub!", "success");
      setShowPublishModal(false);
      setSelectedNoteToPublish(null);
      setPublishForm({ title: '', subject: '', description: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'public_resources');
    }
  };

  const publishVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!videoForm.title || !videoForm.url || !videoForm.subject) {
      showToast("Please fill in all required fields", "error");
      return;
    }
    try {
      await addDoc(collection(db, 'public_resources'), {
        title: videoForm.title,
        description: videoForm.description || `A helpful video about ${videoForm.subject}.`,
        type: 'video',
        url: videoForm.url,
        subject: videoForm.subject.toLowerCase(),
        authorId: user.uid,
        authorName: profile.displayName || 'Anonymous',
        createdAt: new Date().toISOString(),
        likes: 0,
        views: 0
      });
      showToast("Video shared to Study Hub!", "success");
      setShowPublishModal(false);
      setVideoForm({ title: '', url: '', subject: '', description: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'public_resources');
    }
  };

  const handleLike = async (resourceId: string) => {
    try {
      await updateDoc(doc(db, 'public_resources', resourceId), {
        likes: increment(1)
      });
      setResources(prev => prev.map(r => r.id === resourceId ? { ...r, likes: r.likes + 1 } : r));
    } catch (error) {
      console.error("Failed to like", error);
    }
  };

  const handleView = async (resource: PublicResource) => {
    try {
      await updateDoc(doc(db, 'public_resources', resource.id), {
        views: increment(1)
      });
      if (resource.type === 'video' && resource.url) {
        window.open(resource.url, '_blank');
      } else {
        setViewingResource(resource);
      }
      setResources(prev => prev.map(r => r.id === resource.id ? { ...r, views: r.views + 1 } : r));
    } catch (error) {
      console.error("Failed to track view", error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header & Search */}
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-serif font-bold text-[#1a1a1a]">Study Hub</h1>
        <p className="text-[#5A5A40] italic max-w-2xl mx-auto">
          Explore topics, discover community notes, and watch curated study videos.
        </p>
        
        <div className="max-w-2xl mx-auto relative">
          <div className="relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[#5A5A40] group-focus-within:text-[#1a1a1a] transition-colors" size={24} />
            <input 
              type="text"
              placeholder="What are you studying today? (e.g. Quantum Physics, Renaissance Art)"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-16 pr-32 py-6 bg-white rounded-[32px] border border-[#E5E5E0] shadow-xl focus:ring-4 focus:ring-[#5A5A40]/10 outline-none text-lg font-serif transition-all"
            />
            <button 
              onClick={handleSearch}
              disabled={isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-8 py-3 bg-[#5A5A40] text-white rounded-full font-medium hover:bg-[#4A4A30] transition-all shadow-lg disabled:opacity-50"
            >
              {isLoading ? 'Exploring...' : 'Explore'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content: AI Overview & Resources */}
        <div className="lg:col-span-2 space-y-8">
          {/* AI Overview */}
          <AnimatePresence mode="wait">
            {(isAiLoading || topicOverview) && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white p-8 rounded-[40px] border border-[#E5E5E0] shadow-sm relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Sparkles size={120} />
                </div>
                
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <Sparkles size={24} />
                  </div>
                  <h2 className="text-2xl font-serif font-bold text-[#1a1a1a]">Topic Insight</h2>
                </div>

                {isAiLoading ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-stone-100 rounded w-3/4"></div>
                    <div className="h-4 bg-stone-100 rounded w-full"></div>
                    <div className="h-4 bg-stone-100 rounded w-5/6"></div>
                    <div className="h-4 bg-stone-100 rounded w-2/3"></div>
                  </div>
                ) : (
                  <div className="markdown-body prose prose-stone max-w-none">
                    <Markdown>{topicOverview || ''}</Markdown>
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>

          {/* Resources Grid */}
          <section className="space-y-6">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-serif font-bold text-[#1a1a1a]">Community Resources</h2>
                <p className="text-sm text-[#5A5A40] italic">Materials shared by fellow students</p>
              </div>
              <button 
                onClick={() => setShowPublishModal(true)}
                className="flex items-center gap-2 text-sm font-bold text-[#5A5A40] hover:text-[#1a1a1a] transition-colors"
              >
                <Share2 size={16} />
                Share Your Work
              </button>
            </div>

            {resources.length === 0 && !isLoading ? (
              <div className="bg-white/50 border border-dashed border-[#E5E5E0] rounded-[32px] p-20 text-center">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-[#E5E5E0]">
                  <BookOpen size={32} />
                </div>
                <p className="text-[#5A5A40] font-serif italic">Search for a topic to see community resources.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {resources.map(resource => (
                  <motion.div 
                    key={resource.id}
                    whileHover={{ y: -4 }}
                    className="bg-white p-6 rounded-[32px] border border-[#E5E5E0] shadow-sm hover:shadow-md transition-all flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className={cn(
                        "p-3 rounded-2xl",
                        resource.type === 'video' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                      )}>
                        {resource.type === 'video' ? <Video size={20} /> : <BookOpen size={20} />}
                      </div>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F5F0] rounded-full text-[#5A5A40] text-[10px] font-bold">
                          <Eye size={12} />
                          {resource.views || 0}
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLike(resource.id);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F5F0] rounded-full text-[#5A5A40] hover:bg-[#5A5A40] hover:text-white transition-all text-[10px] font-bold"
                        >
                          <ThumbsUp size={12} />
                          {resource.likes}
                        </button>
                      </div>
                    </div>

                    <h3 className="text-lg font-serif font-bold text-[#1a1a1a] mb-2">{resource.title}</h3>
                    <p className="text-sm text-[#5A5A40] line-clamp-2 mb-4 flex-1">{resource.description}</p>
                    
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#F5F5F0]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#5A5A40] flex items-center justify-center text-white text-[10px] font-bold">
                          {resource.authorName[0]}
                        </div>
                        <span className="text-xs font-medium text-[#1a1a1a]">{resource.authorName}</span>
                      </div>
                      <button 
                        onClick={() => handleView(resource)}
                        className="text-[#5A5A40] hover:text-[#1a1a1a] transition-colors"
                      >
                        <ExternalLink size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar: Quick Actions & Featured */}
        <div className="space-y-8">
          {/* Contribution Card */}
          <div className="bg-[#5A5A40] p-8 rounded-[40px] text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <Plus size={160} />
            </div>
            <h3 className="text-2xl font-serif font-bold mb-4">Contribute to the Hub</h3>
            <p className="text-white/80 text-sm mb-6 leading-relaxed">
              Help your peers by sharing your best study notes or helpful video tutorials you've found.
            </p>
            <button 
              onClick={() => setShowPublishModal(true)}
              className="w-full py-4 bg-white text-[#5A5A40] rounded-2xl font-bold hover:bg-stone-100 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Publish Resource
            </button>
          </div>

          {/* Trending Topics */}
          <div className="bg-white p-8 rounded-[40px] border border-[#E5E5E0] shadow-sm">
            <h3 className="text-xl font-serif font-bold text-[#1a1a1a] mb-6 flex items-center gap-2">
              <TrendingUp size={20} className="text-[#5A5A40]" />
              Trending Topics
            </h3>
            <div className="space-y-2">
              {['Organic Chemistry', 'Machine Learning', 'Ancient History', 'Calculus III', 'Microeconomics'].map(topic => (
                <button 
                  key={topic}
                  onClick={() => {
                    setSearchTerm(topic);
                    handleSearch();
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-[#F5F5F0] transition-all group text-left"
                >
                  <span className="font-medium text-[#5A5A40] group-hover:text-[#1a1a1a]">{topic}</span>
                  <ChevronRight size={16} className="text-[#E5E5E0] group-hover:text-[#5A5A40] transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Publish Modal */}
      <AnimatePresence>
        {showPublishModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPublishModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white p-8 rounded-[40px] shadow-2xl border border-[#E5E5E0] max-w-md w-full"
            >
              <button 
                onClick={() => setShowPublishModal(false)}
                className="absolute right-6 top-6 p-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] mb-2">Publish to Hub</h3>
              <p className="text-[#5A5A40] text-sm mb-6 italic">Share your knowledge with the community.</p>

              <div className="flex gap-2 mb-6 p-1 bg-[#F5F5F0] rounded-2xl">
                <button 
                  onClick={() => setPublishType('note')}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                    publishType === 'note' ? "bg-white text-[#1a1a1a] shadow-sm" : "text-[#5A5A40]"
                  )}
                >
                  Note
                </button>
                <button 
                  onClick={() => setPublishType('video')}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                    publishType === 'video' ? "bg-white text-[#1a1a1a] shadow-sm" : "text-[#5A5A40]"
                  )}
                >
                  Video
                </button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {publishType === 'note' ? (
                  !selectedNoteToPublish ? (
                    userNotes.length === 0 ? (
                      <p className="text-center py-8 text-[#5A5A40]">You don't have any notes yet.</p>
                    ) : (
                      userNotes.map(note => (
                        <div 
                          key={note.id} 
                          className="p-4 bg-[#F5F5F0] rounded-2xl flex items-center justify-between group hover:bg-[#5A5A40] transition-all cursor-pointer" 
                          onClick={() => {
                            setSelectedNoteToPublish(note);
                            setPublishForm({
                              title: note.title,
                              subject: note.subject || '',
                              description: ''
                            });
                          }}
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-[#1a1a1a] group-hover:text-white truncate">{note.title}</p>
                            <p className="text-xs text-[#5A5A40] group-hover:text-white/70">{note.subject || 'No subject'}</p>
                          </div>
                          <ChevronRight size={18} className="text-[#5A5A40] group-hover:text-white" />
                        </div>
                      ))
                    )
                  ) : (
                    <form onSubmit={publishNote} className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <button 
                          type="button"
                          onClick={() => setSelectedNoteToPublish(null)}
                          className="text-xs font-bold text-[#5A5A40] hover:underline"
                        >
                          ← Back to list
                        </button>
                      </div>
                      <input 
                        type="text"
                        placeholder="Note Title"
                        value={publishForm.title}
                        onChange={e => setPublishForm({ ...publishForm, title: e.target.value })}
                        className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                      />
                      <input 
                        type="text"
                        placeholder="Subject (e.g. Biology)"
                        value={publishForm.subject}
                        onChange={e => setPublishForm({ ...publishForm, subject: e.target.value })}
                        className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                      />
                      <textarea 
                        placeholder="Brief description of what this note covers"
                        value={publishForm.description}
                        onChange={e => setPublishForm({ ...publishForm, description: e.target.value })}
                        className="w-full h-24 px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none resize-none"
                      />
                      <button 
                        type="submit"
                        className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4A4A30] transition-all"
                      >
                        Publish Note
                      </button>
                    </form>
                  )
                ) : (
                  <form onSubmit={publishVideo} className="space-y-4">
                    <input 
                      type="text"
                      placeholder="Video Title"
                      value={videoForm.title}
                      onChange={e => setVideoForm({ ...videoForm, title: e.target.value })}
                      className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                    />
                    <input 
                      type="url"
                      placeholder="Video URL (YouTube, Vimeo, etc.)"
                      value={videoForm.url}
                      onChange={e => setVideoForm({ ...videoForm, url: e.target.value })}
                      className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                    />
                    <input 
                      type="text"
                      placeholder="Subject (e.g. Physics)"
                      value={videoForm.subject}
                      onChange={e => setVideoForm({ ...videoForm, subject: e.target.value })}
                      className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                    />
                    <textarea 
                      placeholder="Description (optional)"
                      value={videoForm.description}
                      onChange={e => setVideoForm({ ...videoForm, description: e.target.value })}
                      className="w-full h-24 px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none resize-none"
                    />
                    <button 
                      type="submit"
                      className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4A4A30] transition-all"
                    >
                      Share Video
                    </button>
                  </form>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-[#F5F5F0] flex items-center gap-3 text-[#5A5A40]">
                <Info size={16} />
                <p className="text-[10px] uppercase tracking-wider font-bold">
                  Published resources are visible to everyone.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Note View Modal */}
      <AnimatePresence>
        {viewingResource && viewingResource.type === 'note' && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingResource(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-[40px] shadow-2xl border border-[#E5E5E0] max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-[#F5F5F0] flex justify-between items-start bg-white sticky top-0 z-10">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {viewingResource.subject}
                    </span>
                    <span className="text-xs text-[#5A5A40]">
                      Shared by {viewingResource.authorName}
                    </span>
                  </div>
                  <h3 className="text-3xl font-serif font-bold text-[#1a1a1a]">{viewingResource.title}</h3>
                </div>
                <button 
                  onClick={() => setViewingResource(null)}
                  className="p-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-8 bg-[#FDFDFB]">
                <div className="markdown-body prose prose-stone max-w-none">
                  <Markdown>{viewingResource.content || ''}</Markdown>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-[#F5F5F0] flex justify-between items-center bg-white">
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-[#5A5A40] text-sm font-medium">
                    <Eye size={18} />
                    {viewingResource.views} Views
                  </div>
                  <div className="flex items-center gap-1.5 text-[#5A5A40] text-sm font-medium">
                    <ThumbsUp size={18} />
                    {viewingResource.likes} Likes
                  </div>
                </div>
                <button 
                  onClick={() => handleLike(viewingResource.id)}
                  className="px-6 py-2 bg-[#5A5A40] text-white rounded-full font-bold hover:bg-[#4A4A30] transition-all flex items-center gap-2"
                >
                  <ThumbsUp size={18} />
                  Like this Note
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
