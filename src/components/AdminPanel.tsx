import { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  getDocs, 
  updateDoc, 
  doc, 
  deleteDoc,
  where,
  limit
} from 'firebase/firestore';
import { UserProfile, PublicResource } from '../types';
import { 
  Shield, 
  Users, 
  Ban, 
  Trash2, 
  Search, 
  AlertCircle,
  CheckCircle,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';

export default function AdminPanel() {
  const { profile, showToast } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [resources, setResources] = useState<PublicResource[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (profile?.role === 'admin' || profile?.email === 'soojiaquan@gmail.com') {
      fetchData();
    }
  }, [profile]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const usersSnap = await getDocs(query(collection(db, 'users'), limit(50)));
      setUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));

      const resourcesSnap = await getDocs(query(collection(db, 'public_resources'), limit(50)));
      setResources(resourcesSnap.docs.map(d => ({ id: d.id, ...d.data() } as PublicResource)));
    } catch (error) {
      console.error("Failed to fetch admin data", error);
      showToast("Failed to fetch administrative data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBan = async (user: UserProfile) => {
    try {
      const newBannedStatus = !user.isBanned;
      await updateDoc(doc(db, 'users', user.uid), {
        isBanned: newBannedStatus
      });
      // Also update public profile
      await updateDoc(doc(db, 'users_public', user.uid), {
        isBanned: newBannedStatus
      });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, isBanned: newBannedStatus } : u));
      showToast(`User ${newBannedStatus ? 'banned' : 'unbanned'} successfully`, "success");
    } catch (error) {
      console.error("Failed to toggle ban", error);
      showToast("Failed to update user status", "error");
    }
  };

  const deleteResource = async (resourceId: string) => {
    if (!window.confirm("Are you sure you want to delete this resource?")) return;
    try {
      await deleteDoc(doc(db, 'public_resources', resourceId));
      setResources(prev => prev.filter(r => r.id !== resourceId));
      showToast("Resource deleted successfully", "success");
    } catch (error) {
      console.error("Failed to delete resource", error);
      showToast("Failed to delete resource", "error");
    }
  };

  if (profile?.role !== 'admin' && profile?.email !== 'soojiaquan@gmail.com') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5A5A40]">
        <Shield size={64} className="mb-4 opacity-20" />
        <h2 className="text-2xl font-serif font-bold">Access Denied</h2>
        <p className="italic">Administrative privileges required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#5A5A40] text-white rounded-2xl">
          <Shield size={32} />
        </div>
        <div>
          <h1 className="text-4xl font-serif font-bold text-[#1a1a1a]">Admin Panel</h1>
          <p className="text-[#5A5A40] italic">Manage users and community content.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* User Management */}
        <section className="bg-white p-8 rounded-[40px] border border-[#E5E5E0] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-serif font-bold text-[#1a1a1a] flex items-center gap-2">
              <Users size={24} className="text-[#5A5A40]" />
              User Management
            </h2>
            <span className="text-xs font-bold px-3 py-1 bg-[#F5F5F0] rounded-full text-[#5A5A40]">
              {users.length} Total
            </span>
          </div>

          <div className="space-y-4">
            {users.map(user => (
              <div key={user.uid} className="p-4 bg-[#F5F5F0] rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#5A5A40] flex items-center justify-center text-white font-bold">
                    {user.username?.[0] || user.displayName?.[0] || '?'}
                  </div>
                  <div>
                    <p className="font-bold text-[#1a1a1a]">@{user.username || 'no_username'}</p>
                    <p className="text-xs text-[#5A5A40]">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {user.email === 'soojiaquan@gmail.com' ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] px-2 py-1 bg-white rounded-lg">
                      Super Admin
                    </span>
                  ) : (
                    <button 
                      onClick={() => toggleBan(user)}
                      className={`p-2 rounded-xl transition-all ${
                        user.isBanned 
                          ? "bg-red-100 text-red-600 hover:bg-red-200" 
                          : "bg-white text-[#5A5A40] hover:bg-[#5A5A40] hover:text-white"
                      }`}
                      title={user.isBanned ? "Unban User" : "Ban User"}
                    >
                      <Ban size={20} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Content Moderation */}
        <section className="bg-white p-8 rounded-[40px] border border-[#E5E5E0] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-serif font-bold text-[#1a1a1a] flex items-center gap-2">
              <FileText size={24} className="text-[#5A5A40]" />
              Content Moderation
            </h2>
            <span className="text-xs font-bold px-3 py-1 bg-[#F5F5F0] rounded-full text-[#5A5A40]">
              {resources.length} Shared
            </span>
          </div>

          <div className="space-y-4">
            {resources.map(resource => (
              <div key={resource.id} className="p-4 bg-[#F5F5F0] rounded-2xl flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-4">
                  <p className="font-bold text-[#1a1a1a] truncate">{resource.title}</p>
                  <p className="text-xs text-[#5A5A40]">By @{resource.authorName} • {resource.type}</p>
                </div>
                <button 
                  onClick={() => deleteResource(resource.id)}
                  className="p-2 bg-white text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                  title="Delete Resource"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="bg-amber-50 border border-amber-100 p-6 rounded-[32px] flex items-start gap-4">
        <AlertCircle className="text-amber-600 shrink-0" size={24} />
        <div>
          <h4 className="font-bold text-amber-900">Administrative Notice</h4>
          <p className="text-sm text-amber-800 leading-relaxed">
            As an administrator, you have the power to restrict user access and remove community content. 
            Please use these tools responsibly to maintain a safe and productive learning environment.
          </p>
        </div>
      </div>
    </div>
  );
}
