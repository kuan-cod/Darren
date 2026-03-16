import { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc, 
  updateDoc,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, handleFirestoreError, cn } from '../App';
import { Note, OperationType } from '../types';
import { Plus, Trash2, FileText, Sparkles, Save, ChevronLeft, Search, Layout, Share2, Users, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { summarizeNote } from '../services/gemini';
import CanvasBoard from './CanvasBoard';
import { UserProfile, Friendship } from '../types';

export default function Notes() {
  const { user, profile, navigationRequest, clearNavigationRequest } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [friends, setFriends] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (navigationRequest && notes.length > 0) {
      const note = notes.find(n => n.id === navigationRequest.noteId && n.ownerId === navigationRequest.ownerId);
      if (note) {
        setSelectedNote(note);
        setEditTitle(note.title);
        setEditContent(note.content || '');
        setIsEditing(false);
        clearNavigationRequest();
      }
    }
  }, [navigationRequest, notes]);

  useEffect(() => {
    if (!user) return;

    // Listen to user's notes
    const notesRef = collection(db, 'users', user.uid, 'notes');
    const q = query(notesRef, orderBy('lastModified', 'desc'));

    const unsubscribeNotes = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[];
      
      setNotes(prev => {
        const shared = prev.filter(n => n.ownerId !== user.uid);
        return [...notesData, ...shared].sort((a, b) => 
          new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
        );
      });
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/notes`));

    // Listen to friendships to get potential share targets
    const friendshipsRef = collection(db, 'friendships');
    const fq = query(friendshipsRef, where('users', 'array-contains', user.uid), where('status', '==', 'accepted'));
    
    const unsubscribeFriends = onSnapshot(fq, async (snapshot) => {
      const friendIds = snapshot.docs.map(doc => {
        const data = doc.data() as Friendship;
        return data.users.find(id => id !== user.uid)!;
      });

      if (friendIds.length > 0) {
        const friendProfiles: UserProfile[] = [];
        for (const id of friendIds) {
          const profileSnap = await getDocs(query(collection(db, 'users_public'), where('uid', '==', id)));
          if (!profileSnap.empty) {
            friendProfiles.push(profileSnap.docs[0].data() as UserProfile);
          }
        }
        setFriends(friendProfiles);

        // Also listen to shared notes from these friends
        const sharedUnsubs = friendIds.map(friendId => {
          const sharedQ = query(collection(db, 'users', friendId, 'notes'), where('sharedWith', 'array-contains', user.uid));
          return onSnapshot(sharedQ, (snap) => {
            const sharedNotes = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Note[];
            setNotes(prev => {
              const myNotesAndOtherShared = prev.filter(n => n.ownerId !== friendId);
              return [...myNotesAndOtherShared, ...sharedNotes].sort((a, b) => 
                new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
              );
            });
          });
        });

        return () => sharedUnsubs.forEach(unsub => unsub());
      }
    });

    return () => {
      unsubscribeNotes();
      unsubscribeFriends();
    };
  }, [user]);

  const handleCreateNote = async (type: 'document' | 'canvas') => {
    if (!user) return;
    try {
      const newNote: Omit<Note, 'id'> = {
        title: type === 'document' ? 'Untitled Note' : 'Untitled Canvas',
        content: '',
        lastModified: new Date().toISOString(),
        type: type,
        ownerId: user.uid,
        ownerName: profile?.username || profile?.displayName || user.displayName || 'Anonymous',
        sharedWith: []
      };
      const docRef = await addDoc(collection(db, 'users', user.uid, 'notes'), newNote);
      setSelectedNote({ id: docRef.id, ...newNote });
      setIsEditing(type === 'document');
      setEditTitle(newNote.title);
      setEditContent('');
      setShowTypeSelector(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/notes`);
    }
  };

  const handleSave = async () => {
    if (!user || !selectedNote) return;
    try {
      await updateDoc(doc(db, 'users', selectedNote.ownerId, 'notes', selectedNote.id), {
        title: editTitle,
        content: editContent,
        lastModified: new Date().toISOString(),
      });
      setIsEditing(false);
      setSelectedNote({ ...selectedNote, title: editTitle, content: editContent });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${selectedNote.ownerId}/notes/${selectedNote.id}`);
    }
  };

  const handleDelete = async (note: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (note.ownerId !== user.uid) {
      // If shared, just remove from sharedWith? 
      // Actually, only owner can delete. Shared users can "unfollow" but let's keep it simple.
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'notes', note.id));
      if (selectedNote?.id === note.id) {
        setSelectedNote(null);
        setIsEditing(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/notes/${note.id}`);
    }
  };

  const toggleShare = async (friendId: string) => {
    if (!user || !selectedNote || selectedNote.ownerId !== user.uid) return;
    const currentShared = selectedNote.sharedWith || [];
    const newShared = currentShared.includes(friendId)
      ? currentShared.filter(id => id !== friendId)
      : [...currentShared, friendId];
    
    try {
      await updateDoc(doc(db, 'users', user.uid, 'notes', selectedNote.id), {
        sharedWith: newShared
      });
      setSelectedNote({ ...selectedNote, sharedWith: newShared });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/notes/${selectedNote.id}`);
    }
  };

  const handleSummarize = async () => {
    if (!editContent && selectedNote?.type === 'document') return;
    setIsSummarizing(true);
    const result = await summarizeNote(editContent);
    setSummary(result);
    setIsSummarizing(false);
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (n.content?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const isOwner = selectedNote?.ownerId === user?.uid;

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-8">
      {/* Sidebar List */}
      <div className="w-80 flex flex-col gap-6">
        <div className="flex justify-between items-center relative">
          <h1 className="text-4xl font-serif text-[#1a1a1a]">Notes</h1>
          <button 
            onClick={() => setShowTypeSelector(!showTypeSelector)}
            className="p-2 bg-[#5A5A40] text-white rounded-full shadow-md hover:bg-[#4A4A30] transition-all"
          >
            <Plus size={20} />
          </button>
          
          <AnimatePresence>
            {showTypeSelector && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-[#E5E5E0] z-20 overflow-hidden"
              >
                <button 
                  onClick={() => handleCreateNote('document')}
                  className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F0] text-[#5A5A40] transition-colors"
                >
                  <FileText size={18} />
                  <span className="font-medium">Document Note</span>
                </button>
                <button 
                  onClick={() => handleCreateNote('canvas')}
                  className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F0] text-[#5A5A40] transition-colors"
                >
                  <Layout size={18} />
                  <span className="font-medium">Canvas Board</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5A40]" size={16} />
          <input 
            type="text"
            placeholder="Search notes..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white rounded-xl border border-[#E5E5E0] focus:ring-2 focus:ring-[#5A5A40] outline-none text-sm"
          />
        </div>

        <div className="flex-1 overflow-auto space-y-3 pr-2">
          {filteredNotes.map(note => (
            <div 
              key={note.id}
              onClick={() => {
                setSelectedNote(note);
                setEditTitle(note.title);
                setEditContent(note.content || '');
                setIsEditing(false);
                setSummary(null);
              }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                selectedNote?.id === note.id 
                  ? 'bg-white border-[#5A5A40] shadow-md' 
                  : 'bg-white/50 border-transparent hover:bg-white hover:border-[#E5E5E0]'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2 truncate pr-4">
                  {note.type === 'canvas' ? <Layout size={14} className="text-[#5A5A40]" /> : <FileText size={14} className="text-[#5A5A40]" />}
                  <h3 className="font-bold text-[#1a1a1a] truncate">{note.title}</h3>
                </div>
                {note.ownerId === user?.uid && (
                  <button 
                    onClick={(e) => handleDelete(note, e)}
                    className="p-1 text-[#E5E5E0] hover:text-red-500 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-[#5A5A40] line-clamp-1">
                  {note.ownerId !== user?.uid ? `From @${note.ownerName}` : (note.type === 'canvas' ? 'Interactive Canvas' : (note.content || 'No content'))}
                </p>
                {note.sharedWith && note.sharedWith.length > 0 && (
                  <Share2 size={12} className="text-[#5A5A40]" />
                )}
              </div>
              <p className="text-[10px] text-[#E5E5E0] font-medium uppercase tracking-wider mt-2">
                {format(parseISO(note.lastModified), 'MMM d, yyyy')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Editor/Viewer */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-[#E5E5E0] flex flex-col overflow-hidden">
        {selectedNote ? (
          <>
            <div className="p-6 border-b border-[#E5E5E0] flex justify-between items-center">
              <div className="flex-1">
                {isEditing ? (
                  <input 
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="text-2xl font-serif font-bold text-[#1a1a1a] w-full outline-none"
                    placeholder="Note Title"
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-serif font-bold text-[#1a1a1a]">{selectedNote.title}</h2>
                    {selectedNote.ownerId !== user?.uid && (
                      <span className="px-2 py-1 bg-[#F5F5F0] text-[#5A5A40] text-[10px] font-bold uppercase rounded-md">Shared</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {selectedNote.type === 'document' && (
                  <button 
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                    className="flex items-center gap-2 px-4 py-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Sparkles size={18} />
                    <span className="text-sm font-medium">{isSummarizing ? 'Summarizing...' : 'AI Summary'}</span>
                  </button>
                )}
                
                {isEditing ? (
                  <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 px-6 py-2 bg-[#5A5A40] text-white rounded-full font-medium shadow-md hover:bg-[#4A4A30]"
                  >
                    <Save size={18} />
                    Save
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="px-6 py-2 border border-[#5A5A40] text-[#5A5A40] rounded-full font-medium hover:bg-[#5A5A40] hover:text-white transition-all"
                    >
                      Edit
                    </button>
                    {isOwner && (
                      <>
                        <button 
                          onClick={() => setShowShareModal(true)}
                          className="p-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-full transition-colors"
                          title="Share Note"
                        >
                          <Share2 size={20} />
                        </button>
                        <button 
                          onClick={(e) => handleDelete(selectedNote, e as any)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete Note"
                        >
                          <Trash2 size={20} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {selectedNote.type === 'canvas' ? (
                <CanvasBoard noteId={selectedNote.id} ownerId={selectedNote.ownerId} />
              ) : (
                <>
                  <div className={`flex-1 overflow-auto p-8 ${summary ? 'w-2/3' : 'w-full'}`}>
                    {isEditing ? (
                      <textarea 
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        className="w-full h-full outline-none resize-none font-sans text-lg text-[#1a1a1a]"
                        placeholder="Start writing your study notes in Markdown..."
                      />
                    ) : (
                      <div className="prose prose-stone max-w-none">
                        <ReactMarkdown>{selectedNote.content || ''}</ReactMarkdown>
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {summary && (
                      <motion.div 
                        initial={{ x: 300, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 300, opacity: 0 }}
                        className="w-1/3 border-l border-[#E5E5E0] bg-[#F5F5F0] p-6 overflow-auto"
                      >
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-serif font-bold text-[#5A5A40] flex items-center gap-2">
                            <Sparkles size={16} />
                            AI Summary
                          </h3>
                          <button onClick={() => setSummary(null)} className="text-[#5A5A40] hover:text-[#1a1a1a]">
                            <Plus size={16} className="rotate-45" />
                          </button>
                        </div>
                        <div className="text-sm text-[#1a1a1a] leading-relaxed prose prose-sm">
                          <ReactMarkdown>{summary}</ReactMarkdown>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#E5E5E0]">
            <FileText size={64} className="mb-4" />
            <p className="font-serif italic text-[#5A5A40]">Select a note or create a new one to begin.</p>
          </div>
        )}
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-[#E5E5E0] overflow-hidden"
            >
              <div className="p-6 border-b border-[#E5E5E0] flex justify-between items-center">
                <h3 className="text-xl font-serif font-bold text-[#1a1a1a]">Share Note</h3>
                <button onClick={() => setShowShareModal(false)} className="text-[#5A5A40] hover:text-[#1a1a1a]">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-[#5A5A40]">Share this note with your friends to collaborate.</p>
                <div className="space-y-2 max-h-60 overflow-auto">
                  {friends.length === 0 ? (
                    <p className="text-center py-4 text-xs text-[#5A5A40] italic">No friends found. Add friends in the Social tab.</p>
                  ) : (
                    friends.map(friend => (
                      <div key={friend.uid} className="flex items-center justify-between p-3 bg-[#F5F5F0] rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#5A5A40] flex items-center justify-center text-white text-xs font-bold">
                            {friend.displayName?.[0] || 'U'}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-[#1a1a1a]">{friend.displayName}</span>
                            <span className="text-[10px] text-[#5A5A40]">@{friend.username || 'no-username'}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => toggleShare(friend.uid)}
                          className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                            selectedNote?.sharedWith?.includes(friend.uid)
                              ? "bg-[#5A5A40] text-white"
                              : "border border-[#5A5A40] text-[#5A5A40] hover:bg-[#5A5A40] hover:text-white"
                          )}
                        >
                          {selectedNote?.sharedWith?.includes(friend.uid) ? 'Shared' : 'Share'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="p-6 bg-[#F5F5F0] flex justify-end">
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="px-6 py-2 bg-[#5A5A40] text-white rounded-full font-medium shadow-md hover:bg-[#4A4A30]"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
