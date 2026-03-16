import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot,
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, handleFirestoreError } from '../App';
import { UserProfile, Friendship, Note, OperationType, StudySession } from '../types';
import { Search, UserPlus, Check, X, Users, Share2, BookOpen, Clock, MapPin, TrendingUp } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export default function Social() {
  const { user, profile, navigateToNote, showToast } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [pendingProfiles, setPendingProfiles] = useState<{[key: string]: UserProfile}>({});
  const [sharedNotes, setSharedNotes] = useState<Note[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [confirmUnfriend, setConfirmUnfriend] = useState<UserProfile | null>(null);
  const [selectedFriendProfile, setSelectedFriendProfile] = useState<UserProfile | null>(null);
  const [selectedFriendStats, setSelectedFriendStats] = useState<{ hours: number; sessions: number } | null>(null);

  useEffect(() => {
    if (!user) return;

    // Listen to friendships
    const friendshipsRef = collection(db, 'friendships');
    const q = query(friendshipsRef, where('users', 'array-contains', user.uid));

    const unsubscribeFriendships = onSnapshot(q, async (snapshot) => {
      const friendshipsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Friendship[];
      setFriendships(friendshipsData);

      // Fetch friend profiles
      const friendIds = friendshipsData
        .filter(f => f.status === 'accepted')
        .map(f => f.users.find(id => id !== user.uid)!);

      if (friendIds.length > 0) {
        const friendsProfiles: UserProfile[] = [];
        const chunks = [];
        for (let i = 0; i < friendIds.length; i += 10) {
          chunks.push(friendIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const profileSnap = await getDocs(query(collection(db, 'users_public'), where('uid', 'in', chunk)));
          profileSnap.docs.forEach(doc => {
            friendsProfiles.push(doc.data() as UserProfile);
          });
        }
        setFriends(friendsProfiles);
      } else {
        setFriends([]);
      }

      // Fetch pending requester profiles
      const pendingRequesterIds = friendshipsData
        .filter(f => f.status === 'pending' && f.requesterId !== user.uid)
        .map(f => f.requesterId);

      if (pendingRequesterIds.length > 0) {
        const newPendingProfiles: {[key: string]: UserProfile} = {};
        // Firestore 'in' query supports up to 10 IDs
        const chunks = [];
        for (let i = 0; i < pendingRequesterIds.length; i += 10) {
          chunks.push(pendingRequesterIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const profileSnap = await getDocs(query(collection(db, 'users_public'), where('uid', 'in', chunk)));
          profileSnap.docs.forEach(doc => {
            const data = doc.data() as UserProfile;
            newPendingProfiles[data.uid] = data;
          });
        }
        setPendingProfiles(newPendingProfiles);
      } else {
        setPendingProfiles({});
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'friendships'));

    // Listen to shared notes
    // We need to query all users' notes where sharedWith contains user.uid
    // This is tricky because sharedWith is in a subcollection.
    // Actually, we can't easily query across all subcollections in Firestore without Collection Group queries.
    // For now, let's assume we have a top-level 'shared_notes' or just use the friends' IDs to check their notes.
    // Better: Use a collection group query for 'notes'.
    // But we need to enable it in the console.
    // Alternative: Just fetch notes from accepted friends.
    
    return () => unsubscribeFriendships();
  }, [user]);

  useEffect(() => {
    if (!user || friends.length === 0) {
      setSharedNotes([]);
      return;
    }

    const unsubscribes: (() => void)[] = [];

    friends.forEach(friend => {
      const notesRef = collection(db, 'users', friend.uid, 'notes');
      const q = query(notesRef, where('sharedWith', 'array-contains', user.uid));
      
      const unsub = onSnapshot(q, (snapshot) => {
        const notes = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Note[];
        
        setSharedNotes(prev => {
          const otherFriendsNotes = prev.filter(n => n.ownerId !== friend.uid);
          return [...otherFriendsNotes, ...notes];
        });
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user, friends]);

  useEffect(() => {
    if (!selectedFriendProfile) {
      setSelectedFriendStats(null);
      return;
    }

    const fetchStats = async () => {
      try {
        const sessionsRef = collection(db, 'users', selectedFriendProfile.uid, 'sessions');
        const q = query(sessionsRef, where('status', '==', 'completed'));
        const snapshot = await getDocs(q);
        
        const sessions = snapshot.docs.map(doc => doc.data() as StudySession);
        const totalMinutes = sessions.reduce((acc, session) => {
          const start = parseISO(session.startTime);
          const end = parseISO(session.endTime);
          return acc + Math.max(0, differenceInMinutes(end, start));
        }, 0);
        
        setSelectedFriendStats({
          hours: parseFloat((totalMinutes / 60).toFixed(1)),
          sessions: sessions.length
        });
      } catch (error) {
        console.error("Failed to fetch friend stats", error);
      }
    };

    fetchStats();
  }, [selectedFriendProfile]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setIsSearching(true);
    try {
      const term = searchTerm.trim().toLowerCase();
      // Search by username
      const q = query(
        collection(db, 'users_public'), 
        where('username', '==', term),
        limit(5)
      );
      const snapshot = await getDocs(q);
      let results = snapshot.docs
        .map(doc => doc.data() as UserProfile)
        .filter(p => p.uid !== user?.uid);

      // If no results by username, try email (for backward compatibility or flexibility)
      if (results.length === 0) {
        const qEmail = query(
          collection(db, 'users_public'), 
          where('email', '==', term),
          limit(5)
        );
        const snapshotEmail = await getDocs(qEmail);
        results = snapshotEmail.docs
          .map(doc => doc.data() as UserProfile)
          .filter(p => p.uid !== user?.uid);
      }

      setSearchResults(results);
      if (results.length === 0) {
        showToast('No users found', 'info');
      }
    } catch (error) {
      showToast('Search failed', 'error');
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async (targetUser: UserProfile) => {
    if (!user) return;
    try {
      // Check if already exists
      const existing = friendships.find(f => f.users.includes(targetUser.uid));
      if (existing) return;

      await addDoc(collection(db, 'friendships'), {
        users: [user.uid, targetUser.uid],
        status: 'pending',
        createdAt: new Date().toISOString(),
        requesterId: user.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'friendships');
    }
  };

  const updateFriendshipStatus = async (friendshipId: string, status: 'accepted' | 'rejected') => {
    try {
      if (status === 'rejected') {
        await deleteDoc(doc(db, 'friendships', friendshipId));
      } else {
        await updateDoc(doc(db, 'friendships', friendshipId), { status });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `friendships/${friendshipId}`);
    }
  };

  const unfriend = async (friendId: string) => {
    if (!user) return;
    try {
      const friendship = friendships.find(f => f.users.includes(friendId) && f.status === 'accepted');
      if (friendship) {
        await deleteDoc(doc(db, 'friendships', friendship.id));
        showToast('Friend removed', 'info');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'friendships');
    }
  };

  const pendingRequests = friendships.filter(f => f.status === 'pending' && f.requesterId !== user?.uid);
  const sentRequests = friendships.filter(f => f.status === 'pending' && f.requesterId === user?.uid);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <AnimatePresence>
        {selectedFriendProfile && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFriendProfile(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white p-8 rounded-[32px] shadow-2xl border border-[#E5E5E0] max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setSelectedFriendProfile(null)}
                className="absolute right-6 top-6 p-2 text-[#5A5A40] hover:bg-[#F5F5F0] rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col md:flex-row gap-8">
                <div className="text-center md:text-left">
                  <div className="w-24 h-24 rounded-full bg-[#5A5A40] flex items-center justify-center text-white text-3xl font-bold mx-auto md:mx-0 mb-4">
                    {selectedFriendProfile.photoURL ? (
                      <img src={selectedFriendProfile.photoURL} alt={selectedFriendProfile.displayName} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      selectedFriendProfile.displayName?.[0] || 'U'
                    )}
                  </div>
                  <h3 className="text-2xl font-serif font-bold text-[#1a1a1a]">{selectedFriendProfile.displayName}</h3>
                  <p className="text-[#5A5A40]">@{selectedFriendProfile.username}</p>
                  
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center gap-2 text-sm text-[#5A5A40]">
                      <MapPin size={16} />
                      <span>{selectedFriendProfile.studyPlace || 'No location set'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[#5A5A40]">
                      <Users size={16} />
                      <span>{selectedFriendProfile.age ? `${selectedFriendProfile.age} years old` : 'Age not shared'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[#5A5A40]">
                      <Clock size={16} />
                      <span>{selectedFriendStats ? `${selectedFriendStats.hours}h (${selectedFriendStats.sessions} sessions)` : 'Loading stats...'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-6 text-left">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#5A5A40] mb-3">Courses Taking</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedFriendProfile.courses && selectedFriendProfile.courses.length > 0 ? (
                        selectedFriendProfile.courses.map((course, i) => (
                          <span key={i} className="px-3 py-1 bg-[#F5F5F0] text-[#5A5A40] rounded-lg text-xs font-medium">
                            {course}
                          </span>
                        ))
                      ) : (
                        <p className="text-xs text-[#5A5A40] italic">No courses listed.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#5A5A40] mb-3">Study Progress</h4>
                    <div className="p-4 bg-[#F5F5F0] rounded-2xl">
                      <p className="text-sm text-[#1a1a1a] leading-relaxed whitespace-pre-wrap">
                        {selectedFriendProfile.studyProgress || 'No progress updates shared yet.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {confirmUnfriend && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmUnfriend(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white p-8 rounded-[32px] shadow-2xl border border-[#E5E5E0] max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users size={32} />
              </div>
              <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] mb-2">Unfriend {confirmUnfriend.displayName}?</h3>
              <p className="text-[#5A5A40] mb-8">
                You will no longer be able to see each other's shared notes. This action can be undone by sending a new request.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmUnfriend(null)}
                  className="flex-1 px-6 py-3 rounded-2xl border border-[#E5E5E0] text-[#5A5A40] font-medium hover:bg-[#F5F5F0] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    unfriend(confirmUnfriend.uid);
                    setConfirmUnfriend(null);
                  }}
                  className="flex-1 px-6 py-3 rounded-2xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-200"
                >
                  Unfriend
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-serif text-[#1a1a1a]">Social</h1>
        <div className="flex items-center gap-2 text-[#5A5A40] bg-white px-4 py-2 rounded-full border border-[#E5E5E0] shadow-sm">
          <Users size={18} />
          <span className="font-medium">{friends.length} Friends</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Search & Friends */}
        <div className="lg:col-span-1 space-y-8">
          {/* Search Section */}
          <section className="bg-white p-6 rounded-3xl border border-[#E5E5E0] shadow-sm">
            <h2 className="text-xl font-serif font-bold text-[#1a1a1a] mb-4">Find Friends</h2>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5A40]" size={16} />
                <input 
                  type="text"
                  placeholder="Search by username or email..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none text-sm"
                />
              </div>
              <button 
                onClick={handleSearch}
                disabled={isSearching}
                className="px-4 py-2 bg-[#5A5A40] text-white rounded-xl hover:bg-[#4A4A30] transition-colors disabled:opacity-50"
              >
                {isSearching ? '...' : 'Search'}
              </button>
            </div>

            <div className="space-y-3">
              {searchResults.map(result => (
                <div key={result.uid} className="flex items-center justify-between p-3 bg-[#F5F5F0] rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#5A5A40] flex items-center justify-center text-white text-xs font-bold">
                      {result.displayName?.[0] || 'U'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">
                        {result.username ? `@${result.username}` : result.displayName}
                      </p>
                      <p className="text-[10px] text-[#5A5A40] truncate">
                        {result.username ? result.displayName : result.email}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => sendFriendRequest(result)}
                    className="p-2 text-[#5A5A40] hover:bg-white rounded-full transition-colors"
                  >
                    <UserPlus size={18} />
                  </button>
                </div>
              ))}
              {searchTerm && searchResults.length === 0 && !isSearching && (
                <p className="text-center text-xs text-[#5A5A40] py-4">No users found.</p>
              )}
            </div>
          </section>

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <section className="bg-white p-6 rounded-3xl border border-[#E5E5E0] shadow-sm">
              <h2 className="text-xl font-serif font-bold text-[#1a1a1a] mb-4">Friend Requests</h2>
              <div className="space-y-3">
                {pendingRequests.map(req => (
                  <div key={req.id} className="flex items-center justify-between p-3 bg-[#F5F5F0] rounded-2xl">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">
                        {pendingProfiles[req.requesterId]?.username ? `@${pendingProfiles[req.requesterId].username}` : (pendingProfiles[req.requesterId]?.displayName || 'New Request')}
                      </p>
                      <p className="text-[10px] text-[#5A5A40] truncate">
                        {pendingProfiles[req.requesterId]?.username ? pendingProfiles[req.requesterId].displayName : 'Friend Request'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => updateFriendshipStatus(req.id, 'accepted')}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-full transition-colors"
                      >
                        <Check size={18} />
                      </button>
                      <button 
                        onClick={() => updateFriendshipStatus(req.id, 'rejected')}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Friends List */}
          <section className="bg-white p-6 rounded-3xl border border-[#E5E5E0] shadow-sm">
            <h2 className="text-xl font-serif font-bold text-[#1a1a1a] mb-4">Friends</h2>
            <div className="space-y-4">
              {friends.length === 0 ? (
                <p className="text-center text-sm text-[#5A5A40] py-8 italic">No friends yet. Start searching!</p>
              ) : (
                friends.map(friend => (
                  <div key={friend.uid} className="flex items-center gap-4 p-2 group">
                    <div 
                      onClick={() => setSelectedFriendProfile(friend)}
                      className="w-10 h-10 rounded-full bg-[#5A5A40] flex items-center justify-center text-white font-bold cursor-pointer hover:ring-2 hover:ring-[#5A5A40] transition-all"
                    >
                      {friend.displayName?.[0] || 'U'}
                    </div>
                    <div 
                      onClick={() => setSelectedFriendProfile(friend)}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <p className="text-sm font-medium text-[#1a1a1a] truncate group-hover:text-[#5A5A40] transition-colors">
                        {friend.username ? `@${friend.username}` : friend.displayName}
                      </p>
                      <p className="text-xs text-[#5A5A40] truncate">
                        {friend.username ? friend.displayName : 'Friend'}
                      </p>
                    </div>
                    <button 
                      onClick={() => setConfirmUnfriend(friend)}
                      className="p-2 text-[#E5E5E0] hover:text-red-500 transition-colors"
                      title="Unfriend"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Shared Notes */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white p-8 rounded-3xl border border-[#E5E5E0] shadow-sm min-h-[600px]">
            <div className="flex items-center gap-3 mb-8">
              <Share2 className="text-[#5A5A40]" size={24} />
              <h2 className="text-2xl font-serif font-bold text-[#1a1a1a]">Shared with Me</h2>
            </div>

            {sharedNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#E5E5E0]">
                <BookOpen size={64} className="mb-4" />
                <p className="font-serif italic text-[#5A5A40]">No notes shared with you yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sharedNotes.map(note => (
                  <motion.div 
                    key={note.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => navigateToNote(note.id, note.ownerId)}
                    className="p-6 rounded-2xl border border-[#E5E5E0] hover:border-[#5A5A40] transition-all group cursor-pointer bg-[#F5F5F0]/30"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-white rounded-xl text-[#5A5A40] shadow-sm">
                        <BookOpen size={20} />
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[#5A5A40] font-bold uppercase tracking-widest">Shared By</p>
                        <p className="text-xs font-medium text-[#1a1a1a]">{note.ownerName || 'Friend'}</p>
                      </div>
                    </div>
                    <h3 className="text-lg font-serif font-bold text-[#1a1a1a] mb-2 group-hover:text-[#5A5A40] transition-colors">
                      {note.title}
                    </h3>
                    <p className="text-sm text-[#5A5A40] line-clamp-3 mb-4">
                      {note.type === 'canvas' ? 'Interactive Canvas Board' : (note.content || 'No content...')}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-[#E5E5E0] font-medium uppercase tracking-wider">
                      <Clock size={12} />
                      {format(parseISO(note.lastModified), 'MMM d, yyyy')}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
