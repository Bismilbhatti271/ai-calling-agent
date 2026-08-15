'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { AdminRoute } from '@/components/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { api, AdminUser } from '@/lib/api';
import { Plus, Trash2, Edit2, Mail, Phone, Calendar, Copy, RotateCw, Loader, RefreshCw } from 'lucide-react';

export default function AdminUsersPage() {
  const { user: adminUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'user' as 'admin' | 'user',
    status: 'active' as 'active' | 'inactive',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsers = useCallback(async (isManualRefresh = false) => {
    try {
      const data = await api.users.list();
      setUsers(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(() => fetchUsers(), 5000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUsers(true);
  };

  const handleOpenModal = (u?: AdminUser) => {
    if (u) {
      setEditingId(u.id);
      setFormData({
        name: u.name,
        email: u.email,
        password: '',
        phone: u.phone,
        role: u.role,
        status: u.status,
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', email: '', password: '', phone: '', role: 'user', status: 'active' });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', email: '', password: '', phone: '', role: 'user', status: 'active' });
  };

  const handleSaveUser = async () => {
    if (!formData.name || !formData.email || (!editingId && !formData.password)) {
      setMessage({ type: 'error', text: editingId ? 'Name and email are required' : 'All fields are required' });
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.users.update(editingId, {
          name: formData.name,
          email: formData.email,
          ...(formData.password ? { password: formData.password } : {}),
          role: formData.role,
          phone: formData.phone,
          status: formData.status,
        });
        setMessage({ type: 'success', text: 'User updated successfully!' });
      } else {
        await api.users.create(formData);
        setMessage({ type: 'success', text: 'User created successfully!' });
      }
      fetchUsers();
      handleCloseModal();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Operation failed' });
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.users.delete(id);
      fetchUsers();
      setMessage({ type: 'success', text: 'User deleted successfully!' });
      if (selectedUser?.id === id) setSelectedUser(null);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Delete failed' });
    }
    setDeletingId(null);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCopyCredentials = (email: string) => {
    navigator.clipboard.writeText(email);
    setMessage({ type: 'success', text: 'Email copied to clipboard!' });
    setTimeout(() => setMessage(null), 2000);
  };

  return (
    <AdminRoute>
      <MainLayout title="User Management" breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Users' }]}>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">User Management</h1>
              <p className="text-muted-foreground mt-1">Manage platform users and their credentials</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleRefresh} disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-sm font-medium transition-colors disabled:opacity-40">
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <button onClick={() => handleOpenModal()}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors">
                <Plus size={20} /> Add User
              </button>
            </div>
          </div>

          <Card>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RotateCw size={24} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Name</th>
                      <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Email</th>
                      <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Role</th>
                      <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Status</th>
                      <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Created</th>
                      <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}
                        className="border-b border-border hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => setSelectedUser(u)}>
                        <td className="px-6 py-4 font-medium">{u.name}</td>
                        <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                        <td className="px-6 py-4">
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={u.status === 'active' ? 'success' : 'error'}>{u.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {u.id !== 1 ? (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); handleOpenModal(u); }}
                                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground" title="Edit user">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id); }} disabled={deletingId === u.id}
                                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-40" title="Delete user">
                                  {deletingId === u.id ? <RotateCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-yellow-500 font-medium px-2">Primary Admin</span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleCopyCredentials(u.email); }}
                              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground" title="Copy email">
                              <Copy size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && <p className="text-center text-gray-500 py-12">No users found.</p>}
              </div>
            )}
          </Card>

          {selectedUser && (
            <Card>
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold">User Details</h3>
                  <button onClick={() => setSelectedUser(null)} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col items-center">
                    <img src={selectedUser.avatar} alt={selectedUser.name} className="w-24 h-24 rounded-lg mb-4" />
                    <h4 className="text-lg font-semibold">{selectedUser.name}</h4>
                    <Badge className="mt-2" variant={selectedUser.role === 'admin' ? 'default' : 'secondary'}>{selectedUser.role}</Badge>
                    {selectedUser.id === 1 && <span className="text-xs text-yellow-500 mt-1">Primary Admin</span>}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail size={18} className="text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium">{selectedUser.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone size={18} className="text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-medium">{selectedUser.phone || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar size={18} className="text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Joined</p>
                        <p className="font-medium">{new Date(selectedUser.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
                {selectedUser.about && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">About</p>
                    <p className="text-sm">{selectedUser.about}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {showModal && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-md">
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit User' : 'Create New User'}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Full Name</label>
                      <input type="text" name="name" value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                        placeholder="John Doe" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Email</label>
                      <input type="email" name="email" value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                        placeholder="user@empirex.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">{editingId ? 'New Password (leave blank to keep)' : 'Password'}</label>
                      <input type="password" name="password" value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                        placeholder={editingId ? 'Leave blank to keep current' : '••••••••'} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Phone</label>
                      <input type="tel" name="phone" value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
                        placeholder="+1-555-0100" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Role</label>
                        <select name="role" value={formData.role}
                          onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                          className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors">
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      {editingId && (
                        <div>
                          <label className="block text-sm font-medium mb-2">Status</label>
                          <select name="status" value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                            className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary transition-colors">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button onClick={handleCloseModal}
                      className="flex-1 px-4 py-2.5 border border-border text-foreground font-medium rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
                    <button onClick={handleSaveUser} disabled={saving}
                      className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {saving ? <span className="flex items-center justify-center gap-2"><RotateCw size={16} className="animate-spin" /> Saving...</span> : editingId ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {message && (
            <div className={`fixed bottom-6 right-6 px-6 py-3 rounded-lg text-sm font-medium transition-all z-50 ${
              message.type === 'success' ? 'bg-green-500/20 border border-green-500/50 text-green-200' : 'bg-red-500/20 border border-red-500/50 text-red-200'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      </MainLayout>
    </AdminRoute>
  );
}
