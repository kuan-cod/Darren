import { useState, useEffect, createContext, useContext, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  orderBy,
  getDocFromServer,
  getDoc,
  runTransaction,
  where
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, OperationType, FirestoreErrorInfo } from './types';
import { BookOpen, Calendar, LayoutDashboard, LogOut, Plus, Search, Settings, User as UserIcon, Users, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Dashboard from './components/Dashboard';
import Scheduler from './components/Scheduler';
import Notes from './components/Notes';
import Social from './components/Social';
import Profile from './components/Profile';
import StudyHub from './components/StudyHub';
import AdminPanel from './components/AdminPanel';
import { Shield } from 'lucide-react';

// Utility for tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Context for Auth
const AuthContext = createContext<{
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  navigateToNote: (noteId: string, ownerId: string) => void;
  navigationRequest: { noteId: string; ownerId: string } | null;
  clearNavigationRequest: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}>({ 
  user: null, 
  profile: null, 
  loading: true, 
  navigateToNote: () => {}, 
  navigationRequest: null,
  clearNavigationRequest: () => {},
  showToast: () => {}
});

export const useAuth = () => useContext(AuthContext);

// Error Handler
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Error Boundary Component
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.includes('operationType')) {
        try {
          const info = JSON.parse(event.error.message);
          setErrorMessage(`Permission Denied: ${info.operationType} on ${info.path}`);
        } catch {
          setErrorMessage(event.error.message);
        }
        setHasError(true);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Application Error</h2>
          <p className="text-gray-600 mb-6">{errorMessage || "Something went wrong with the database connection."}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Username Setup Component
function UsernameSetup({ user, profile }: { user: User, profile: UserProfile }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  const checkAvailability = async (val: string) => {
    if (val.length < 3) {
      setIsAvailable(null);
      return;
    }
    const docRef = doc(db, 'usernames', val.toLowerCase());
    const docSnap = await getDoc(docRef);
    setIsAvailable(!docSnap.exists());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || username.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const lowerUsername = username.toLowerCase();
      const usernameDocRef = doc(db, 'usernames', lowerUsername);
      const userDocRef = doc(db, 'users', user.uid);
      const publicDocRef = doc(db, 'users_public', user.uid);

      await runTransaction(db, async (transaction) => {
        const usernameDoc = await transaction.get(usernameDocRef);
        if (usernameDoc.exists()) {
          throw new Error('Username is already taken.');
        }

        transaction.set(usernameDocRef, { uid: user.uid });
        transaction.update(userDocRef, { username: lowerUsername });
        transaction.update(publicDocRef, { username: lowerUsername });
      });
    } catch (err: any) {
      setError(err.message || 'Failed to set username.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-xl border border-[#E5E5E0]"
      >
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif font-bold text-[#1a1a1a] mb-2">Choose your username</h2>
          <p className="text-[#5A5A40] italic">This is how your friends will find you.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <input 
              type="text"
              value={username}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
                setUsername(val);
                checkAvailability(val);
              }}
              placeholder="username"
              className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] transition-all text-lg font-mono"
              disabled={loading}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {isAvailable === true && <Check className="text-emerald-600" size={20} />}
              {isAvailable === false && <AlertCircle className="text-red-500" size={20} />}
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm px-2 flex items-center gap-2">
              <AlertCircle size={14} />
              {error}
            </p>
          )}

          <button 
            type="submit"
            disabled={loading || isAvailable === false || username.length < 3}
            className="w-full py-4 bg-[#5A5A40] text-white rounded-full font-medium shadow-lg hover:bg-[#4A4A30] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
          >
            {loading ? 'Setting up...' : 'Get Started'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// Main App Component
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scheduler' | 'notes' | 'social' | 'profile' | 'studyhub' | 'admin'>('dashboard');
  const [navigationRequest, setNavigationRequest] = useState<{ noteId: string; ownerId: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const navigateToNote = (noteId: string, ownerId: string) => {
    setNavigationRequest({ noteId, ownerId });
    setActiveTab('notes');
  };

  const clearNavigationRequest = () => setNavigationRequest(null);

  const prevFriendshipsRef = useRef<string[]>([]);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (!user) {
      prevFriendshipsRef.current = [];
      isInitialLoadRef.current = true;
      return;
    }

    const friendshipsRef = collection(db, 'friendships');
    const q = query(friendshipsRef, where('users', 'array-contains', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const currentIds = snapshot.docs.map(d => d.id);
      
      // Only check for new requests after initial load
      if (!isInitialLoadRef.current) {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.requesterId === user.uid) {
              showToast('Friend request sent!', 'success');
            } else {
              // Fetch requester username
              try {
                const profileSnap = await getDoc(doc(db, 'users_public', data.requesterId));
                if (profileSnap.exists()) {
                  const requester = profileSnap.data() as UserProfile;
                  showToast(`New request from @${requester.username || requester.displayName}`, 'info');
                } else {
                  showToast('New friend request received!', 'info');
                }
              } catch (e) {
                showToast('New friend request received!', 'info');
              }
            }
          } else if (change.type === 'modified') {
            const data = change.doc.data();
            if (data.status === 'accepted') {
              showToast('Friend request accepted!', 'success');
            }
          } else if (change.type === 'removed') {
            const data = change.doc.data();
            if (data.status === 'pending') {
              if (data.requesterId === user.uid) {
                showToast('Friend request declined', 'error');
              } else {
                showToast('Friend request cancelled', 'info');
              }
            } else if (data.status === 'accepted') {
              showToast('Friendship ended', 'info');
            }
          }
        });
      }

      prevFriendshipsRef.current = currentIds;
      isInitialLoadRef.current = false;
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const publicDocRef = doc(db, 'users_public', currentUser.uid);
        
        // Test connection
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Firebase configuration error: client is offline.");
          }
        }

        // Setup profile listener
        onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setProfile(data);
            // Sync to public profile
            setDoc(publicDocRef, {
              uid: data.uid,
              displayName: data.displayName,
              email: data.email,
              username: data.username || null,
              photoURL: currentUser.photoURL,
              createdAt: data.createdAt
            }, { merge: true });
          } else {
            // Create profile if it doesn't exist
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
              createdAt: new Date().toISOString(),
            };
            setDoc(userDocRef, newProfile).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}`));
            setDoc(publicDocRef, newProfile).catch(e => handleFirestoreError(e, OperationType.WRITE, `users_public/${currentUser.uid}`));
          }
        }, (error) => handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`));
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const isAdmin = profile?.role === 'admin' || profile?.email === 'soojiaquan@gmail.com';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-2xl font-serif italic text-[#5A5A40]"
        >
          Darren
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="mb-8">
            <h1 className="text-6xl font-serif font-light text-[#1a1a1a] mb-4">Darren</h1>
            <p className="text-[#5A5A40] italic">Your companion for structured learning.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-[#5A5A40] text-white rounded-full font-medium shadow-lg hover:bg-[#4A4A30] transition-all flex items-center justify-center gap-3"
          >
            <UserIcon size={20} />
            Continue with Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (user && profile && !profile.username) {
    return <UsernameSetup user={user} profile={profile} />;
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      navigateToNote, 
      navigationRequest, 
      clearNavigationRequest,
      showToast
    }}>
      <ErrorBoundary>
        <div className="min-h-screen bg-[#F5F5F0] flex">
          {/* Toast Notification */}
          <AnimatePresence>
            {toast && (
              <motion.div 
                initial={{ opacity: 0, y: 50, x: '-50%' }}
                animate={{ opacity: 1, y: 0, x: '-50%' }}
                exit={{ opacity: 0, y: 50, x: '-50%' }}
                className={cn(
                  "fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border min-w-[300px]",
                  toast.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
                  toast.type === 'error' ? "bg-red-50 border-red-100 text-red-800" :
                  "bg-white border-[#E5E5E0] text-[#5A5A40]"
                )}
              >
                {toast.type === 'success' && <Check size={18} />}
                {toast.type === 'error' && <AlertCircle size={18} />}
                {toast.type === 'info' && <Users size={18} />}
                <span className="font-medium">{toast.message}</span>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-[#E5E5E0] flex flex-col">
            <div className="p-8">
              <h2 className="text-2xl font-serif font-bold text-[#1a1a1a]">Darren</h2>
            </div>
            
              <nav className="flex-1 px-4 space-y-2">
                <NavItem 
                  icon={<LayoutDashboard size={20} />} 
                  label="Dashboard" 
                  active={activeTab === 'dashboard'} 
                  onClick={() => setActiveTab('dashboard')} 
                />
                <NavItem 
                  icon={<Calendar size={20} />} 
                  label="Scheduler" 
                  active={activeTab === 'scheduler'} 
                  onClick={() => setActiveTab('scheduler')} 
                />
                <NavItem 
                  icon={<BookOpen size={20} />} 
                  label="Notes" 
                  active={activeTab === 'notes'} 
                  onClick={() => setActiveTab('notes')} 
                />
                <NavItem 
                  icon={<Search size={20} />} 
                  label="Study Hub" 
                  active={activeTab === 'studyhub'} 
                  onClick={() => setActiveTab('studyhub')} 
                />
                <NavItem 
                  icon={<Users size={20} />} 
                  label="Social" 
                  active={activeTab === 'social'} 
                  onClick={() => setActiveTab('social')} 
                />
                <NavItem 
                  icon={<UserIcon size={20} />} 
                  label="Profile" 
                  active={activeTab === 'profile'} 
                  onClick={() => setActiveTab('profile')} 
                />
                {isAdmin && (
                  <NavItem 
                    icon={<Shield size={20} />} 
                    label="Admin Panel" 
                    active={activeTab === 'admin'} 
                    onClick={() => setActiveTab('admin')} 
                  />
                )}
              </nav>

            <div className="p-4 border-t border-[#E5E5E0]">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F0] mb-4">
                <div className="w-10 h-10 rounded-full bg-[#5A5A40] flex items-center justify-center text-white font-bold">
                  {user.displayName?.[0] || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1a1a1a] truncate">{user.displayName}</p>
                  <p className="text-xs text-[#5A5A40] truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-3 text-[#5A5A40] hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
              >
                <LogOut size={20} />
                <span className="text-sm font-medium">Log Out</span>
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'dashboard' && <Dashboard />}
                {activeTab === 'scheduler' && <Scheduler />}
                {activeTab === 'notes' && <Notes />}
                {activeTab === 'studyhub' && <StudyHub />}
                {activeTab === 'social' && <Social />}
                {activeTab === 'profile' && <Profile />}
                {activeTab === 'admin' && <AdminPanel />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </ErrorBoundary>
    </AuthContext.Provider>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200",
        active 
          ? "bg-[#5A5A40] text-white shadow-md" 
          : "text-[#5A5A40] hover:bg-[#F5F5F0]"
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

