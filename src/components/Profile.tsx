import { useState, useEffect } from 'react';
import { useAuth, handleFirestoreError } from '../App';
import { db } from '../firebase';
import { doc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { UserProfile, OperationType, StudySession } from '../types';
import { User, Book, MapPin, Hash, TrendingUp, Save, Edit2, X, Plus, Trash2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { differenceInMinutes, parseISO } from 'date-fns';

export default function Profile() {
  const { user, profile, showToast } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<UserProfile | null>(null);
  const [newCourse, setNewCourse] = useState('');
  const [totalStudyHours, setTotalStudyHours] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);

  useEffect(() => {
    if (profile) {
      setEditedProfile({ ...profile });
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;

    const sessionsRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(sessionsRef, where('status', '==', 'completed'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => doc.data() as StudySession);
      setTotalSessions(sessions.length);
      const totalMinutes = sessions.reduce((acc, session) => {
        const start = parseISO(session.startTime);
        const end = parseISO(session.endTime);
        return acc + Math.max(0, differenceInMinutes(end, start));
      }, 0);
      setTotalStudyHours(parseFloat((totalMinutes / 60).toFixed(1)));
    });

    return () => unsubscribe();
  }, [user]);

  if (!profile || !editedProfile) return null;

  const handleSave = async () => {
    if (!user) return;
    try {
      const updates = {
        displayName: editedProfile.displayName,
        username: editedProfile.username,
        age: editedProfile.age,
        studyPlace: editedProfile.studyPlace,
        courses: editedProfile.courses || [],
        studyProgress: editedProfile.studyProgress || ''
      };

      // Update private profile
      await updateDoc(doc(db, 'users', user.uid), updates);
      
      // Update public profile
      const publicQuery = query(collection(db, 'users_public'), where('uid', '==', user.uid));
      const publicSnap = await getDocs(publicQuery);
      if (!publicSnap.empty) {
        await updateDoc(doc(db, 'users_public', publicSnap.docs[0].id), updates);
      }

      setIsEditing(false);
      showToast('Profile updated successfully!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      showToast('Failed to update profile', 'error');
    }
  };

  const addCourse = () => {
    if (newCourse.trim()) {
      setEditedProfile({
        ...editedProfile,
        courses: [...(editedProfile.courses || []), newCourse.trim()]
      });
      setNewCourse('');
    }
  };

  const removeCourse = (index: number) => {
    const updatedCourses = [...(editedProfile.courses || [])];
    updatedCourses.splice(index, 1);
    setEditedProfile({
      ...editedProfile,
      courses: updatedCourses
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-serif text-[#1a1a1a]">My Profile</h1>
        <button
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          className="flex items-center gap-2 px-6 py-2 bg-[#5A5A40] text-white rounded-full hover:bg-[#4A4A30] transition-all shadow-md"
        >
          {isEditing ? (
            <>
              <Save size={18} />
              <span>Save Changes</span>
            </>
          ) : (
            <>
              <Edit2 size={18} />
              <span>Edit Profile</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Identity */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-[#E5E5E0] shadow-sm text-center">
            <div className="relative inline-block mb-4">
              <div className="w-32 h-32 rounded-full bg-[#5A5A40] flex items-center justify-center text-white text-4xl font-bold mx-auto border-4 border-[#F5F5F0]">
                {profile.photoURL ? (
                  <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  profile.displayName?.[0] || 'U'
                )}
              </div>
            </div>
            
            {isEditing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editedProfile.displayName || ''}
                  onChange={e => setEditedProfile({ ...editedProfile, displayName: e.target.value })}
                  placeholder="Display Name"
                  className="w-full px-4 py-2 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none text-center font-bold"
                />
                <div className="flex items-center gap-1 justify-center text-[#5A5A40]">
                  <span>@</span>
                  <input
                    type="text"
                    value={editedProfile.username || ''}
                    onChange={e => setEditedProfile({ ...editedProfile, username: e.target.value })}
                    placeholder="username"
                    className="w-32 px-2 py-1 bg-[#F5F5F0] rounded-lg border-none focus:ring-2 focus:ring-[#5A5A40] outline-none text-sm"
                  />
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-serif font-bold text-[#1a1a1a]">{profile.displayName}</h2>
                <p className="text-[#5A5A40]">@{profile.username || 'no-username'}</p>
              </>
            )}
            
            <div className="mt-6 pt-6 border-t border-[#F5F5F0] flex justify-around text-sm text-[#5A5A40]">
              <div className="text-center">
                <p className="font-bold text-[#1a1a1a]">{profile.courses?.length || 0}</p>
                <p className="text-[10px] uppercase tracking-wider">Courses</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-[#1a1a1a]">{totalStudyHours}</p>
                <p className="text-[10px] uppercase tracking-wider">Hours</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-[#1a1a1a]">{totalSessions}</p>
                <p className="text-[10px] uppercase tracking-wider">Sessions</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-[#1a1a1a]">{profile.age || '-'}</p>
                <p className="text-[10px] uppercase tracking-wider">Age</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-[#E5E5E0] shadow-sm space-y-4">
            <h3 className="font-serif font-bold text-[#1a1a1a] flex items-center gap-2">
              <Hash size={18} className="text-[#5A5A40]" />
              Details
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#5A5A40] block mb-1">Age</label>
                {isEditing ? (
                  <input
                    type="number"
                    value={editedProfile.age || ''}
                    onChange={e => setEditedProfile({ ...editedProfile, age: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                  />
                ) : (
                  <p className="text-[#1a1a1a] font-medium">{profile.age || 'Not specified'}</p>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#5A5A40] block mb-1">Studying At</label>
                {isEditing ? (
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5A40]" size={16} />
                    <input
                      type="text"
                      value={editedProfile.studyPlace || ''}
                      onChange={e => setEditedProfile({ ...editedProfile, studyPlace: e.target.value })}
                      placeholder="University, Library, etc."
                      className="w-full pl-10 pr-4 py-2 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[#1a1a1a] font-medium">
                    <MapPin size={16} className="text-[#5A5A40]" />
                    <span>{profile.studyPlace || 'Not specified'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Courses & Progress */}
        <div className="md:col-span-2 space-y-8">
          <section className="bg-white p-8 rounded-[32px] border border-[#E5E5E0] shadow-sm">
            <h3 className="text-xl font-serif font-bold text-[#1a1a1a] mb-6 flex items-center gap-2">
              <Book size={20} className="text-[#5A5A40]" />
              Current Courses
            </h3>

            {isEditing && (
              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={newCourse}
                  onChange={e => setNewCourse(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCourse()}
                  placeholder="Add a course..."
                  className="flex-1 px-4 py-2 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                />
                <button
                  onClick={addCourse}
                  className="p-2 bg-[#5A5A40] text-white rounded-xl hover:bg-[#4A4A30] transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AnimatePresence mode="popLayout">
                {(isEditing ? editedProfile.courses : profile.courses)?.map((course, index) => (
                  <motion.div
                    key={index}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex justify-between items-center p-4 bg-[#F5F5F0] rounded-2xl group"
                  >
                    <span className="font-medium text-[#1a1a1a]">{course}</span>
                    {isEditing && (
                      <button
                        onClick={() => removeCourse(index)}
                        className="text-[#5A5A40] hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {(!isEditing && (!profile.courses || profile.courses.length === 0)) && (
                <p className="text-[#5A5A40] italic py-4">No courses added yet.</p>
              )}
            </div>
          </section>

          <section className="bg-white p-8 rounded-[32px] border border-[#E5E5E0] shadow-sm">
            <h3 className="text-xl font-serif font-bold text-[#1a1a1a] mb-6 flex items-center gap-2">
              <TrendingUp size={20} className="text-[#5A5A40]" />
              Study Progress
            </h3>
            
            {isEditing ? (
              <textarea
                value={editedProfile.studyProgress || ''}
                onChange={e => setEditedProfile({ ...editedProfile, studyProgress: e.target.value })}
                placeholder="How is your studying going? What are your goals?"
                className="w-full h-40 px-4 py-4 bg-[#F5F5F0] rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] outline-none resize-none"
              />
            ) : (
              <div className="prose prose-stone max-w-none">
                <p className="text-[#1a1a1a] leading-relaxed whitespace-pre-wrap">
                  {profile.studyProgress || 'No progress notes shared yet. Click edit to add your study goals and progress!'}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
