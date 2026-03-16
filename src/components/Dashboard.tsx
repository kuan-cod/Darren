import { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, handleFirestoreError } from '../App';
import { StudySession, Note, OperationType } from '../types';
import { Calendar, BookOpen, Clock, ArrowRight, TrendingUp } from 'lucide-react';
import { format, parseISO, isToday, isFuture } from 'date-fns';
import { motion } from 'motion/react';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [upcomingSession, setUpcomingSession] = useState<StudySession | null>(null);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState({
    totalSessions: 0,
    completedSessions: 0,
    totalNotes: 0,
    totalFriends: 0
  });

  useEffect(() => {
    if (!user) return;

    const sessionsRef = collection(db, 'users', user.uid, 'sessions');
    const notesRef = collection(db, 'users', user.uid, 'notes');
    const friendshipsRef = collection(db, 'friendships');

    // Upcoming session
    const upcomingQuery = query(
      sessionsRef, 
      where('status', '==', 'planned'),
      orderBy('startTime', 'asc'),
      limit(1)
    );

    const unsubSessions = onSnapshot(upcomingQuery, (snapshot) => {
      if (!snapshot.empty) {
        setUpcomingSession({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as StudySession);
      } else {
        setUpcomingSession(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/sessions`));

    // Recent notes
    const notesQuery = query(notesRef, orderBy('lastModified', 'desc'), limit(3));
    const unsubNotes = onSnapshot(notesQuery, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Note[];
      setRecentNotes(notesData);
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/notes`));

    // Stats
    const allSessionsQuery = query(sessionsRef);
    const unsubStats = onSnapshot(allSessionsQuery, (snapshot) => {
      const all = snapshot.docs.map(d => d.data() as StudySession);
      setStats(prev => ({
        ...prev,
        totalSessions: all.length,
        completedSessions: all.filter(s => s.status === 'completed').length
      }));
    });

    const unsubNoteStats = onSnapshot(notesRef, (snapshot) => {
      setStats(prev => ({ ...prev, totalNotes: snapshot.size }));
    });

    // Friends count
    const friendsQuery = query(friendshipsRef, where('users', 'array-contains', user.uid), where('status', '==', 'accepted'));
    const unsubFriends = onSnapshot(friendsQuery, (snapshot) => {
      setStats(prev => ({ ...prev, totalFriends: snapshot.size }));
    });

    return () => {
      unsubSessions();
      unsubNotes();
      unsubStats();
      unsubNoteStats();
      unsubFriends();
    };
  }, [user]);

  return (
    <div className="space-y-12">
      <header>
        <motion.h1 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl font-serif text-[#1a1a1a]"
        >
          Hello, {profile?.displayName?.split(' ')[0] || 'Scholar'}
          {profile?.username && (
            <span className="block text-xl font-sans font-medium text-[#5A5A40] mt-2 tracking-tight">
              @{profile.username}
            </span>
          )}
        </motion.h1>
        <p className="text-[#5A5A40] mt-3 text-lg italic">"Education is the most powerful weapon which you can use to change the world."</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upcoming Session Card */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#E5E5E0] relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 text-[#F5F5F0]">
            <Calendar size={120} strokeWidth={1} />
          </div>
          <div className="relative z-10">
            <h3 className="text-xl font-serif font-bold mb-6 flex items-center gap-2">
              <Clock className="text-[#5A5A40]" size={20} />
              Next Study Session
            </h3>
            {upcomingSession ? (
              <div className="space-y-4">
                <div>
                  <p className="text-4xl font-serif font-bold text-[#1a1a1a]">{upcomingSession.subject}</p>
                  <p className="text-[#5A5A40] text-lg mt-1">
                    {format(parseISO(upcomingSession.startTime), 'EEEE, MMMM do')}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#F5F5F0] rounded-full text-[#5A5A40] font-medium">
                  <Clock size={16} />
                  {format(parseISO(upcomingSession.startTime), 'h:mm a')} - {format(parseISO(upcomingSession.endTime), 'h:mm a')}
                </div>
              </div>
            ) : (
              <div className="py-8">
                <p className="text-[#5A5A40] italic">No sessions planned. Ready for a break?</p>
                <button className="mt-4 text-[#5A5A40] font-bold flex items-center gap-2 hover:gap-3 transition-all">
                  Schedule one now <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats Card */}
        <div className="bg-[#5A5A40] p-8 rounded-[2.5rem] shadow-lg text-white flex flex-col justify-between">
          <h3 className="text-xl font-serif font-bold mb-8 flex items-center gap-2">
            <TrendingUp size={20} />
            Study Progress
          </h3>
          <div className="space-y-8">
            <div>
              <p className="text-4xl font-serif font-bold">{stats.completedSessions}</p>
              <p className="text-white/70 text-sm uppercase tracking-widest font-medium mt-1">Sessions Completed</p>
            </div>
            <div>
              <p className="text-4xl font-serif font-bold">{stats.totalNotes}</p>
              <p className="text-white/70 text-sm uppercase tracking-widest font-medium mt-1">Notes Created</p>
            </div>
            <div>
              <p className="text-4xl font-serif font-bold">{stats.totalFriends}</p>
              <p className="text-white/70 text-sm uppercase tracking-widest font-medium mt-1">Friends Connected</p>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-xs text-white/50 italic">Keep up the great work!</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Recent Notes */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#E5E5E0]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-serif font-bold flex items-center gap-2">
              <BookOpen className="text-[#5A5A40]" size={20} />
              Recent Notes
            </h3>
            <button className="text-sm font-bold text-[#5A5A40] hover:underline">View all</button>
          </div>
          <div className="space-y-4">
            {recentNotes.length > 0 ? (
              recentNotes.map(note => (
                <div key={note.id} className="p-4 bg-[#F5F5F0] rounded-2xl hover:bg-[#E5E5E0] transition-colors cursor-pointer group">
                  <h4 className="font-bold text-[#1a1a1a] group-hover:text-[#5A5A40] transition-colors">{note.title}</h4>
                  <p className="text-xs text-[#5A5A40] mt-1">{format(parseISO(note.lastModified), 'MMM d, yyyy')}</p>
                </div>
              ))
            ) : (
              <p className="text-[#5A5A40] italic text-sm">No notes yet. Start capturing your thoughts!</p>
            )}
          </div>
        </div>

        {/* Quick Tips (AI Powered Idea) */}
        <div className="bg-[#F5F5F0] p-8 rounded-[2.5rem] border border-[#E5E5E0]">
          <h3 className="text-xl font-serif font-bold text-[#5A5A40] mb-6">Study Tip of the Day</h3>
          <div className="bg-white p-6 rounded-2xl shadow-sm italic text-[#1a1a1a] leading-relaxed">
            "Active recall is more effective than passive reading. Try to summarize what you've learned without looking at your notes."
          </div>
          <p className="text-[10px] text-[#5A5A40] uppercase tracking-widest font-bold mt-4 text-center">Powered by AI</p>
        </div>
      </div>
    </div>
  );
}
