import { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, handleFirestoreError } from '../App';
import { StudySession, OperationType } from '../types';
import { Plus, Trash2, CheckCircle, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { format, isToday, isFuture, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';

export default function Scheduler() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newSession, setNewSession] = useState({
    subject: '',
    startTime: '',
    endTime: '',
  });

  useEffect(() => {
    if (!user) return;

    const sessionsRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(sessionsRef, orderBy('startTime', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessionData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StudySession[];
      setSessions(sessionData);
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/sessions`));

    return () => unsubscribe();
  }, [user]);

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const sessionData = {
        ...newSession,
        status: 'planned',
        startTime: new Date(newSession.startTime).toISOString(),
        endTime: new Date(newSession.endTime).toISOString(),
      };
      await addDoc(collection(db, 'users', user.uid, 'sessions'), sessionData);
      setIsAdding(false);
      setNewSession({ subject: '', startTime: '', endTime: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/sessions`);
    }
  };

  const toggleStatus = async (session: StudySession) => {
    if (!user) return;
    const newStatus = session.status === 'completed' ? 'planned' : 'completed';
    try {
      await updateDoc(doc(db, 'users', user.uid, 'sessions', session.id), {
        status: newStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/sessions/${session.id}`);
    }
  };

  const deleteSession = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'sessions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/sessions/${id}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-serif text-[#1a1a1a]">Study Schedule</h1>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#5A5A40] text-white rounded-full font-medium shadow-lg hover:bg-[#4A4A30] transition-all"
        >
          <Plus size={20} />
          Plan Session
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white p-6 rounded-3xl border border-[#E5E5E0] shadow-sm overflow-hidden"
          >
            <form onSubmit={handleAddSession} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#5A5A40] mb-1">Subject</label>
                <input 
                  required
                  type="text"
                  value={newSession.subject}
                  onChange={e => setNewSession({...newSession, subject: e.target.value})}
                  className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                  placeholder="e.g. Advanced Calculus"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5A5A40] mb-1">Start Time</label>
                <input 
                  required
                  type="datetime-local"
                  value={newSession.startTime}
                  onChange={e => setNewSession({...newSession, startTime: e.target.value})}
                  className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5A5A40] mb-1">End Time</label>
                <input 
                  required
                  type="datetime-local"
                  value={newSession.endTime}
                  onChange={e => setNewSession({...newSession, endTime: e.target.value})}
                  className="w-full p-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                />
              </div>
              <div className="md:col-span-2 flex gap-3 justify-end mt-4">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-6 py-2 text-[#5A5A40] font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-8 py-2 bg-[#5A5A40] text-white rounded-full font-medium shadow-md hover:bg-[#4A4A30]"
                >
                  Save Session
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-[#E5E5E0]">
            <CalendarIcon className="mx-auto text-[#E5E5E0] mb-4" size={48} />
            <p className="text-[#5A5A40] italic">No sessions planned yet. Time to start learning!</p>
          </div>
        ) : (
          sessions.map((session) => (
            <motion.div 
              layout
              key={session.id}
              className={clsx(
                "bg-white p-6 rounded-3xl border border-[#E5E5E0] shadow-sm flex items-center gap-6 transition-all",
                session.status === 'completed' && "opacity-60 grayscale-[0.5]"
              )}
            >
              <button 
                onClick={() => toggleStatus(session)}
                className={clsx(
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors",
                  session.status === 'completed' 
                    ? "bg-[#5A5A40] border-[#5A5A40] text-white" 
                    : "border-[#E5E5E0] text-transparent hover:border-[#5A5A40]"
                )}
              >
                <CheckCircle size={20} />
              </button>

              <div className="flex-1">
                <h3 className={clsx(
                  "text-xl font-serif font-bold text-[#1a1a1a]",
                  session.status === 'completed' && "line-through"
                )}>
                  {session.subject}
                </h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-[#5A5A40]">
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {format(parseISO(session.startTime), 'MMM d, h:mm a')} - {format(parseISO(session.endTime), 'h:mm a')}
                  </span>
                  {isToday(parseISO(session.startTime)) && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] uppercase font-bold tracking-wider">
                      Today
                    </span>
                  )}
                </div>
              </div>

              <button 
                onClick={() => deleteSession(session.id)}
                className="p-2 text-[#E5E5E0] hover:text-red-500 transition-colors"
              >
                <Trash2 size={20} />
              </button>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
